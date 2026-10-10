import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Company } from '@/types';
import { Check, Key, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SettingsViewProps {
  company: Company;
}

export function SettingsView({ company }: SettingsViewProps) {
  const { showToast } = useToast();
  const [fakturowniaToken, setFakturowniaToken] = useState('');
  const [fakturowniaDomain, setFakturowniaDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data } = await supabase
          .from('companies')
          .select('id')
          .eq('id', company.id)
          .maybeSingle();

        if (data) {
          // Settings stored in user metadata via auth
          const { data: userData } = await supabase.auth.getUser();
          const meta = userData.user?.user_metadata ?? {};
          setFakturowniaToken(meta.fakturownia_token ?? '');
          setFakturowniaDomain(meta.fakturownia_domain ?? '');
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [company.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          fakturownia_token: fakturowniaToken.trim(),
          fakturownia_domain: fakturowniaDomain.trim(),
        },
      });
      if (error) throw error;
      showToast('Ustawienia zapisane pomyślnie.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się zapisać ustawień.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Ustawienia</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Konfiguracja integracji z Fakturownią</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
            <Key className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Fakturownia API</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Token i domena potrzebne do wystawiania faktur</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Token API</label>
            <input
              type="password"
              value={fakturowniaToken}
              onChange={(e) => setFakturowniaToken(e.target.value)}
              placeholder="Twój token API z Fakturowni"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Domena</label>
            <input
              type="text"
              value={fakturowniaDomain}
              onChange={(e) => setFakturowniaDomain(e.target.value)}
              placeholder="np. mojafirma"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all"
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Nazwa subdomeny z adresu Fakturowni (np. mojafirma.fakturownia.pl)</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz ustawienia
          </button>
        </form>

        {fakturowniaToken && (
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            Fakturownia skonfigurowana
          </div>
        )}
      </div>
    </div>
  );
}
