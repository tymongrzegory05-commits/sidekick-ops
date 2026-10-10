/*
============================================================
 SKANER ROZLICZEŃ AI — SQL do wklejenia w Supabase SQL Editor
============================================================

-- Tabela: daily_settlements
-- Przechowuje dzienne rozliczenia kasowe zweryfikowane przez Gemini Vision AI.

CREATE TABLE IF NOT EXISTS daily_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  employee_name text NOT NULL,
  declared_cash numeric NOT NULL DEFAULT 0,
  declared_card numeric NOT NULL DEFAULT 0,
  kw_amount numeric NOT NULL DEFAULT 0,
  register_cash numeric NOT NULL DEFAULT 0,
  register_card numeric NOT NULL DEFAULT 0,
  terminal_card numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'match' CHECK (status IN ('match', 'mismatch')),
  discrepancy_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_daily_settlements" ON daily_settlements;
CREATE POLICY "select_own_daily_settlements" ON daily_settlements FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_daily_settlements" ON daily_settlements;
CREATE POLICY "insert_own_daily_settlements" ON daily_settlements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_daily_settlements" ON daily_settlements;
CREATE POLICY "update_own_daily_settlements" ON daily_settlements FOR UPDATE
  TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_daily_settlements" ON daily_settlements;
CREATE POLICY "delete_own_daily_settlements" ON daily_settlements FOR DELETE
  TO authenticated USING (auth.uid() = company_id);

CREATE INDEX IF NOT EXISTS idx_daily_settlements_company_created
  ON daily_settlements(company_id, created_at);

============================================================
 Ten sam skrypt jest też zapisany jako migracja w:
 supabase/migrations/20260831215800_create_daily_settlements_table.sql
============================================================
*/

import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { scanSettlementDocument } from '@/utils/geminiScanner';
import type { Company, DailySettlement } from '@/types';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Receipt,
  RefreshCcw,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface SettlementsScannerProps {
  company: Company;
}

interface SettlementFormState {
  employee_name: string;
  date: string;
  declared_cash: string;
  declared_card: string;
  kw_amount: string;
  register_cash: string;
  register_card: string;
  terminal_card: string;
  notes: string;
}

const EPSILON = 0.01;

function emptyForm(): SettlementFormState {
  return {
    employee_name: '',
    date: new Date().toISOString().slice(0, 10),
    declared_cash: '0',
    declared_card: '0',
    kw_amount: '0',
    register_cash: '0',
    register_card: '0',
    terminal_card: '0',
    notes: '',
  };
}

function num(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSigned(value: number): string {
  const formatted = formatPLN(Math.abs(value));
  if (Math.abs(value) < EPSILON) return formatPLN(0);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

/** Znajduje pole(a) odstające spośród trzech wartości, które teoretycznie powinny być sobie równe. */
function findCardOutliers(declared: number, terminal: number, register: number): Set<'declared_card' | 'terminal_card' | 'register_card'> {
  const eq = (a: number, b: number) => Math.abs(a - b) < EPSILON;
  const outliers = new Set<'declared_card' | 'terminal_card' | 'register_card'>();

  const dEqT = eq(declared, terminal);
  const dEqR = eq(declared, register);
  const tEqR = eq(terminal, register);

  if (dEqT && dEqR && tEqR) return outliers; // wszystko się zgadza

  if (dEqT && !tEqR) {
    outliers.add('register_card');
  } else if (dEqR && !dEqT) {
    outliers.add('terminal_card');
  } else if (tEqR && !dEqT) {
    outliers.add('declared_card');
  } else {
    outliers.add('declared_card');
    outliers.add('terminal_card');
    outliers.add('register_card');
  }

  return outliers;
}

export function SettlementsScanner({ company }: SettlementsScannerProps) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [settlements, setSettlements] = useState<DailySettlement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SettlementFormState>(emptyForm());

  async function loadSettlements() {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('daily_settlements')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSettlements((data as DailySettlement[]) ?? []);
    } catch (err) {
      console.warn('SUPABASE ERROR (daily_settlements select):', err);
      setSettlements([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFile(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setScanned(false);
    setScanning(true);

    try {
      const result = await scanSettlementDocument(file);
      setForm({
        employee_name: result.employee_name,
        date: result.date,
        declared_cash: String(result.declared_cash),
        declared_card: String(result.declared_card),
        kw_amount: String(result.kw_amount),
        register_cash: String(result.register_cash),
        register_card: String(result.register_card),
        terminal_card: String(result.terminal_card),
        notes: result.notes,
      });
      setScanned(true);
      showToast('AI odczytało dokumenty. Zweryfikuj dane przed zapisem.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się przeanalizować zdjęcia.';
      showToast(msg, 'error');
    } finally {
      setScanning(false);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function updateField(field: keyof SettlementFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetScanner() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setScanned(false);
    setForm(emptyForm());
  }

  const declaredCash = num(form.declared_cash);
  const declaredCard = num(form.declared_card);
  const kwAmount = num(form.kw_amount);
  const registerCash = num(form.register_cash);
  const registerCard = num(form.register_card);
  const terminalCard = num(form.terminal_card);

  const cashExpected = registerCash - kwAmount;
  const cashDiscrepancy = declaredCash - cashExpected;
  const cashMatch = Math.abs(cashDiscrepancy) < EPSILON;

  const cardOutliers = useMemo(
    () => findCardOutliers(declaredCard, terminalCard, registerCard),
    [declaredCard, terminalCard, registerCard],
  );
  const cardMatch = cardOutliers.size === 0;
  const cardDiscrepancy = declaredCard - registerCard;

  const totalDiscrepancy = cashDiscrepancy + (cardMatch ? 0 : cardDiscrepancy);
  const everythingMatches = cashMatch && cardMatch;

  async function handleSave() {
    if (!form.employee_name.trim()) {
      showToast('Podaj imię i nazwisko pracownika.', 'error');
      return;
    }
    if (!form.date) {
      showToast('Podaj datę rozliczenia.', 'error');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('daily_settlements').insert({
        company_id: company.id,
        date: form.date,
        employee_name: form.employee_name.trim(),
        declared_cash: declaredCash,
        declared_card: declaredCard,
        kw_amount: kwAmount,
        register_cash: registerCash,
        register_card: registerCard,
        terminal_card: terminalCard,
        status: everythingMatches ? 'match' : 'mismatch',
        discrepancy_amount: parseFloat(totalDiscrepancy.toFixed(2)),
        notes: form.notes.trim() || null,
      });

      if (error) throw error;

      showToast('Rozliczenie zapisane pomyślnie.', 'success');
      resetScanner();
      await loadSettlements();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się zapisać rozliczenia.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  function inputClass(isOutlier: boolean): string {
    const base = 'w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-colors';
    return isOutlier
      ? `${base} border-red-400 bg-red-50 text-red-900 focus:ring-red-500 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-200 dark:focus:ring-red-400`
      : `${base} border-slate-300 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-400`;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Rozliczenia</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Skaner Rozliczeń AI — zweryfikuj raport kasowy jednym zdjęciem</p>
        </div>
      </div>

      {/* Upload zone */}
      {!scanned && !scanning && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all mb-6 ${
            isDragging
              ? 'border-slate-900 bg-slate-50 dark:border-sky-400 dark:bg-slate-800'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <UploadCloud className="h-8 w-8 text-slate-500 dark:text-slate-400" />
          </div>
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Wgraj zdjęcie rozliczenia</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Jedno zdjęcie: raport dobowy z kasy fiskalnej, wydruk z terminala i odręczna karteczka pracownika, ułożone obok siebie.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">Kliknij, aby wybrać plik, albo przeciągnij go tutaj</p>
        </div>
      )}

      {/* Loading state */}
      {scanning && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center mb-6">
          {previewUrl && (
            <img src={previewUrl} alt="Podgląd rozliczenia" className="max-h-48 mx-auto rounded-xl mb-6 shadow-xl shadow-slate-900/5 dark:shadow-none" />
          )}
          <Loader2 className="h-8 w-8 animate-spin text-slate-500 dark:text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sztuczna inteligencja analizuje dokumenty...</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">To może potrwać kilka-kilkanaście sekund</p>
        </div>
      )}

      {/* Verifier form */}
      {scanned && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Weryfikacja rozliczenia</h3>
            </div>
            <button
              type="button"
              onClick={resetScanner}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Nowy skan
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            {previewUrl && (
              <div className="sm:col-span-2">
                <img src={previewUrl} alt="Podgląd rozliczenia" className="max-h-56 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-900/5 dark:shadow-none" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pracownik</label>
              <input
                type="text"
                value={form.employee_name}
                onChange={(e) => updateField('employee_name', e.target.value)}
                placeholder="np. Anna Kowalska"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Data rozliczenia</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => updateField('date', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Overall status banner */}
          {everythingMatches ? (
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl px-5 py-4 mb-5">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-800 dark:text-emerald-300 font-semibold">
                Wszystko się zgadza ({formatPLN(0)})
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-5 py-4 mb-5">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-red-800 dark:text-red-300 font-semibold">
                Wykryto rozbieżność: {formatSigned(totalDiscrepancy)}
              </p>
            </div>
          )}

          {/* Cash block */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Banknote className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Gotówka</h4>
              {cashMatch ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Zgadza się
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> {formatSigned(cashDiscrepancy)}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Zasada: gotówka zadeklarowana = gotówka z kasy − zwroty/KW</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Zadeklarowana gotówka</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.declared_cash}
                  onChange={(e) => updateField('declared_cash', e.target.value)}
                  className={inputClass(!cashMatch)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Gotówka z kasy fiskalnej</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.register_cash}
                  onChange={(e) => updateField('register_cash', e.target.value)}
                  className={inputClass(!cashMatch)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Zwroty / KW</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.kw_amount}
                  onChange={(e) => updateField('kw_amount', e.target.value)}
                  className={inputClass(!cashMatch)}
                />
              </div>
            </div>
          </div>

          {/* Card block */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Karta</h4>
              {cardMatch ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Zgadza się
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Niezgodność między dokumentami
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Zasada: karteczka = terminal = kasa fiskalna</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Zadeklarowana karta</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.declared_card}
                  onChange={(e) => updateField('declared_card', e.target.value)}
                  className={inputClass(cardOutliers.has('declared_card'))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Terminal płatniczy</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.terminal_card}
                  onChange={(e) => updateField('terminal_card', e.target.value)}
                  className={inputClass(cardOutliers.has('terminal_card'))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Karta z kasy fiskalnej</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.register_card}
                  onChange={(e) => updateField('register_card', e.target.value)}
                  className={inputClass(cardOutliers.has('register_card'))}
                />
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Uwagi</label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={2}
              placeholder="Dodatkowe uwagi odczytane z karteczki lub dopisane ręcznie..."
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent resize-none"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? 'Zapisywanie...' : 'Zapisz rozliczenie'}
          </button>
        </div>
      )}

      {/* History */}
      <div className="mt-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Historia rozliczeń</h3>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
          </div>
        ) : settlements.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
            <Receipt className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Brak zapisanych rozliczeń</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Wgraj pierwsze zdjęcie, aby rozpocząć.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Data</th>
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Pracownik</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Gotówka</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Karta</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Rozbieżność</th>
                    <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {settlements.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {s.date ? new Date(s.date).toLocaleDateString('pl-PL') : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100">{s.employee_name}</td>
                      <td className="px-4 py-3.5 text-sm text-right text-slate-600 dark:text-slate-400">{formatPLN(s.declared_cash)}</td>
                      <td className="px-4 py-3.5 text-sm text-right text-slate-600 dark:text-slate-400">{formatPLN(s.declared_card)}</td>
                      <td className={`px-4 py-3.5 text-sm text-right font-semibold whitespace-nowrap ${Math.abs(s.discrepancy_amount) < EPSILON ? 'text-slate-900 dark:text-slate-100' : 'text-red-600 dark:text-red-400'}`}>
                        {formatSigned(s.discrepancy_amount)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {s.status === 'match' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Zgadza się
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Manko
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
