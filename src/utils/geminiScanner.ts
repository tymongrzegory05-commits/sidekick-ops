import { createGeminiClient, isGeminiConfigured, resolveGeminiModel } from '@/lib/gemini';

export interface SettlementScanResult {
  employee_name: string;
  date: string;
  declared_cash: number;
  declared_card: number;
  kw_amount: number;
  register_cash: number;
  register_card: number;
  terminal_card: number;
  notes: string;
}

const SETTLEMENT_SYSTEM_INSTRUCTION = `Jesteś precyzyjnym parserem finansowym wyspecjalizowanym w analizie dziennych rozliczeń kasowych sklepów detalicznych.

Otrzymujesz jedno zdjęcie przedstawiające trzy dokumenty leżące obok siebie:
1. Wydruk z kasy fiskalnej (raport dobowy) — dane maszynowe, druk termiczny.
2. Wydruk z terminala płatniczego — dane maszynowe, podsumowanie transakcji kartą.
3. Odręczna karteczka pracownika — imię, data, gotówka w kasetce, kwota na karcie, zwroty/KW, uwagi.

Twoim zadaniem jest wyciągnięcie danych ze WSZYSTKICH trzech dokumentów jednocześnie — zarówno z druku maszynowego, jak i z odręcznego pisma.

Zwróć WYŁĄCZNIE czysty obiekt JSON (bez markdown, bez bloków kodu, bez żadnego dodatkowego tekstu) o dokładnie tych kluczach:
{
  "employee_name": string,
  "date": string,
  "declared_cash": number,
  "declared_card": number,
  "kw_amount": number,
  "register_cash": number,
  "register_card": number,
  "terminal_card": number,
  "notes": string
}

Zasady:
- "employee_name" i "date" odczytaj z odręcznej karteczki. Format daty: YYYY-MM-DD.
- "declared_cash" — gotówka zadeklarowana przez pracownika na karteczce.
- "declared_card" — kwota na karcie zadeklarowana przez pracownika na karteczce.
- "kw_amount" — suma zwrotów/wypłat (KW) zapisana przez pracownika.
- "register_cash" — gotówka wynikająca z raportu dobowego kasy fiskalnej.
- "register_card" — sprzedaż kartą wynikająca z raportu dobowego kasy fiskalnej.
- "terminal_card" — kwota transakcji kartą z wydruku terminala płatniczego.
- "notes" — wszelkie uwagi odręczne pracownika (jeśli brak, zwróć pusty string).
- Jeśli na zdjęciu brakuje którejś kwoty lub jest nieczytelna, wpisz 0.
- Wszystkie kwoty podawaj jako liczby (kropka jako separator dziesiętny), bez symboli walut i spacji.
- Nie dodawaj żadnych komentarzy ani wyjaśnień poza obiektem JSON.`;

// ---------------------------------------------------------------------------
// Kompresja obrazu (Canvas) + bezpieczne kodowanie Base64
// ---------------------------------------------------------------------------
// Surowe zdjęcia z telefonu potrafią ważyć kilka-kilkanaście MB. Wysłanie ich
// wprost do Gemini jako inlineData: (1) drastycznie wydłuża czas odpowiedzi API
// (główna przyczyna "nieskończonego ładowania" w UI), a (2) starą metodą
// btoa(String.fromCharCode(...duża tablica)) potrafi wywalić przeglądarkę
// błędem "Maximum call stack size exceeded" dla dużych plików. Dlatego zawsze
// kompresujemy obraz przez Canvas i kodujemy go przez FileReader, który nie ma
// tego ograniczenia niezależnie od rozmiaru pliku.

const MAX_IMAGE_DIMENSION = 1200;
const JPEG_QUALITY = 0.7;
const REQUEST_TIMEOUT_MS = 45_000;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Nie udało się wczytać zdjęcia. Sprawdź, czy plik nie jest uszkodzony.'));
    };
    img.src = objectUrl;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.slice(result.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.readAsDataURL(blob);
  });
}

/** Kompresuje obraz po stronie klienta (max 1200px, JPEG q=0.7) przed wysłaniem do Gemini. */
async function compressImageForUpload(file: File): Promise<{ base64: string; mimeType: string }> {
  if (!file.type.startsWith('image/')) {
    // Dokumenty inne niż obrazy (np. PDF) nie przechodzą przez Canvas.
    return { base64: await blobToBase64(file), mimeType: file.type || 'application/octet-stream' };
  }

  try {
    const img = await loadImageElement(file);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { base64: await blobToBase64(file), mimeType: file.type || 'image/jpeg' };
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) {
      // Kompresja się nie powiodła — wysyłamy oryginał zamiast blokować cały skan.
      return { base64: await blobToBase64(file), mimeType: file.type || 'image/jpeg' };
    }

    return { base64: await blobToBase64(blob), mimeType: 'image/jpeg' };
  } catch {
    // Awaria kompresji nie powinna blokować skanu — spróbuj z oryginałem.
    return { base64: await blobToBase64(file), mimeType: file.type || 'image/jpeg' };
  }
}

/** Odrzuca zawieszone zapytania po określonym czasie zamiast wieszać UI w nieskończoność. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Przekroczono czas oczekiwania na odpowiedź AI (${label}). Sprawdź połączenie i spróbuj ponownie.`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  return cleaned.trim();
}

function classifyError(msg: string): Error {
  if (msg.toLowerCase().includes('przekroczono czas')) {
    return new Error(msg);
  }
  if (msg.includes('404')) {
    return new Error('Model AI jest obecnie niedostępny (404). Spróbuj ponownie później.');
  }
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota')) {
    return new Error('Limit zapytań do AI został wyczerpany (429). Poczekaj chwilę i spróbuj ponownie.');
  }
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
    return new Error('Błąd sieci przy łączeniu z usługą AI. Sprawdź połączenie i spróbuj ponownie.');
  }
  return new Error(`Błąd zapytania AI: ${msg}`);
}

/** Bezwzględnie waliduje, że odpowiedź AI faktycznie zawiera dane — nigdy nie ufaj "cichemu sukcesowi". */
function assertNonEmptyResponse(rawText: string): void {
  if (!rawText || !rawText.trim()) {
    throw new Error('Model AI zwrócił pustą odpowiedź (możliwa blokada bezpieczeństwa). Spróbuj z innym zdjęciem.');
  }
}

function normalizeDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[^\d,.-]/g, '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeResult(parsed: Record<string, unknown>): SettlementScanResult {
  return {
    employee_name: String(parsed.employee_name ?? '').trim(),
    date: normalizeDate(parsed.date),
    declared_cash: normalizeNumber(parsed.declared_cash),
    declared_card: normalizeNumber(parsed.declared_card),
    kw_amount: normalizeNumber(parsed.kw_amount),
    register_cash: normalizeNumber(parsed.register_cash),
    register_card: normalizeNumber(parsed.register_card),
    terminal_card: normalizeNumber(parsed.terminal_card),
    notes: String(parsed.notes ?? '').trim(),
  };
}

export async function scanSettlementDocument(file: File): Promise<SettlementScanResult> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  try {
    const modelId = await withTimeout(resolveGeminiModel(), REQUEST_TIMEOUT_MS, 'wybór modelu');
    const client = createGeminiClient();

    const model = client.getGenerativeModel({
      model: modelId,
      systemInstruction: SETTLEMENT_SYSTEM_INSTRUCTION,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const { base64: base64Data, mimeType } = await compressImageForUpload(file);

    const result = await withTimeout(
      model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Przeanalizuj załączone zdjęcie i wyciągnij dane rozliczenia kasowego zgodnie z instrukcją systemową.' },
            { inlineData: { mimeType, data: base64Data } },
          ],
        }],
      }),
      REQUEST_TIMEOUT_MS,
      'analiza zdjęcia',
    );
    const response = await result.response;
    const rawText = response.text();
    assertNonEmptyResponse(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = JSON.parse(stripMarkdownFences(rawText));
    }

    return normalizeResult(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  unit_price: number;
  gross_value: number;
  vat_rate: string;
}

export interface ReceiptCancellationScan {
  receipt_number: string;
  receipt_date: string;
  register_unique: string;
  register_evidentiary: string;
  items: ReceiptItem[];
}

const CANCELLATION_SYSTEM_INSTRUCTION = `Jesteś polskim księgowym. Wyciągnij z paragonu: receipt_number, receipt_date (YYYY-MM-DD), register_unique (np. "EA0 2302184798"), register_evidentiary oraz tablicę items. Uważaj na przecinki i kropki w kwotach (zwracaj typ number). Stawki VAT zwracaj jako string, np. "23%", "8%", "5%", "0%", "ZW".

Zwróć WYŁĄCZNIE czysty obiekt JSON (bez markdown, bez bloków kodu, bez żadnego dodatkowego tekstu) o dokładnie tych kluczach:
{
  "receipt_number": string,
  "receipt_date": string,
  "register_unique": string,
  "register_evidentiary": string,
  "items": [
    { "name": string, "qty": number, "unit_price": number, "gross_value": number, "vat_rate": string }
  ]
}

Zasady:
- "receipt_number" — numer paragonu fiskalnego widoczny na wydruku.
- "receipt_date" — data wystawienia paragonu w formacie YYYY-MM-DD.
- "register_unique" — numer unikatowy kasy fiskalnej (np. "EA0 2302184798").
- "register_evidentiary" — numer ewidencyjny kasy fiskalnej.
- "items" — pozycje z paragonu: "name" (nazwa towaru), "qty" (ilość), "unit_price" (cena jednostkowa), "gross_value" (wartość brutto pozycji), "vat_rate" (stawka VAT jako string: "23%", "8%", "5%", "0%" lub "ZW" dla zwolnionych).
- Polskie paragony używają przecinka jako separatora dziesiętnego — zawsze zwracaj liczby w standardowym formacie JSON (kropka), nie myl przecinka z separatorem tysięcy.
- Jeśli jakiejś wartości nie da się odczytać, użyj pustego stringa "" dla tekstu lub 0 dla liczb.
- Nie dodawaj żadnych komentarzy ani wyjaśnień poza obiektem JSON.`;

function normalizeReceiptItem(raw: Record<string, unknown>, index: number): ReceiptItem {
  return {
    id: `ai-item-${index}-${Date.now()}`,
    name: String(raw.name ?? '').trim(),
    qty: normalizeNumber(raw.qty),
    unit_price: normalizeNumber(raw.unit_price),
    gross_value: normalizeNumber(raw.gross_value),
    vat_rate: String(raw.vat_rate ?? '23%').trim(),
  };
}

function normalizeCancellationScan(parsed: Record<string, unknown>): ReceiptCancellationScan {
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  return {
    receipt_number: String(parsed.receipt_number ?? '').trim(),
    receipt_date: normalizeDate(parsed.receipt_date),
    register_unique: String(parsed.register_unique ?? '').trim(),
    register_evidentiary: String(parsed.register_evidentiary ?? '').trim(),
    items: rawItems.map((item, index) => normalizeReceiptItem(item as Record<string, unknown>, index)),
  };
}

export async function scanReceiptForCancellation(file: File): Promise<ReceiptCancellationScan> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  try {
    const modelId = await withTimeout(resolveGeminiModel(), REQUEST_TIMEOUT_MS, 'wybór modelu');
    const client = createGeminiClient();

    const model = client.getGenerativeModel({
      model: modelId,
      systemInstruction: CANCELLATION_SYSTEM_INSTRUCTION,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const { base64: base64Data, mimeType } = await compressImageForUpload(file);

    const result = await withTimeout(
      model.generateContent({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Przeanalizuj załączone zdjęcie paragonu fiskalnego zgodnie z instrukcją systemową.' },
            { inlineData: { mimeType, data: base64Data } },
          ],
        }],
      }),
      REQUEST_TIMEOUT_MS,
      'analiza paragonu',
    );
    const response = await result.response;
    const rawText = response.text();
    assertNonEmptyResponse(rawText);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = JSON.parse(stripMarkdownFences(rawText));
    }

    return normalizeCancellationScan(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}
