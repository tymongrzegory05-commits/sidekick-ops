import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/Theme';
import type { Company } from '@/types';
import {
  ClipboardCheck,
  FileText,
  FileX,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  Package,
  Receipt,
  Settings,
} from 'lucide-react';

export type ModuleId = 'dashboard' | 'audit' | 'inventory' | 'invoices' | 'settlements' | 'cancellations' | 'sms' | 'settings';

interface SidebarProps {
  activeModule: ModuleId;
  onModuleChange: (module: ModuleId) => void;
  company: Company;
  onSignOut: () => void;
}

export function Sidebar({ activeModule, onModuleChange, company, onSignOut }: SidebarProps) {
  const navItems: { id: ModuleId; label: string; icon: typeof ClipboardCheck }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'audit', label: 'Audyt AI', icon: ClipboardCheck },
    { id: 'inventory', label: 'Magazyn AI', icon: Package },
    { id: 'invoices', label: 'Faktury', icon: FileText },
    { id: 'settlements', label: 'Rozliczenia', icon: Receipt },
    { id: 'cancellations', label: 'Anulacje', icon: FileX },
    { id: 'sms', label: 'Powiadomienia SMS', icon: MessageCircleMore },
    { id: 'settings', label: 'Ustawienia', icon: Settings },
  ];

  return (
    <aside className="print:hidden w-60 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col h-screen sticky top-0 flex-shrink-0">
      <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center">
        <Logo subtitle="B2B Operations" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onModuleChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-400'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-medium text-slate-400 dark:text-slate-500">Motyw</p>
          <ThemeToggle />
        </div>

        <div className="px-2">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{company.company_name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{company.industry}</p>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5 transition-all"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Wyloguj się
        </button>
      </div>
    </aside>
  );
}
