import type { Audit, Company } from '@/types';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Coins,
  FileText,
  Package,
  TrendingUp,
} from 'lucide-react';

interface DashboardOverviewProps {
  company: Company;
  audit: Audit | null;
  onNavigate: (module: 'audit' | 'inventory' | 'invoices') => void;
  productCount: number;
  lowStockCount: number;
  warehouseValue: number;
  invoiceCount: number;
}

function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 0,
  }).format(value);
}

export function DashboardOverview({
  company,
  audit,
  onNavigate,
  productCount,
  lowStockCount,
  warehouseValue,
  invoiceCount,
}: DashboardOverviewProps) {
  const hasInventoryIssues = audit?.bottlenecks.some(
    (b) => b.area.toLowerCase().includes('magazyn') || b.area.toLowerCase().includes('inwentarz') || b.area.toLowerCase().includes('stan'),
  );
  const hasInvoiceIssues = audit?.bottlenecks.some(
    (b) => b.area.toLowerCase().includes('faktur') || b.area.toLowerCase().includes('księgow') || b.area.toLowerCase().includes('finans'),
  );

  const upsellModule = hasInventoryIssues ? 'inventory' : hasInvoiceIssues ? 'invoices' : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Przegląd operacji — {company.company_name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Package className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{productCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Produktów w magazynie</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{lowStockCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Poniżej progu alertu</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
              <Coins className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatPLN(warehouseValue)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Wartość magazynu (netto)</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-500/10 flex items-center justify-center">
              <FileText className="h-4.5 w-4.5 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{invoiceCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Faktur przyjętych</p>
        </div>
      </div>

      {audit ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Wyniki audytu AI</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 p-3">
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">Przeciek finansowy</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{formatPLN(audit.financial_leak_estimate_pln)}</p>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3">
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Zmarnowany czas</p>
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{audit.time_wasted_hours_monthly} godz./mies.</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('audit')}
              className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors"
            >
              Zobacz pełny raport <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {upsellModule && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Rekomendacja AI</h3>
                  <p className="text-sm text-slate-300 mt-0.5">Na podstawie Twojego audytu, polecamy:</p>
                </div>
              </div>
              <p className="text-sm text-slate-300 mb-4">
                {upsellModule === 'inventory'
                  ? 'Wdrożenie modułu Magazyn AI — automatyzacja inwentaryzacji i skan dokumentów dostawy znacząco zmniejszy straty związane z zarządzaniem stanami.'
                  : 'Wdrożenie modułu Faktury — automatyzacja fakturowania i integracja z Fakturownią usprawni obieg dokumentów finansowych.'}
              </p>
              {/* Ten przycisk zawsze siedzi na ciemnym gradiencie — celowo pozostaje jasny w obu motywach */}
              <button
                onClick={() => onNavigate(upsellModule)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-medium hover:bg-slate-100 transition-all"
              >
                Przejdź do modułu
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-8 text-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <Clock className="h-6 w-6 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Audyt nie został jeszcze przeprowadzony</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Przeprowadź audyt operacyjny AI, aby zdiagnozować straty w firmie.</p>
          <button
            onClick={() => onNavigate('audit')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow transition-all"
          >
            Rozpocznij audyt
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
