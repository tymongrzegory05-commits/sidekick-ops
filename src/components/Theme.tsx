import { Moon, Sun } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sidekick-theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

function readInitialTheme(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    /* localStorage niedostępny */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* localStorage niedostępny — motyw obowiązuje tylko w tej sesji */
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

interface ThemeToggleProps {
  className?: string;
}

/** Elegancki przełącznik Jasny / Ciemny — ikona Słońce / Księżyc. */
export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
      title={isDark ? 'Jasny motyw' : 'Ciemny motyw'}
      className={`relative inline-flex items-center h-8 w-14 rounded-full border transition-colors ${
        isDark
          ? 'bg-slate-800 border-slate-700'
          : 'bg-accent-100 border-accent-200'
      } ${className}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white dark:bg-slate-950 shadow-sm flex items-center justify-center transition-transform duration-200 ${
          isDark ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-sky-400" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-accent-500" />
        )}
      </span>
    </button>
  );
}
