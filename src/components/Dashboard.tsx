import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Audit, Company, Severity } from '@/types';
import {
  Clock,
  Coins,
  RotateCcw,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

interface DashboardProps {
  company: Company;
  audit: Audit;
  onRestart: () => void;
}

const severityStyles: Record<Severity, { bg: string; border: string; text: string; dot: string }> = {
  High: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    border: 'border-red-200 dark:border-red-900/50',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
  },
  Medium: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-900/50',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  Low: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-900/50',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
};

const tierStyles: Record<string, { bg: string; text: string; icon: string }> = {
  Starter: { bg: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-400', icon: 'bg-sky-500' },
  Growth: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-700 dark:text-violet-400', icon: 'bg-violet-500' },
  Scale: { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-700 dark:text-orange-400', icon: 'bg-orange-500' },
};

function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 0,
  }).format(value);
}

export function Dashboard({ company, audit, onRestart }: DashboardProps) {
  const { showToast } = useToast();
  const [restartLoading, setRestartLoading] = useState(false);

  async function handleRestart() {
    setRestartLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('audits')
        .delete()
        .eq('company_id', company.id);
      if (deleteError) throw deleteError;
      showToast('Audyt został zresetowany.', 'info');
      onRestart();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się zresetować audytu.';
      showToast(msg, 'error');
    } finally {
      setRestartLoading(false);
    }
  }

  const tierStyle = tierStyles[audit.suggested_tier] ?? tierStyles.Starter;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Wyniki audytu</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Twój audyt operacyjny jest gotowy. Oto co znaleźliśmy.</p>
        </div>
        <button
          onClick={handleRestart}
          disabled={restartLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-all"
        >
          <RotateCcw className={`h-4 w-4 ${restartLoading ? 'animate-spin' : ''}`} />
          Powtórz audyt
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <Coins className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Przeciek finansowy (mies.)</span>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {formatPLN(audit.financial_leak_estimate_pln)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Szacowane straty miesięczne</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Zmarnowany czas (mies.)</span>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {audit.time_wasted_hours_monthly.toLocaleString('pl-PL')} <span className="text-lg font-medium text-slate-400 dark:text-slate-500">godz.</span>
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Szacowane godziny marnowane miesięcznie</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 mb-6">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Zidentyfikowane wąskie gardła</h3>
        <div className="space-y-3">
          {audit.bottlenecks.map((b, i) => {
            const style = severityStyles[b.severity] ?? severityStyles.Medium;
            return (
              <div
                key={i}
                className={`rounded-xl border ${style.border} ${style.bg} p-4`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{b.area}</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                    {b.severity === 'High' ? 'Wysoki' : b.severity === 'Medium' ? 'Średni' : 'Niski'}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{b.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Zap className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Rekomendowany pakiet</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${tierStyle.bg} ${tierStyle.text}`}>
              <span className={`h-2 w-2 rounded-full ${tierStyle.icon} mr-2`} />
              {audit.suggested_tier}
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-3">
            {formatPLN(audit.monthly_price_pln)}
            <span className="text-base font-medium text-slate-400 dark:text-slate-500">/mies.</span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Podsumowanie ROI</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{audit.roi_summary}</p>
        </div>
      </div>
    </div>
  );
}
