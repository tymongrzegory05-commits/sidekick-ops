import { getChatResponse, generateAudit } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { ChatMessage, Company } from '@/types';
import { AlertCircle, Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface AuditChatProps {
  userId: string;
  company: Company;
  onAuditComplete: () => void;
}

const MAX_QUESTIONS = 4;

export function AuditChat({ userId, company, onAuditComplete }: AuditChatProps) {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userMessageCount, setUserMessageCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, analyzing]);

  async function getInitialMessage() {
    setLoading(true);
    setError(null);
    try {
      const initialHistory: ChatMessage[] = [
        {
          role: 'user',
          text: `Prowadzę firmę o nazwie "${company.company_name}" w branży ${company.industry} z ${company.employee_count} pracownikami. Chcę przeprowadzić audyt operacyjny. Zacznij od zadania pierwszego pytania o marnowany czas lub przecieki finansowe.`,
        },
      ];
      const response = await getChatResponse(initialHistory);
      setMessages([{ role: 'model', text: response }]);
      setUserMessageCount(1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się rozpocząć audytu.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getInitialMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading || analyzing) return;

    const userMsg: ChatMessage = { role: 'user', text: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setError(null);

    const nextCount = userMessageCount + 1;
    setUserMessageCount(nextCount);

    if (nextCount >= MAX_QUESTIONS) {
      await runAnalysis(newMessages);
    } else {
      setLoading(true);
      try {
        const response = await getChatResponse(newMessages);
        setMessages([...newMessages, { role: 'model', text: response }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Nie udało się uzyskać odpowiedzi.';
        setError(msg);
        showToast(msg, 'error');
      } finally {
        setLoading(false);
      }
    }
  }

  async function runAnalysis(fullHistory: ChatMessage[]) {
    setAnalyzing(true);
    setError(null);
    try {
      const audit = await generateAudit(fullHistory, company);

      const { error: insertError } = await supabase.from('audits').insert({
        company_id: userId,
        financial_leak_estimate_pln: audit.financial_leak_estimate_pln,
        time_wasted_hours_monthly: audit.time_wasted_hours_monthly,
        bottlenecks: audit.bottlenecks,
        suggested_tier: audit.suggested_tier,
        monthly_price_pln: audit.monthly_price_pln,
        roi_summary: audit.roi_summary,
      });

      if (insertError) throw insertError;

      showToast('Audyt zakończony pomyślnie!', 'success');
      onAuditComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się wygenerować audytu.';
      setError(msg);
      showToast(msg, 'error');
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Audyt AI</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {company.company_name} · Pytanie {Math.min(userMessageCount, MAX_QUESTIONS)} z {MAX_QUESTIONS}
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-slate-900 text-white rounded-br-sm dark:bg-sky-600'
                    : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-slate-500" />
              </div>
            </div>
          )}

          {analyzing && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-4 border-slate-200 dark:border-slate-800" />
                <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-transparent border-t-slate-900 animate-spin" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Analizowanie danych...</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Generowanie raportu audytu operacyjnego</p>
            </div>
          )}
        </div>
      </div>

      {!analyzing && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-3">
          <form onSubmit={handleSend} className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Wpisz swoją odpowiedź..."
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 rounded-lg bg-accent-600 text-white hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center"
              aria-label="Wyślij"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
