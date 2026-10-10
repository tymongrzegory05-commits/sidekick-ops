import { AuditChat } from '@/components/AuditChat';
import { AuthScreen } from '@/components/AuthScreen';
import { CancellationProtocol } from '@/components/CancellationProtocol';
import { Dashboard } from '@/components/Dashboard';
import { DashboardOverview } from '@/components/DashboardOverview';
import { EnvWarningBanner } from '@/components/EnvWarningBanner';
import { InventoryView } from '@/components/InventoryView';
import { InvoicesView } from '@/components/InvoicesView';
import { LossReportModal } from '@/components/LossReportModal';
import { Onboarding } from '@/components/Onboarding';
import { SettingsView } from '@/components/SettingsView';
import { SettlementsScanner } from '@/components/SettlementsScanner';
import { Sidebar, type ModuleId } from '@/components/Sidebar';
import { SmartScan } from '@/components/SmartScan';
import { SmsQueue } from '@/components/SmsQueue';
import { StocktakeView } from '@/components/StocktakeView';
import { ThemeProvider } from '@/components/Theme';
import { ToastProvider, useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import type { Audit, Company, Product } from '@/types';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type AppState = 'loading' | 'auth' | 'onboarding' | 'app';

function AppContent() {
  const { showToast } = useToast();
  const [appState, setAppState] = useState<AppState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [showSmartScan, setShowSmartScan] = useState(false);
  const [showStocktake, setShowStocktake] = useState(false);
  const [showLossReport, setShowLossReport] = useState(false);
  const [inventoryProducts, setInventoryProducts] = useState<Product[]>([]);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [dashboardStats, setDashboardStats] = useState({
    productCount: 0,
    lowStockCount: 0,
    warehouseValue: 0,
    invoiceCount: 0,
  });

  async function loadDashboardStats(companyId: string) {
    const { data: products } = await supabase
      .from('products')
      .select('current_stock, minimum_stock_alert, purchase_price_netto')
      .eq('company_id', companyId);

    const productList = (products ?? []) as Pick<Product, 'current_stock' | 'minimum_stock_alert' | 'purchase_price_netto'>[];
    const lowStock = productList.filter((p) => p.current_stock <= p.minimum_stock_alert).length;
    const warehouseValue = productList.reduce((sum, p) => sum + p.current_stock * (p.purchase_price_netto ?? 0), 0);

    const { count } = await supabase
      .from('invoices_history')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);

    setDashboardStats({
      productCount: productList.length,
      lowStockCount: lowStock,
      warehouseValue,
      invoiceCount: count ?? 0,
    });
  }

  async function loadUserData(id: string) {
    const { data: companyData } = await supabase
      .from('companies')
      .select('id, company_name, industry, employee_count, created_at')
      .eq('id', id)
      .maybeSingle();

    if (!companyData) {
      setCompany(null);
      setAppState('onboarding');
      return;
    }

    setCompany(companyData as Company);

    const { data: auditData } = await supabase
      .from('audits')
      .select('id, company_id, financial_leak_estimate_pln, time_wasted_hours_monthly, bottlenecks, suggested_tier, monthly_price_pln, roi_summary, created_at')
      .eq('company_id', id)
      .maybeSingle();

    setAudit(auditData ? (auditData as Audit) : null);
    await loadDashboardStats(id);
    setAppState('app');
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        loadUserData(session.user.id);
      } else {
        setAppState('auth');
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          setUserId(session.user.id);
          await loadUserData(session.user.id);
        } else {
          setUserId(null);
          setCompany(null);
          setAudit(null);
          setAppState('auth');
        }
      })();
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAuthSuccess() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUserId(session.user.id);
      await loadUserData(session.user.id);
    }
  }

  async function handleOnboardingDone() {
    if (userId) await loadUserData(userId);
  }

  async function handleAuditComplete() {
    if (userId) await loadUserData(userId);
  }

  function handleRestart() {
    setAudit(null);
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast('Nie udało się wylogować.', 'error');
    } else {
      showToast('Wylogowano pomyślnie.', 'info');
    }
  }

  function handleOpenSmartScan() {
    setShowSmartScan(true);
  }

  function handleOpenStocktake() {
    setShowStocktake(true);
  }

  function handleStocktakeBack() {
    setShowStocktake(false);
  }

  function handleOpenLossReport() {
    setShowLossReport(true);
  }

  async function loadInventoryProducts() {
    if (!company) return;
    const { data } = await supabase
      .from('products')
      .select('id, company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate, selling_price_netto, created_at')
      .eq('company_id', company.id);
    if (data) setInventoryProducts(data as Product[]);
  }

  useEffect(() => {
    if (showLossReport) loadInventoryProducts();
  }, [showLossReport]);

  function handleSmartScanBack() {
    setShowSmartScan(false);
  }

  function handleSmartScanConfirmed() {
    setShowSmartScan(false);
    setInventoryRefreshKey((k) => k + 1);
    if (company) loadDashboardStats(company.id);
    setActiveModule('inventory');
  }

  function handleStocktakeCompleted() {
    setInventoryRefreshKey((k) => k + 1);
    if (company) loadDashboardStats(company.id);
  }

  function handleLossReported() {
    setInventoryRefreshKey((k) => k + 1);
    if (company) loadDashboardStats(company.id);
  }

  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500 dark:text-slate-600" />
      </div>
    );
  }

  if (appState === 'auth') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-950">
        <EnvWarningBanner />
        <AuthScreen onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  if (appState === 'onboarding' && userId) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-950">
        <EnvWarningBanner />
        <Onboarding userId={userId} onDone={handleOnboardingDone} />
      </div>
    );
  }

  if (appState === 'app' && company) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-950 print:bg-white">
        <EnvWarningBanner />
        <div className="flex">
          <Sidebar
            activeModule={activeModule}
            onModuleChange={(m) => {
              setActiveModule(m);
              setShowSmartScan(false);
              setShowStocktake(false);
              setShowLossReport(false);
            }}
            company={company}
            onSignOut={handleSignOut}
          />
          <main className="flex-1 min-h-screen print:min-h-0">
            {activeModule === 'dashboard' && (
              <DashboardOverview
                company={company}
                audit={audit}
                onNavigate={(m) => setActiveModule(m)}
                productCount={dashboardStats.productCount}
                lowStockCount={dashboardStats.lowStockCount}
                warehouseValue={dashboardStats.warehouseValue}
                invoiceCount={dashboardStats.invoiceCount}
              />
            )}
            {activeModule === 'audit' && (
              audit ? (
                <Dashboard company={company} audit={audit} onRestart={handleRestart} />
              ) : (
                userId && (
                  <AuditChat
                    userId={userId}
                    company={company}
                    onAuditComplete={handleAuditComplete}
                  />
                )
              )
            )}
            {activeModule === 'inventory' && (
              showSmartScan ? (
                <SmartScan
                  company={company}
                  onBack={handleSmartScanBack}
                  onConfirmed={handleSmartScanConfirmed}
                />
              ) : showStocktake ? (
                <StocktakeView
                  company={company}
                  onBack={handleStocktakeBack}
                  onCompleted={handleStocktakeCompleted}
                />
              ) : (
                <>
                  <InventoryView
                    company={company}
                    onOpenSmartScan={handleOpenSmartScan}
                    onOpenStocktake={handleOpenStocktake}
                    onOpenLossReport={handleOpenLossReport}
                    onRefreshKey={inventoryRefreshKey}
                  />
                  {showLossReport && (
                    <LossReportModal
                      company={company}
                      products={inventoryProducts}
                      onClose={() => setShowLossReport(false)}
                      onReported={handleLossReported}
                    />
                  )}
                </>
              )
            )}
            {activeModule === 'invoices' && (
              <InvoicesView company={company} />
            )}
            {activeModule === 'settlements' && (
              <SettlementsScanner company={company} />
            )}
            {activeModule === 'cancellations' && (
              <CancellationProtocol />
            )}
            {activeModule === 'sms' && (
              <SmsQueue />
            )}
            {activeModule === 'settings' && (
              <SettingsView company={company} />
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900/60 dark:bg-slate-950 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500 dark:text-slate-600" />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}
