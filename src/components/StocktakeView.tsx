import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Company, Product } from '@/types';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Package,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface StocktakeViewProps {
  company: Company;
  onBack: () => void;
  onCompleted: () => void;
}

interface StocktakeRow {
  product: Product;
  actualStock: string;
}

export function StocktakeView({ company, onBack, onCompleted }: StocktakeViewProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<StocktakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadProducts() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate, selling_price_netto, created_at')
        .eq('company_id', company.id)
        .order('name', { ascending: true });

      if (error) throw error;

      const products = (data as Product[]) ?? [];
      setRows(products.map((p) => ({ product: p, actualStock: String(p.current_stock) })));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się pobrać produktów.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateActualStock(index: number, value: string) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], actualStock: value };
      return copy;
    });
  }

  function getDifference(row: StocktakeRow): number {
    const actual = parseInt(row.actualStock, 10);
    if (isNaN(actual)) return 0;
    return actual - row.product.current_stock;
  }

  function getFinancialImpact(row: StocktakeRow): number {
    return getDifference(row) * (row.product.purchase_price_netto ?? 0);
  }

  const totalImpact = rows.reduce((sum, r) => sum + getFinancialImpact(r), 0);
  const hasDiscrepancies = rows.some((r) => getDifference(r) !== 0);

  async function handleCommit() {
    if (!hasDiscrepancies) {
      showToast('Brak rozbieżności do zatwierdzenia.', 'info');
      return;
    }

    setSubmitting(true);
    try {
      const discrepancies = rows.filter((r) => getDifference(r) !== 0);

      for (const row of discrepancies) {
        const diff = getDifference(row);
        const actual = parseInt(row.actualStock, 10) || 0;

        const { error: adjError } = await supabase.from('inventory_adjustments').insert({
          company_id: company.id,
          product_id: row.product.id,
          adjustment_type: 'STOCKTAKE',
          difference_amount: diff,
          reason: diff < 0 ? 'Niedobór — spis z natury' : 'Nadwyżka — spis z natury',
        });

        if (adjError) throw adjError;

        const { error: prodError } = await supabase
          .from('products')
          .update({ current_stock: actual })
          .eq('id', row.product.id);

        if (prodError) throw prodError;
      }

      showToast(`Inwentaryzacja zatwierdzona. Odnotowano ${discrepancies.length} korekt.`, 'success');
      onCompleted();
      onBack();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się zatwierdzić inwentaryzacji.';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
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
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors mb-4"
      >
        <Package className="h-4 w-4" />
        Wróć do magazynu
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Arkusz spisu z natury</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Wpisz fizycznie policzony stan dla każdego produktu</p>
        </div>
        {hasDiscrepancies && (
          <div className={`rounded-xl px-4 py-2 ${totalImpact < 0 ? 'bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/50' : 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/50'}`}>
            <p className={`text-xs font-medium ${totalImpact < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              Wpływ finansowy: {formatPLN(Math.abs(totalImpact))}
            </p>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <ClipboardCheck className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Brak produktów do inwentaryzacji.</p>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Produkt</th>
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">SKU</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Stan systemowy</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Stan faktyczny</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Różnica</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Wpływ (PLN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, i) => {
                  const diff = getDifference(row);
                  const impact = getFinancialImpact(row);
                  return (
                    <tr key={row.product.id} className={diff !== 0 ? 'bg-amber-50 dark:bg-amber-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{row.product.name}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">{row.product.sku}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-600 dark:text-slate-400">{row.product.current_stock}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={row.actualStock}
                          onChange={(e) => updateActualStock(i, e.target.value)}
                          className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {diff === 0 ? (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            {diff} (niedobór)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            +{diff} (nadwyżka)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {diff === 0 ? (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        ) : (
                          <span className={impact < 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-emerald-600 dark:text-emerald-400 font-medium'}>
                            {formatPLN(Math.abs(impact))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleCommit}
              disabled={submitting || !hasDiscrepancies}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {submitting ? 'Zatwierdzanie...' : 'Zatwierdź inwentaryzację'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
