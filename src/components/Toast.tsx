import { CheckCircle, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const toastStyles: Record<ToastType, { bg: string; border: string; text: string; icon: ReactNode }> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    border: 'border-emerald-200 dark:border-emerald-900/50',
    text: 'text-emerald-800 dark:text-emerald-300',
    icon: <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-950/60',
    border: 'border-red-200 dark:border-red-900/50',
    text: 'text-red-800 dark:text-red-300',
    icon: <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
  },
  info: {
    bg: 'bg-sky-50 dark:bg-sky-950/60',
    border: 'border-sky-200 dark:border-sky-900/50',
    text: 'text-sky-800 dark:text-sky-300',
    icon: <Info className="h-5 w-5 text-sky-600 dark:text-sky-400" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => {
          const style = toastStyles[toast.type];
          return (
            <div
              key={toast.id}
              className={`flex items-start gap-3 rounded-xl border ${style.bg} ${style.border} px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2`}
            >
              <div className="flex-shrink-0 mt-0.5">{style.icon}</div>
              <p className={`flex-1 text-sm ${style.text}`}>{toast.message}</p>
              <button
                onClick={() => dismiss(toast.id)}
                className={`flex-shrink-0 ${style.text} opacity-60 hover:opacity-100 transition-opacity`}
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
