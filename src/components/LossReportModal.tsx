import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Company, Product, AdjustmentType } from '@/types';
import {
  AlertTriangle,
  Check,
  Loader2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useState } from 'react';

interface LossReportModalProps {
  company: Company;
  products: Product[];
  onClose: () => void;
  onReported: () => void;
}

const LOSS_REASONS = [
  'Uszkodzenie',
  'Kradzież',
  'Przeterminowanie',
  'Utrata',
  'Błąd systemowy',
  'Inne',
];

const SURPLUS_REASONS = [
  'Nadwyżka z dostawy',
  'Błąd systemowy',
  'Zwrot klienta',
  'Inne',
];

export function LossReportModal({ company, products, onClose, onReported }: LossReportModalProps) {
  const { showToast } = useToast();
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('LOSS');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const qty = parseInt(quantity, 10) || 0;
  const financialImpact = selectedProduct ? qty * (selectedProduct.purchase_price_netto ?? 0) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedProductId) {
      showToast('Wybierz produkt.', 'error');
      return;
    }
    if (qty <= 0) {
      showToast('Podaj ilość większą od zera.', 'error');
      return;
    }
    if (!reason) {
      showToast('Wybierz powód.', 'error');
      return;
    }

    if (adjustmentType === 'LOSS' && selectedProduct && qty > selectedProduct.current_stock) {
      showToast('Ilość straty przekracza stan magazynowy.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const differenceAmount = adjustmentType === 'LOSS' ? -qty : qty;
      const newStock = (selectedProduct?.current_stock ?? 0) + differenceAmount;

      const { error: adjError } = await supabase.from('inventory_adjustments').insert({
        company_id: company.id,
        product_id: selectedProductId,
        adjustment_type: adjustmentType,
        difference_amount: differenceAmount,
        reason,
      });

      if (adjError) throw adjError;

      const { error: prodError } = await supabase
        .from('products')
        .update({ current_stock: newStock })
        .eq('id', selectedProductId);

      if (prodError) throw prodError;

      showToast(
        adjustmentType === 'LOSS'
          ? `Strata ${qty} szt. odnotowana pomyślnie.`
          : `Nadwyżka ${qty} szt. odnotowana pomyślnie.`,
        'success',
      );
      onReported();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się odnotować korekty.';
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Zgłoś stratę / nadwyżkę</h3>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setAdjustmentType('LOSS')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${adjustmentType === 'LOSS' ? 'bg-white text-red-600 shadow-sm dark:bg-slate-700 dark:text-red-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              <TrendingDown className="h-4 w-4" />
              Strata
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentType('SURPLUS')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${adjustmentType === 'SURPLUS' ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              <TrendingUp className="h-4 w-4" />
              Nadwyżka
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Produkt</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent bg-white dark:bg-slate-900"
            >
              <option value="">— wybierz produkt —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — stan: {p.current_stock}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Ilość</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Powód</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent bg-white dark:bg-slate-900"
            >
              <option value="">— wybierz powód —</option>
              {(adjustmentType === 'LOSS' ? LOSS_REASONS : SURPLUS_REASONS).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {selectedProduct && qty > 0 && (
            <div className={`rounded-lg p-3 flex items-center gap-2 ${adjustmentType === 'LOSS' ? 'bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/50' : 'bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/50'}`}>
              <AlertTriangle className={`h-4 w-4 ${adjustmentType === 'LOSS' ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
              <span className={`text-sm ${adjustmentType === 'LOSS' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                Wpływ finansowy: {formatPLN(Math.abs(financialImpact))}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitting ? 'Zapisywanie...' : 'Zatwierdź'}
          </button>
        </form>
      </div>
    </div>
  );
}
