import { createGeminiClient, isGeminiConfigured, resolveGeminiModel } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import type { ExtractedDelivery, PendingItem, Product } from '@/types';

const TEXT_EXTRACTION_PROMPT = `Jesteś asystentem magazynowym. Przeanalizuj poniższy dokument dostawy (np. list przewozowy, WZ, faktura) i wyciągnij z niego przychodzące pozycje magazynowe.

Zwróć ŚCIŚLE tablicę JSON o tym formacie (bez markdown, bez bloków kodu, bez dodatkowego tekstu):
[{"sku": "string", "name": "string", "quantity_received": number}]

Zasady:
- "sku": identyfikator produktu (SKU, kod, indeks) — jeśli nie ma, wygeneruj na podstawie nazwy (np. pierwsze litery + cyfry)
- "name": pełna nazwa produktu
- "quantity_received": liczba odebranych sztuk (liczba całkowita, dodatnia)
- Jeśli w dokumencie są jednostki (szt, kg, opak), przelicz na sztuki jeśli możliwe
- Jeśli liczba nie jest podana, użyj 1

Dokument:`;

const FILE_EXTRACTION_PROMPT = `Jesteś asystentem magazynowym. Przeanalizuj załączony dokument dostawy (faktura, WZ, list przewozowy) i wyciągnij z niego dane.

Zwróć ŚCIŚLE obiekt JSON o tym formacie (bez markdown, bez bloków kodu, bez dodatkowego tekstu):
{
  "supplier": "string",
  "total_netto": number,
  "total_vat": number,
  "total_brutto": number,
  "items": [{"sku": "string", "name": "string", "quantity_received": number, "unit_price_netto": number, "vat_rate": number}]
}

Zasady:
- "supplier": nazwa dostawcy z dokumentu (jeśli nie ma, użyj "Nieznany dostawca")
- "total_netto": suma netto z dokumentu
- "total_vat": suma VAT z dokumentu
- "total_brutto": suma brutto z dokumentu
- "items": tablica pozycji, każda z:
  - "sku": identyfikator produktu (SKU, kod, indeks) — jeśli nie ma, wygeneruj na podstawie nazwy
  - "name": pełna nazwa produktu
  - "quantity_received": liczba odebranych sztuk (liczba całkowita, dodatnia)
  - "unit_price_netto": cena jednostkowa netto (liczba)
  - "vat_rate": stawka VAT w procentach (np. 23, 8, 5, 0)
- Jeśli jakaś wartość nie jest podana w dokumencie, użyj 0 dla liczb i "Nieznany dostawca" dla dostawcy.`;

const PREDICTIVE_PROMPT = `Jesteś ekspertem ds. łańcucha dostaw. Poniżej znajduje się lista produktów, których stan magazynowy spadł poniżej poziomu alertu. Wygeneruj JEDEN akapit (3-5 zdań) po polsku z rekomendacją pilnych działań uzupełnienia zapasów.

Uwzględnij:
- Które produkty są najbardziej krytyczne (najniższy stan względem alertu)
- Szacowany czas do wyczerpania zapasu jeśli trend się utrzyma
- Rekomendowaną kolejność działań
- Czy sugerujesz zamówienie awaryjne czy planowe uzupełnienie

Lista produktów poniżej poziomu alertu:`;

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

export interface ExtractedItem {
  sku: string;
  name: string;
  quantity_received: number;
}

export async function extractInventoryFromText(
  documentText: string,
  products: Product[],
): Promise<PendingItem[]> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  const modelId = await resolveGeminiModel();
  const client = createGeminiClient();

  try {
    const model = client.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const fullPrompt = `${TEXT_EXTRACTION_PROMPT}\n\n${documentText}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    });
    const response = await result.response;
    const rawText = response.text();

    let extracted: ExtractedItem[];
    try {
      extracted = JSON.parse(rawText);
    } catch {
      const cleaned = stripMarkdownFences(rawText);
      extracted = JSON.parse(cleaned);
    }

    if (!Array.isArray(extracted)) {
      throw new Error('AI nie zwróciło tablicy pozycji.');
    }

    return extracted.map((item) => {
      const match = products.find(
        (p) =>
          p.sku.toLowerCase() === item.sku.toLowerCase() ||
          p.name.toLowerCase() === item.name.toLowerCase(),
      );
      return {
        sku: item.sku,
        name: item.name,
        quantity_received: item.quantity_received,
        unit_price_netto: 0,
        vat_rate: 23,
        matched_product_id: match?.id ?? null,
        matched_product_name: match?.name ?? null,
        current_stock: match?.current_stock ?? null,
      };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}

export async function extractDeliveryFromFile(
  file: File,
  products: Product[],
): Promise<{ delivery: ExtractedDelivery; pending: PendingItem[] }> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  const modelId = await resolveGeminiModel();
  const client = createGeminiClient();

  try {
    const model = client.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const fileData = await file.arrayBuffer();
    const base64Data = btoa(
      String.fromCharCode(...new Uint8Array(fileData)),
    );

    const mimeType = file.type || 'application/octet-stream';

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: FILE_EXTRACTION_PROMPT },
          { inlineData: { mimeType, data: base64Data } },
        ],
      }],
    });
    const response = await result.response;
    const rawText = response.text();

    let delivery: ExtractedDelivery;
    try {
      delivery = JSON.parse(rawText);
    } catch {
      const cleaned = stripMarkdownFences(rawText);
      delivery = JSON.parse(cleaned);
    }

    if (!delivery.items || !Array.isArray(delivery.items)) {
      throw new Error('AI nie zwróciło pozycji dostawy.');
    }

    const pending: PendingItem[] = delivery.items.map((item) => {
      const match = products.find(
        (p) =>
          p.sku.toLowerCase() === item.sku.toLowerCase() ||
          p.name.toLowerCase() === item.name.toLowerCase(),
      );
      return {
        sku: item.sku,
        name: item.name,
        quantity_received: item.quantity_received,
        unit_price_netto: item.unit_price_netto ?? 0,
        vat_rate: item.vat_rate ?? 23,
        matched_product_id: match?.id ?? null,
        matched_product_name: match?.name ?? null,
        current_stock: match?.current_stock ?? null,
      };
    });

    return { delivery, pending };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}

export async function generatePredictiveAlert(
  lowStockProducts: Product[],
): Promise<string> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  const modelId = await resolveGeminiModel();
  const client = createGeminiClient();

  try {
    const model = client.getGenerativeModel({ model: modelId });

    const productList = lowStockProducts
      .map(
        (p) =>
          `- ${p.name} (SKU: ${p.sku}): stan ${p.current_stock}, alert przy ${p.minimum_stock_alert}`,
      )
      .join('\n');

    const fullPrompt = `${PREDICTIVE_PROMPT}\n\n${productList}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    });
    const response = await result.response;
    return response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}

export interface ExtractedReceiptItem {
  name: string;
  quantity: number;
  unit_price_netto: number;
  vat_rate: number;
}

const RECEIPT_OCR_PROMPT = `Przeanalizuj zdjęcie paragonu. Zwróć TYLKO ustrukturyzowany JSON zawierający tablicę kupionych produktów: { "items": [ { "name": "string", "quantity": number, "unit_price_netto": number, "vat_rate": number } ] }. Jeśli na paragonie widnieje tylko kwota brutto, matematycznie wylicz cenę netto bazując na stawce VAT.`;

export async function extractReceiptItems(file: File): Promise<ExtractedReceiptItem[]> {
  if (!isGeminiConfigured) {
    throw new Error('Gemini API nie jest skonfigurowane. Ustaw VITE_GEMINI_API_KEY w pliku .env.');
  }

  const modelId = await resolveGeminiModel();
  const client = createGeminiClient();

  try {
    const model = client.getGenerativeModel({
      model: modelId,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const fileData = await file.arrayBuffer();
    const base64Data = btoa(
      String.fromCharCode(...new Uint8Array(fileData)),
    );

    const mimeType = file.type || 'application/octet-stream';

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: RECEIPT_OCR_PROMPT },
          { inlineData: { mimeType, data: base64Data } },
        ],
      }],
    });
    const response = await result.response;
    const rawText = response.text();

    let parsed: { items: ExtractedReceiptItem[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const cleaned = stripMarkdownFences(rawText);
      parsed = JSON.parse(cleaned);
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('AI nie zwróciło pozycji paragonu.');
    }

    return parsed.items.map((item) => ({
      name: String(item.name ?? ''),
      quantity: Number(item.quantity) || 1,
      unit_price_netto: Number(item.unit_price_netto) || 0,
      vat_rate: Number(item.vat_rate) || 23,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Nieznany błąd';
    throw classifyError(msg);
  }
}

export async function confirmDelivery(
  companyId: string,
  delivery: ExtractedDelivery,
  documentUrl: string,
): Promise<void> {
  // Insert invoice history record
  const { error: invError } = await supabase.from('invoices_history').insert({
    company_id: companyId,
    supplier: delivery.supplier,
    total_netto: Number(delivery.total_netto) || 0,
    total_vat: Number(delivery.total_vat) || 0,
    total_brutto: Number(delivery.total_brutto) || 0,
    document_url: documentUrl || null,
  });

  if (invError) {
    console.error('SUPABASE ERROR (invoices_history insert):', invError);
    throw new Error('Błąd zapisu: ' + invError.message);
  }

  // Process each item as a flat row
  for (const item of delivery.items) {
    const sku = String(item.sku || '').trim();
    const name = String(item.name || '').trim();
    const qty = Number(item.quantity_received) || 0;
    const unitPrice = Number(item.unit_price_netto) || 0;
    const vatRate = Number(item.vat_rate) || 23;

    if (!name || qty <= 0) continue;

    // Check if product exists by SKU
    let productId: string | null = null;
    let existingStock = 0;

    if (sku) {
      const { data: existing, error: selectError } = await supabase
        .from('products')
        .select('id, current_stock')
        .eq('company_id', companyId)
        .ilike('sku', sku)
        .maybeSingle();

      if (selectError) {
        console.error('SUPABASE ERROR (products select):', selectError);
        throw new Error('Błąd zapisu: ' + selectError.message);
      }

      if (existing) {
        productId = existing.id;
        existingStock = Number(existing.current_stock) || 0;
      }
    }

    if (productId) {
      // Update stock on existing product
      const newStock = existingStock + qty;
      const { error: updateError } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', productId);

      if (updateError) {
        console.error('SUPABASE ERROR (products update):', updateError);
        throw new Error('Błąd zapisu: ' + updateError.message);
      }
    } else {
      // Insert new product as a flat row
      const { data: newProduct, error: insertError } = await supabase
        .from('products')
        .insert({
          company_id: companyId,
          name,
          sku: sku || name.slice(0, 20).toUpperCase().replace(/\s/g, '-'),
          current_stock: qty,
          minimum_stock_alert: 5,
          purchase_price_netto: unitPrice,
          vat_rate: vatRate,
          selling_price_netto: 0,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('SUPABASE ERROR (products insert):', insertError);
        throw new Error('Błąd zapisu: ' + insertError.message);
      }

      productId = newProduct.id;
    }

    // Log stock movement
    const { error: movementError } = await supabase.from('stock_movements').insert({
      company_id: companyId,
      product_id: productId,
      change_amount: qty,
      movement_type: 'IN',
    });

    if (movementError) {
      console.error('SUPABASE ERROR (stock_movements insert):', movementError);
      throw new Error('Błąd zapisu: ' + movementError.message);
    }
  }
}
