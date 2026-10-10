import { extractDeliveryFromFile, extractInventoryFromText, confirmDelivery } from '@/lib/inventory';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Company, ExtractedDelivery, PendingItem, Product } from '@/types';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
  Package,
  Sparkles,
  TrendingUp,
  Upload,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SmartScanProps {
  company: Company;
  onBack: () => void;
  onConfirmed: () => void;
}

export function SmartScan({ company, onBack, onConfirmed }: SmartScanProps) {
  const { showToast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [delivery, setDelivery] = useState<ExtractedDelivery | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentText, setDocumentText] = useState('');
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase
        .from('products')
        .select('id, company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate, selling_price_netto, created_at')
        .eq('company_id', company.id);
      if (data) setProducts(data as Product[]);
    }
    loadProducts();
  }, [company.id]);

  async function handleScan() {
    if (mode === 'file' && !selectedFile) {
      showToast('Wybierz plik dokumentu do analizy.', 'error');
      return;
    }
    if (mode === 'text' && !documentText.trim()) {
      showToast('Wklej treść dokumentu do analizy.', 'error');
      return;
    }

    setScanning(true);
    setDelivery(null);
    setPending([]);
    try {
      if (mode === 'file' && selectedFile) {
        const result = await extractDeliveryFromFile(selectedFile, products);
        setDelivery(result.delivery);
        setPending(result.pending);
        showToast(`AI wyciągnęło ${result.pending.length} pozycji z dokumentu.`, 'success');
      } else {
        const items = await extractInventoryFromText(documentText, products);
        setPending(items);
        setDelivery({
          supplier: 'Wklejony tekst',
          total_netto: 0,
          total_vat: 0,
          total_brutto: 0,
          items: items.map((i) => ({
            sku: i.sku,
            name: i.name,
            quantity_received: i.quantity_received,
            unit_price_netto: i.unit_price_netto,
            vat_rate: i.vat_rate,
          })),
        });
        showToast(`Wyciągnięto ${items.length} pozycji z tekstu.`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się przeanalizować dokumentu.';
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirm() {
    if (!delivery || pending.length === 0) {
      showToast('Brak pozycji do zatwierdzenia. Zeskanuj dokument najpierw.', 'error');
      return;
    }

    setConfirming(true);
    try {
      let documentUrl = '';

      if (selectedFile) {
        const fileName = `${company.id}/${Date.now()}-${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('inventory_documents')
          .upload(fileName, selectedFile);

        if (uploadError) {
          console.error('SUPABASE ERROR (storage upload):', uploadError);
          showToast('Nie udało się wgrać pliku, ale kontynuuję bez dokumentu.', 'info');
        } else {
          const { data: urlData } = supabase.storage
            .from('inventory_documents')
            .getPublicUrl(fileName);
          documentUrl = urlData.publicUrl;
        }
      }

      await confirmDelivery(company.id, delivery, documentUrl);

      showToast('Dostawa zatwierdzona i zapisana pomyślnie!', 'success');
      setPending([]);
      setDelivery(null);
      setSelectedFile(null);
      setDocumentText('');
      onConfirmed();
    } catch (err) {
      console.error('CONFIRM DELIVERY ERROR:', err);
      const msg = err instanceof Error ? err.message : 'Nie udało się zatwierdzić dostawy.';
      showToast(msg, 'error');
    } finally {
      setConfirming(false);
    }
  }

  function formatPLN(value: number): string {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      maximumFractionDigits: 2,
    }).format(value);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Wróć do magazynu
      </button>

      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Skan AI dokumentu dostawy</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Wgraj zdjęcie lub PDF dokumentu — AI wyciągnie pozycje do sprawdzenia.</p>
      </div>

      {pending.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-4">
            <button
              onClick={() => setMode('file')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${mode === 'file' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Wgraj plik
            </button>
            <button
              onClick={() => setMode('text')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${mode === 'text' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Wklej tekst
            </button>
          </div>

          {mode === 'file' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <FileText className="h-5 w-5" />
                    {selectedFile.name}
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">Kliknij, aby wybrać plik (JPG, PNG, PDF)</p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder="Wklej treść dokumentu dostawy..."
              rows={8}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all resize-y font-mono"
            />
          )}

          <div className="flex justify-end mt-4">
            <button
              onClick={handleScan}
              disabled={scanning || (mode === 'file' ? !selectedFile : !documentText.trim())}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI analizuje dokument...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analizuj dokument
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>AI może się mylić. Zawsze weryfikuj dane przed zatwierdzeniem.</strong> Sprawdź pozycje poniżej i popraw ewentualne błędy.
            </p>
          </div>

          {delivery && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Dostawca</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{delivery.supplier}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Suma netto</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatPLN(delivery.total_netto)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Suma VAT</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatPLN(delivery.total_vat)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">Suma brutto</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatPLN(delivery.total_brutto)}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">SKU</th>
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Nazwa</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Ilość</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Cena netto</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">VAT</th>
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Dopasowanie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pending.map((item, i) => {
                  const matchedProduct = item.matched_product_id
                    ? products.find((p) => p.id === item.matched_product_id)
                    : null;
                  const priceIncreased = matchedProduct != null &&
                    matchedProduct.purchase_price_netto > 0 &&
                    item.unit_price_netto > matchedProduct.purchase_price_netto;

                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-slate-600 dark:text-slate-400">{item.sku}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-slate-900 dark:text-slate-100">+{item.quantity_received}</td>
                      <td
                        className={`px-4 py-3 text-sm text-right ${priceIncreased ? 'text-red-600 font-semibold bg-red-50 dark:text-red-400 dark:bg-red-950/40' : 'text-slate-600 dark:text-slate-400'}`}
                        title={priceIncreased ? 'Uwaga: Cena zakupu wzrosła!' : undefined}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {priceIncreased && <TrendingUp className="h-3.5 w-3.5 text-red-500" />}
                          {formatPLN(item.unit_price_netto)}
                          {matchedProduct && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                              (hist: {formatPLN(matchedProduct.purchase_price_netto)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-500 dark:text-slate-400">{item.vat_rate}%</td>
                      <td className="px-4 py-3">
                        {item.matched_product_id ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {item.matched_product_name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                            <Package className="h-3.5 w-3.5" />
                            Nowy produkt
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => { setPending([]); setDelivery(null); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <XCircle className="h-4 w-4" />
              Odrzuć
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {confirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Przetwarzanie...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Zatwierdź dostawę
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
