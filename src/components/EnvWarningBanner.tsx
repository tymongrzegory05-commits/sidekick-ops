import { isGeminiConfigured } from '@/lib/gemini';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export function EnvWarningBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const missing: string[] = [];
  if (!isSupabaseConfigured) {
    missing.push('VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY');
  }
  if (!isGeminiConfigured) {
    missing.push('VITE_GEMINI_API_KEY');
  }

  if (missing.length === 0) return null;

  return (
    <div className="print:hidden bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold">Wymagana konfiguracja</p>
          <p className="mt-1">
            Następujące zmienne środowiskowe brakują i muszą zostać dodane do pliku{' '}
            <code className="px-1 py-0.5 bg-amber-100 dark:bg-amber-500/10 rounded text-amber-900 dark:text-amber-200 font-mono text-xs">.env</code>:
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {missing.map((v) => (
              <li key={v} className="font-mono text-xs text-amber-900 dark:text-amber-200">{v}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-amber-600 dark:text-amber-400 hover:text-amber-800 transition-colors flex-shrink-0"
          aria-label="Zamknij ostrzeżenie"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
