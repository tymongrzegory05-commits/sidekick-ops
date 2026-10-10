import { useToast } from '@/components/Toast';
import { scanReceiptForCancellation } from '@/utils/geminiScanner';
import { Loader2, Printer, RefreshCcw, Sparkles, UploadCloud } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

const ROW_COUNT = 10;
const VAT_OPTIONS = ['23%', '8%', '5%', '0%', 'ZW'];

interface ProtocolRow {
  id: string;
  receipt_number: string;
  name: string;
  unit: string;
  qty: string;
  unit_price: string;
  gross_value: string;
  vat_rate: string;
}

interface DocumentFormState {
  city: string;
  date: string;
  protocol_number: string;
  receipt_date: string;
  register_unique: string;
  register_evidentiary: string;
  reason: string;
}

function makeRowId(index: number): string {
  return `row-${index}-${Math.random().toString(36).slice(2)}`;
}

function emptyRow(index: number): ProtocolRow {
  return {
    id: makeRowId(index),
    receipt_number: '',
    name: '',
    unit: 'szt',
    qty: '',
    unit_price: '',
    gross_value: '',
    vat_rate: '23%',
  };
}

function emptyRows(): ProtocolRow[] {
  return Array.from({ length: ROW_COUNT }, (_, i) => emptyRow(i));
}

function defaultForm(): DocumentFormState {
  return {
    city: 'Łódź',
    date: new Date().toLocaleDateString('pl-PL'),
    protocol_number: '',
    receipt_date: '',
    register_unique: '',
    register_evidentiary: '',
    reason: 'błąd kasjera / zwrot',
  };
}

/** Wylicza wartość netto oraz kwotę VAT dla pojedynczego wiersza na podstawie wartości brutto i stawki VAT. */
function calcRowValues(row: ProtocolRow): { netto: number; vatAmount: number; gross: number } {
  const gross = parseFloat(row.gross_value.replace(',', '.')) || 0;
  const rateRaw = row.vat_rate.trim().toUpperCase();

  if (!rateRaw || rateRaw === 'ZW') {
    return { netto: Math.round(gross * 100) / 100, vatAmount: 0, gross };
  }

  const rate = parseFloat(rateRaw.replace('%', '').replace(',', '.')) || 0;
  const netto = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  const vatAmount = Math.round((gross - netto) * 100) / 100;
  return { netto, vatAmount, gross };
}

function formatAmount(value: number): string {
  return `${new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} zł`;
}

const inputClass = 'w-full bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-gray-500 print:border-none print:appearance-none print:p-0';

export function CancellationProtocol() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [form, setForm] = useState<DocumentFormState>(defaultForm());
  const [rows, setRows] = useState<ProtocolRow[]>(emptyRows());

  function updateForm(field: keyof DocumentFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateRow(index: number, field: keyof ProtocolRow, value: string) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  async function handleFile(file: File) {
    setScanning(true);
    try {
      const scan = await scanReceiptForCancellation(file);

      setRows((prev) => {
        const next = emptyRows();
        scan.items.slice(0, ROW_COUNT).forEach((item, i) => {
          next[i] = {
            id: prev[i]?.id ?? makeRowId(i),
            receipt_number: scan.receipt_number,
            name: item.name,
            unit: 'szt',
            qty: item.qty ? String(item.qty) : '',
            unit_price: item.unit_price ? String(item.unit_price) : '',
            gross_value: item.gross_value ? String(item.gross_value) : '',
            vat_rate: item.vat_rate || '23%',
          };
        });
        return next;
      });

      setForm((prev) => ({
        ...prev,
        receipt_date: scan.receipt_date || prev.receipt_date,
        register_unique: scan.register_unique || prev.register_unique,
        register_evidentiary: scan.register_evidentiary || prev.register_evidentiary,
      }));

      showToast('AI odczytało paragon. Zweryfikuj dane przed wydrukiem.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się przeanalizować paragonu.';
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

  function handleReset() {
    setForm(defaultForm());
    setRows(emptyRows());
  }

  const rowCalculations = useMemo(() => rows.map(calcRowValues), [rows]);
  const totalGross = useMemo(() => rowCalculations.reduce((sum, r) => sum + r.gross, 0), [rowCalculations]);
  const totalVat = useMemo(() => rowCalculations.reduce((sum, r) => sum + r.vatAmount, 0), [rowCalculations]);
  const totalNet = useMemo(() => rowCalculations.reduce((sum, r) => sum + r.netto, 0), [rowCalculations]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 print:bg-white print:min-h-0">
      {/* Panel Sterowania */}
      <div className="print:hidden p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Anulacje</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Protokoły anulacji paragonu fiskalnego — skan AI + edytowalny szablon A4</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all"
            >
              <RefreshCcw className="h-4 w-4" />
              Nowy protokół
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent-600 hover:bg-accent-500 hover:shadow-glow transition-all"
            >
              <Printer className="h-4 w-4" />
              Drukuj protokół
            </button>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
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
          {scanning ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-slate-500 dark:text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sztuczna inteligencja analizuje paragon...</p>
            </>
          ) : (
            <>
              <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                <UploadCloud className="h-7 w-7 text-slate-500 dark:text-slate-400" />
              </div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">Wgraj zdjęcie paragonu</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">AI uzupełni tabelę poniżej — resztę pól wypełnij lub popraw ręcznie</p>
            </>
          )}
        </div>

        <div className="flex items-start gap-2 mt-4 text-xs text-slate-400 dark:text-slate-500">
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <p>Tabela zawsze ma 10 wierszy — niewypełnione pozycje uzupełnij ręcznie. Wszystkie pola dokumentu poniżej są edytowalne.</p>
        </div>
      </div>

      {/* Karta A4 — pozostaje zawsze biała: to fizyczny dokument do druku, niezależny od wybranego motywu */}
      <div className="bg-white max-w-[210mm] min-h-[297mm] mx-auto p-12 shadow-xl shadow-slate-950/40 text-black font-serif print:shadow-none print:m-0 print:p-0 print:w-full print:text-black flex flex-col relative">
        {/* Header */}
        <div className="flex justify-between items-start text-sm mb-10">
          <div className="whitespace-pre-line leading-relaxed">
            {'JUMPART SP. Z O.O.\nul. Srebrzyńska 2/4, 91-074 Łódź\n(punkt sprzedaży)'}
          </div>
          <div className="flex items-center gap-1 text-right flex-shrink-0">
            <input
              type="text"
              value={form.city}
              onChange={(e) => updateForm('city', e.target.value)}
              className={`${inputClass} text-right w-24`}
            />
            <span>,</span>
            <input
              type="text"
              value={form.date}
              onChange={(e) => updateForm('date', e.target.value)}
              className={`${inputClass} text-right w-28`}
            />
          </div>
        </div>

        {/* Title */}
        <div className="text-center font-bold text-sm leading-relaxed mb-8">
          <p className="mb-1 flex items-center justify-center gap-1 flex-wrap">
            PROTOKÓŁ nr
            <input
              type="text"
              value={form.protocol_number}
              onChange={(e) => updateForm('protocol_number', e.target.value)}
              placeholder="01/08/2026"
              className="w-32 bg-transparent border-b border-dashed border-slate-400 text-center font-bold focus:outline-none hover:border-slate-500 print:border-none print:appearance-none print:p-0"
            />
          </p>
          <p className="mb-1 flex items-center justify-center gap-1 flex-wrap font-normal">
            anulowania paragonu fiskalnego z dnia
            <input
              type="text"
              value={form.receipt_date}
              onChange={(e) => updateForm('receipt_date', e.target.value)}
              className={`${inputClass} w-28 text-center font-bold`}
            />
            z kasy fiskalnej rejestrującej o numerze:
          </p>
          <p className="flex items-center justify-center gap-1 flex-wrap font-normal">
            - unikatowym:
            <input
              type="text"
              value={form.register_unique}
              onChange={(e) => updateForm('register_unique', e.target.value)}
              className={`${inputClass} w-40 text-center font-bold`}
            />
          </p>
          <p className="flex items-center justify-center gap-1 flex-wrap font-normal">
            - ewidencyjnym:
            <input
              type="text"
              value={form.register_evidentiary}
              onChange={(e) => updateForm('register_evidentiary', e.target.value)}
              className={`${inputClass} w-40 text-center font-bold`}
            />
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto mb-6">
          <table className="w-full border border-black text-[10px] leading-tight">
            <thead>
              <tr className="text-center font-semibold">
                <th className="border border-black p-1 w-8">Lp</th>
                <th className="border border-black p-1">Numer paragonu</th>
                <th className="border border-black p-1">Nazwa towaru</th>
                <th className="border border-black p-1 w-10">j.m.</th>
                <th className="border border-black p-1 w-14">Ilość</th>
                <th className="border border-black p-1 w-16">Cena jedn.</th>
                <th className="border border-black p-1 w-20">Wartość z podatkiem</th>
                <th className="border border-black p-1 w-14">Stawka %</th>
                <th className="border border-black p-1 w-16">W tym podatek — kwota</th>
                <th className="border border-black p-1 w-20">Wartość bez podatku</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const calc = rowCalculations[index];
                const hasValue = calc.gross !== 0;
                return (
                  <tr key={row.id}>
                    <td className="border border-black p-1 text-center">{index + 1}</td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.receipt_number}
                        onChange={(e) => updateRow(index, 'receipt_number', e.target.value)}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(index, 'name', e.target.value)}
                        className={inputClass}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        value={row.unit}
                        onChange={(e) => updateRow(index, 'unit', e.target.value)}
                        className={`${inputClass} text-center`}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.qty}
                        onChange={(e) => updateRow(index, 'qty', e.target.value)}
                        className={`${inputClass} text-right`}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.unit_price}
                        onChange={(e) => updateRow(index, 'unit_price', e.target.value)}
                        className={`${inputClass} text-right`}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.gross_value}
                        onChange={(e) => updateRow(index, 'gross_value', e.target.value)}
                        className={`${inputClass} text-right`}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <select
                        value={row.vat_rate}
                        onChange={(e) => updateRow(index, 'vat_rate', e.target.value)}
                        className={`${inputClass} text-center`}
                      >
                        {VAT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        readOnly
                        value={hasValue ? formatAmount(calc.vatAmount) : ''}
                        className={`${inputClass} text-right`}
                      />
                    </td>
                    <td className="border border-black p-1">
                      <input
                        type="text"
                        readOnly
                        value={hasValue ? formatAmount(calc.netto) : ''}
                        className={`${inputClass} text-right`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Reason */}
        <div className="mb-8 text-sm">
          <label className="block font-semibold mb-1">Powód anulowania paragonu:</label>
          <textarea
            value={form.reason}
            onChange={(e) => updateForm('reason', e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Summary */}
        <div className="mb-16 text-sm leading-relaxed">
          <p className="font-semibold mb-1">W związku z powyższym zmniejsza się:</p>
          <p>sprzedaż brutto o kwotę: <span className="font-semibold">{formatAmount(totalGross)}</span></p>
          <p>podatek należny o kwotę: <span className="font-semibold">{formatAmount(totalVat)}</span></p>
          <p>sprzedaż netto o kwotę: <span className="font-semibold">{formatAmount(totalNet)}</span></p>
        </div>

        {/* Signatures + attachment box */}
        <div className="flex justify-between items-end mt-auto text-sm">
          <div className="border-2 border-dashed border-gray-400 rounded-lg w-48 h-24 flex items-center justify-center text-center text-xs text-gray-500 p-2">
            TU PRZYPNIJ ORYGINAŁ PARAGONU
          </div>
          <div className="flex gap-16">
            <div className="text-center">
              <div className="w-40 border-t border-dotted border-black pt-1">podpis osoby sporządzającej</div>
            </div>
            <div className="text-center">
              <div className="w-40 border-t border-dotted border-black pt-1">podpis kierownika</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
