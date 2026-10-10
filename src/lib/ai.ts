import { createGeminiClient, isGeminiConfigured, resolveGeminiModel } from '@/lib/gemini';
import type { Audit, ChatMessage, Company } from '@/types';

const SYSTEM_PROMPT = `Jesteś Principal Operational Consultantem i ekspertem analityki biznesowej. Twój cel to ocena procesów operacyjnych i doskonalenia organizacji w warunkach MŚP. Skup się na myśleniu krytycznym, analizie wąskich gardeł oraz tym, jak firma podejmuje decyzje menedżerskie w sytuacjach kryzysowych.

Zasady:
- Zadaj dokładnie JEDNO krótkie pytanie na wiadomość.
- Zadaj MAKSYMALNIE 4 pytania w całej rozmowie.
- Po każdej odpowiedzi użytkownika krótko potwierdź (jedno zdanie) i zadaj kolejne pytanie.
- Twoje pytania muszą diagnozować trzy obszary: (1) Marnowany czas, (2) Przecieki finansowe, (3) Chaos kadrowy/proceduralny.
- KRYTYCZNE: Pytania muszą zbierać KONKRETNE LICZBY, nie ogólnikowe wrażenia. Pytaj o:
  * Ile godzin tygodniowo zespół spędza na manualnych/repetetywnych zadaniach (na pracownika lub łącznie)
  * Miesięczne koszty konkretnych nieefektywności (np. marnowane licencje, nadgodziny, poprawki błędów)
  * Liczbę pracowników dotkniętych wąskimi gardłami procesowymi
  * Wskaźniki błędów lub procent poprawek (rework)
- NIE pytaj ogólnikowo "Jak oceniasz swoją efektywność?" — pytaj "Ile godzin tygodniowo Twój zespół spędza na ręcznym wprowadzaniu danych?"
- Pisz zwięźle i konwersacyjnie.
- Nie dawaj analizy ani rekomendacji, dopóki nie odpowiesz na wszystkie 4 pytania.`;

const GENERATION_PROMPT = `Jesteś Principal Operational Consultantem i ekspertem analityki biznesowej. Na podstawie poniższego zapisu rozmowy i profilu firmy wygeneruj raport audytu operacyjnego.

Zwróć WYŁĄCZNIE obiekt JSON o tej dokładnej strukturze (bez markdown, bez bloków kodu, bez dodatkowego tekstu):
{
  "financial_leak_estimate_pln": number,
  "time_wasted_hours_monthly": number,
  "bottlenecks": [{"area": string, "description": string, "severity": "High" | "Medium" | "Low"}],
  "suggested_tier": "Starter" | "Growth" | "Scale",
  "monthly_price_pln": number,
  "roi_summary": string
}

ZASADY OBLICZANIOWE (stosuj rygorystycznie):

1. financial_leak_estimate_pln — Oblicz miesięczny przeciek finansowy w PLN na podstawie danych z wywiadu:
   - Przelicz dane tygodniowe na miesięczne (pomnóż przez 4.33).
   - Jeśli użytkownik podał godziny: pomnóż godziny przez średnią stawkę 80 PLN/godz dla prac biurowych, 60 PLN/godz dla prac fizycznych, 120 PLN/godz dla ról specjalistycznych/IT.
   - Dodaj bezpośrednie koszty wymienione przez użytkownika (marnowane licencje, nadgodziny, koszty poprawek, itp.).
   - Jeśli użytkownik podał procenty, zastosuj je do bazy. Np. jeśli 30% czasu 50 pracowników marnuje się na manualne zadania: 50 * 0.30 * 160h * 80 PLN = 192,000 PLN/mies — ale skaluj to tylko do CZĘŚCI MARNOWANEJ, nie całej listwy płac.
   - Zaokrąglij do najbliższych 1000 PLN.
   - Jeśli odpowiedzi użytkownika nie zawierają wystarczających danych do obliczeń, użyj employee_count i branży: założ 15% całkowitego kosztu pracy jako marnowane. Średni miesięczny koszt pracownika w Polsce: 8000 PLN. Czyli: employee_count * 8000 * 0.15.

2. time_wasted_hours_monthly — Oblicz łączne godziny marnowane miesięcznie w całej organizacji:
   - Przelicz dane tygodniowe na miesięczne (pomnóż przez 4.33).
   - Jeśli użytkownik podał godziny na pracownika, pomnóż przez liczbę dotkniętych pracowników.
   - Jeśli podano tylko procent: total_hours = employee_count * 160 * percentage_wasted.
   - Zaokrąglij do najbliższej pełnej godziny.

3. bottlenecks — 2-4 konkretne wąskie gardła. Każde musi mieć:
   - "area": krótka etykieta (np. "Ręczne wprowadzanie danych", "Procesy zatwierdzania", "Luki komunikacyjne")
   - "description": 1-2 zdania opisujące wąskie gardło, odnoszące się do konkretnych danych z wywiadu
   - "severity": "High" jeśli wpływ finansowy przekracza 20,000 PLN/mies lub wpływ czasowy przekracza 200 godz/mies, "Medium" jeśli 5,000-20,000 PLN lub 50-200 godz, "Low" w pozostałych przypadkach

4. suggested_tier — Na podstawie employee_count:
   - "Starter" dla <20 pracowników
   - "Growth" dla 20-100 pracowników
   - "Scale" dla >100 pracowników

5. monthly_price_pln — Rekomendowana miesięczna cena usługi w PLN:
   - Starter: 2000-5000 PLN (domyślnie 3000)
   - Growth: 5000-15000 PLN (domyślnie 9000)
   - Scale: 15000-50000 PLN (domyślnie 25000)
   - Zwiększ o 20-50% jeśli financial_leak_estimate przekracza 10x cenę bazową.

6. roi_summary — 2-3 zdania po polsku. Musi zawierać:
   - Stosunek financial_leak_estimate_pln do monthly_price_pln (np. "Usługa zwraca się 12-krotnie")
   - Ile godzin miesięcznie zostanie odzyskanych
   - Konkretną rekomendację opartą na znalezionych wąskich gardłach

Profil firmy:
- Nazwa firmy: {COMPANY_NAME}
- Branża: {INDUSTRY}
- Liczba pracowników: {EMPLOYEE_COUNT}

Zapis rozmowy:`;

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  return cleaned.trim();
}

function classifyError(msg: string): Error {
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

export async function getChatResponse(
  history: ChatMessage[],
): Promise<string> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  const modelId = await resolveGeminiModel();
  const client = createGeminiClient();

  try {
    const model = client.getGenerativeModel({
      model: modelId,
      systemInstruction: SYSTEM_PROMPT,
    });

    const contents = history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const result = await model.generateContent({ contents });
    const response = await result.response;
    return response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}

export async function generateAudit(
  history: ChatMessage[],
  company: Company,
): Promise<Audit> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  const modelId = await resolveGeminiModel();
  const client = createGeminiClient();

  try {
    const model = client.getGenerativeModel({
      model: modelId,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const transcript = history
      .map((m) => `${m.role === 'user' ? 'Użytkownik' : 'Konsultant'}: ${m.text}`)
      .join('\n');

    const fullPrompt = GENERATION_PROMPT
      .replace('{COMPANY_NAME}', company.company_name)
      .replace('{INDUSTRY}', company.industry)
      .replace('{EMPLOYEE_COUNT}', String(company.employee_count))
      + '\n\n' + transcript;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    });
    const response = await result.response;
    const rawText = response.text();

    let parsed: Audit;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const cleaned = stripMarkdownFences(rawText);
      parsed = JSON.parse(cleaned);
    }

    if (!parsed.bottlenecks || !Array.isArray(parsed.bottlenecks)) {
      throw new Error('Nieprawidłowy format audytu: bottlenecks musi być tablicą.');
    }
    if (typeof parsed.financial_leak_estimate_pln !== 'number') {
      throw new Error('Nieprawidłowy format audytu: financial_leak_estimate_pln musi być liczbą.');
    }
    if (typeof parsed.time_wasted_hours_monthly !== 'number') {
      throw new Error('Nieprawidłowy format audytu: time_wasted_hours_monthly musi być liczbą.');
    }

    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}
