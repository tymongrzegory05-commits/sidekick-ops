import { useToast } from '@/components/Toast';
import type { SmsRecipient, SmsStatus } from '@/types';
import {
  CheckCircle2,
  ChevronLeft,
  ClipboardPaste,
  MessageCircleMore,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const DEFAULT_TEMPLATE =
  'Cześć {imie}, przypominamy o rezerwacji na {data}. Kwota zadatku do wpłaty: {kwota} zł. Pozdrawiamy, Saltos!';

const TEMPLATE_TAGS = ['{imie}', '{data}', '{kwota}'];

type StatusFilter = 'all' | SmsStatus;

interface ManualRowState {
  name: string;
  phone: string;
  date: string;
  amount: string;
}

const emptyManualRow: ManualRowState = { name: '', phone: '', date: '', amount: '' };

/** Normalizuje dowolny zapis numeru telefonu do formatu E.164, domyślnie dodając polski prefiks +48. */
function formatPhoneNumber(phone: string): string {
  const raw = phone.trim();
  if (!raw) return '';

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('0048')) return `+48${digits.slice(4)}`;
  if (digits.startsWith('48') && digits.length >= 11) return `+${digits}`;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 9) return `+48${digits}`;
  return `+${digits}`;
}

function formatAmountForTemplate(value: number): string {
  return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Podmienia tagi {imie}, {data}, {kwota} w szablonie na realne dane wybranego odbiorcy. */
function applyTemplate(template: string, recipient: SmsRecipient): string {
  return template
    .replaceAll('{imie}', recipient.name || 'Kliencie')
    .replaceAll('{data}', recipient.date || '')
    .replaceAll('{kwota}', formatAmountForTemplate(recipient.amount));
}

function splitFields(line: string): string[] {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  return line.split(',');
}

/** Parsuje wklejony tekst (z Excela/CSV) na listę odbiorców. Wiersze bez rozpoznawalnego numeru telefonu są pomijane. */
function parsePastedRecipients(text: string): { recipients: SmsRecipient[]; skipped: number } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const recipients: SmsRecipient[] = [];
  let skipped = 0;

  lines.forEach((line, idx) => {
    const fields = splitFields(line).map((f) => f.trim());
    const [name = '', phone = '', date = '', amountRaw = ''] = fields;
    const digits = phone.replace(/\D/g, '');

    if (digits.length < 7) {
      skipped += 1;
      return;
    }

    recipients.push({
      id: `sms-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      name: name || 'Klient',
      phone: formatPhoneNumber(phone),
      date: date || '',
      amount: parseFloat(amountRaw.replace(',', '.')) || 0,
      status: 'pending',
    });
  });

  return { recipients, skipped };
}

/** Buduje deep link sms:. iOS wymaga separatora &, Android/desktop akceptuje standardowe ?. */
function buildSmsHref(phone: string, message: string): string {
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
}

export function SmsQueue() {
  const { showToast } = useToast();

  const [recipients, setRecipients] = useState<SmsRecipient[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [manualRow, setManualRow] = useState<ManualRowState>(emptyManualRow);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [focusMode, setFocusMode] = useState(false);
  const [queue, setQueue] = useState<SmsRecipient[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentMessage, setCurrentMessage] = useState('');

  const pendingCount = useMemo(() => recipients.filter((r) => r.status === 'pending').length, [recipients]);
  const sentCount = recipients.length - pendingCount;

  const filteredRecipients = useMemo(() => {
    if (statusFilter === 'all') return recipients;
    return recipients.filter((r) => r.status === statusFilter);
  }, [recipients, statusFilter]);

  function handleImportPaste() {
    if (!pasteText.trim()) {
      showToast('Wklej najpierw dane odbiorców.', 'error');
      return;
    }
    const { recipients: parsed, skipped } = parsePastedRecipients(pasteText);
    if (parsed.length === 0) {
      showToast('Nie udało się rozpoznać żadnego odbiorcy. Sprawdź format danych.', 'error');
      return;
    }
    setRecipients((prev) => [...prev, ...parsed]);
    setPasteText('');
    showToast(
      `Wczytano ${parsed.length} odbiorców${skipped > 0 ? ` (pominięto ${skipped} niepoprawnych wierszy)` : ''}.`,
      'success',
    );
  }

  function handleAddManual() {
    if (!manualRow.name.trim() || !manualRow.phone.trim()) {
      showToast('Podaj przynajmniej imię i numer telefonu.', 'error');
      return;
    }
    const phone = formatPhoneNumber(manualRow.phone);
    if (phone.replace(/\D/g, '').length < 7) {
      showToast('Podany numer telefonu wygląda na niepoprawny.', 'error');
      return;
    }
    const recipient: SmsRecipient = {
      id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: manualRow.name.trim(),
      phone,
      date: manualRow.date.trim(),
      amount: parseFloat(manualRow.amount.replace(',', '.')) || 0,
      status: 'pending',
    };
    setRecipients((prev) => [...prev, recipient]);
    setManualRow(emptyManualRow);
  }

  function handleRemoveRecipient(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  function handleClearAll() {
    setRecipients([]);
  }

  function goToQueueIndex(index: number, currentQueue: SmsRecipient[] = queue) {
    setQueueIndex(index);
    const r = currentQueue[index];
    if (r) setCurrentMessage(applyTemplate(template, r));
  }

  function handleStartQueue() {
    const pending = recipients.filter((r) => r.status === 'pending');
    if (pending.length === 0) {
      showToast('Brak oczekujących odbiorców w kolejce.', 'error');
      return;
    }
    setQueue(pending);
    setFocusMode(true);
    goToQueueIndex(0, pending);
  }

  function handleExitFocusMode() {
    setFocusMode(false);
    setQueue([]);
    setQueueIndex(0);
  }

  function handleSkip() {
    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      showToast('To był ostatni klient w kolejce.', 'info');
      handleExitFocusMode();
      return;
    }
    goToQueueIndex(nextIndex);
  }

  function handleMarkSentAndNext() {
    const current = queue[queueIndex];
    if (!current) return;

    setRecipients((prev) => prev.map((r) => (r.id === current.id ? { ...r, status: 'sent' as SmsStatus } : r)));

    const nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      showToast('Kolejka SMS zakończona — wszystkie wiadomości wysłane.', 'success');
      handleExitFocusMode();
      return;
    }
    goToQueueIndex(nextIndex);
  }

  const currentRecipient = queue[queueIndex];
  const progressPercent = queue.length > 0 ? Math.round((queueIndex / queue.length) * 100) : 0;

  if (focusMode && currentRecipient) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <button
            type="button"
            onClick={handleExitFocusMode}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-400 dark:text-slate-500 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Zakończ kolejkę
          </button>
          <p className="text-sm font-medium text-white">
            Klient {queueIndex + 1} z {queue.length}
          </p>
          <button
            type="button"
            onClick={handleExitFocusMode}
            className="text-slate-400 dark:text-slate-500 hover:text-white transition-colors"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-1.5 bg-white/10">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Karta klienta w trybie skupienia zawsze pozostaje jasna — tło ekranu jest celowo stałe (ciemne) w obu motywach */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-accent-500 flex items-center justify-center flex-shrink-0">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{currentRecipient.name}</p>
                <p className="text-sm text-slate-500">{currentRecipient.phone}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Data</p>
                <p className="text-sm font-semibold text-slate-900">{currentRecipient.date || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">Kwota zadatku</p>
                <p className="text-sm font-semibold text-slate-900">{formatPLN(currentRecipient.amount)}</p>
              </div>
            </div>

            <label className="block text-xs font-medium text-slate-600 mb-1.5">Treść wiadomości</label>
            <textarea
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none mb-5"
            />

            <a
              href={buildSmsHref(currentRecipient.phone, currentMessage)}
              target="_blank"
              rel="noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-emerald-600 text-white text-base font-bold hover:bg-emerald-700 active:scale-[0.99] transition-all shadow-lg shadow-emerald-600/20 mb-3"
            >
              <Send className="h-5 w-5" />
              Otwórz SMS w telefonie (Wyślij do: {currentRecipient.name})
            </a>

            <button
              type="button"
              onClick={handleMarkSentAndNext}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-accent-600 text-white text-sm font-semibold hover:bg-accent-500 hover:shadow-glow transition-all mb-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Oznacz jako wysłane i przejdź dalej
            </button>

            <button
              type="button"
              onClick={handleSkip}
              className="w-full text-center text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              Pomiń tego klienta (zostaw jako oczekujący)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Powiadomienia SMS</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Darmowa, masowa wysyłka SMS z poziomu telefonu — bez płatnych bramek</p>
        </div>
        <button
          type="button"
          onClick={handleStartQueue}
          disabled={pendingCount === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Send className="h-4 w-4" />
          Rozpocznij kolejkę SMS ({pendingCount})
        </button>
      </div>

      {/* Szablon wiadomości */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircleMore className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Szablon wiadomości</h3>
        </div>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent resize-none mb-2"
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 dark:text-slate-500 mr-1">Dostępne tagi:</span>
          {TEMPLATE_TAGS.map((tag) => (
            <span key={tag} className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Import odbiorców */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardPaste className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Wklej listę odbiorców</h3>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
            Jeden wiersz = jeden klient. Kolumny: Imię, Telefon, Data, Kwota (skopiowane z Excela lub oddzielone przecinkami).
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={'Jan Kowalski, 600123456, 12.09.2026, 150\nAnna Nowak, 511222333, 13.09.2026, 200'}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent resize-none mb-3"
          />
          <button
            type="button"
            onClick={handleImportPaste}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow transition-all"
          >
            <ClipboardPaste className="h-4 w-4" />
            Wczytaj listę
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Dodaj pojedynczego klienta</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              type="text"
              value={manualRow.name}
              onChange={(e) => setManualRow((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Imię i nazwisko"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
            />
            <input
              type="text"
              value={manualRow.phone}
              onChange={(e) => setManualRow((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Telefon"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
            />
            <input
              type="text"
              value={manualRow.date}
              onChange={(e) => setManualRow((prev) => ({ ...prev, date: e.target.value }))}
              placeholder="Data (np. 12.09.2026)"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
            />
            <input
              type="text"
              inputMode="decimal"
              value={manualRow.amount}
              onChange={(e) => setManualRow((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Kwota zadatku"
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
            />
          </div>
          <button
            type="button"
            onClick={handleAddManual}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all"
          >
            <Plus className="h-4 w-4" />
            Dodaj do listy
          </button>
        </div>
      </div>

      {/* Filtry + tabela */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-3">
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: `Wszyscy (${recipients.length})` },
                { id: 'pending', label: `Oczekujący (${pendingCount})` },
                { id: 'sent', label: `Wysłani (${sentCount})` },
              ] as { id: StatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === f.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {recipients.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Wyczyść listę
            </button>
          )}
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Brak odbiorców na liście</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Wklej dane lub dodaj klienta ręcznie powyżej.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Imię</th>
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Telefon</th>
                  <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Data</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Kwota</th>
                  <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRecipients.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100">{r.name}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.phone}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{r.date || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatPLN(r.amount)}</td>
                    <td className="px-4 py-3.5 text-center">
                      {r.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Wysłano
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                          Oczekuje
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(r.id)}
                        className="text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        aria-label={`Usuń ${r.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
