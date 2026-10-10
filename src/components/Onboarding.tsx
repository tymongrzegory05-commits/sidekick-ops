import { supabase } from '@/lib/supabase';
import { Building2, ChevronDown, Loader2, Users } from 'lucide-react';
import { useState } from 'react';

interface OnboardingProps {
  userId: string;
  onDone: () => void;
}

const INDUSTRIES = [
  'Technologia / SaaS',
  'Produkcja',
  'Handel detaliczny / E-commerce',
  'Ochrona zdrowia',
  'Finanse / Ubezpieczenia',
  'Budownictwo',
  'Logistyka / Transport',
  'Edukacja',
  'Hotelarstwo / Gastronomia',
  'Usługi profesjonalne',
  'Nieruchomości',
  'Inne',
];

export function Onboarding({ userId, onDone }: OnboardingProps) {
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      setError('Podaj nazwę firmy.');
      return;
    }
    if (!industry) {
      setError('Wybierz branżę.');
      return;
    }
    const count = parseInt(employeeCount, 10);
    if (isNaN(count) || count < 1) {
      setError('Liczba pracowników musi być dodatnią liczbą.');
      return;
    }

    setLoading(true);
    try {
      const { error: insertError } = await supabase
        .from('companies')
        .insert({
          id: userId,
          company_name: companyName.trim(),
          industry,
          employee_count: count,
        });
      if (insertError) throw insertError;
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać profilu firmy.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-accent-500 flex items-center justify-center mb-4 shadow-glow">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Powiedz nam o swojej firmie</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Potrzebujemy kilku danych przed rozpoczęciem audytu</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Nazwa firmy</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ACME Sp. z o.o."
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Branża</label>
              <div className="relative">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full appearance-none pl-3 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all bg-white dark:bg-slate-900"
                >
                  <option value="">Wybierz branżę...</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Liczba pracowników</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
                <input
                  type="number"
                  min="1"
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  placeholder="50"
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Przejdź do audytu
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
