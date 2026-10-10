import { generatePredictiveAlert } from '@/lib/inventory';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Company, Product, InventoryAdjustment } from '@/types';
import {
  AlertTriangle,
  CheckCircle,
  ClipboardCheck,
  Coins,
  Loader2,
  Package,
  PackagePlus,
  Search,
  Sparkles,
  TrendingDown,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface InventoryViewProps {
  company: Company;
  onOpenSmartScan: () => void;
  onOpenStocktake: () => void;
  onOpenLossReport: () => void;
  onRefreshKey: number;
}

export function InventoryView({ company, onOpenSmartScan, onOpenStocktake, onOpenLossReport, onRefreshKey }: InventoryViewProps) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newStock, setNewStock] = useState('');
  const [newMinAlert, setNewMinAlert] = useState('');
  const [newPurchasePrice, setNewPurchasePrice] = useState('');
  const [newVatRate, setNewVatRate] = useState('23');
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [predictiveAlert, setPredictiveAlert] = useState<string | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'value'>('name');
  const [showShortagesOnly, setShowShortagesOnly] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [prodRes, adjRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate, selling_price_netto, created_at')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('inventory_adjustments')
          .select('id, company_id, product_id, adjustment_type, difference_amount, reason, created_at')
          .eq('company_id', company.id)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
          .order('created_at', { ascending: false }),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (adjRes.error) throw adjRes.error;

      setProducts((prodRes.data as Product[]) ?? []);
      setAdjustments((adjRes.data as InventoryAdjustment[]) ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się pobrać danych.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefreshKey]);

  async function loadPredictiveAlert() {
    const lowStock = products.filter((p) => p.current_stock <= p.minimum_stock_alert);
    if (lowStock.length === 0) {
      setPredictiveAlert(null);
      return;
    }

    setAlertLoading(true);
    try {
      const alert = await generatePredictiveAlert(lowStock);
      setPredictiveAlert(alert);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się wygenerować rekomendacji.';
      showToast(msg, 'error');
    } finally {
      setAlertLoading(false);
    }
  }

  useEffect(() => {
    if (!loading && products.length > 0) {
      loadPredictiveAlert();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, loading]);

  async function handleAddProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newSku.trim()) {
      showToast('Podaj nazwę i SKU produktu.', 'error');
      return;
    }

    const stock = parseInt(newStock, 10) || 0;
    const minAlert = parseInt(newMinAlert, 10) || 0;
    const purchasePrice = parseFloat(newPurchasePrice) || 0;
    const vatRate = parseInt(newVatRate, 10) || 23;
    const sellingPrice = parseFloat(newSellingPrice) || 0;

    setAdding(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          company_id: company.id,
          name: newName.trim(),
          sku: newSku.trim(),
          current_stock: stock,
          minimum_stock_alert: minAlert,
          purchase_price_netto: purchasePrice,
          vat_rate: vatRate,
          selling_price_netto: sellingPrice,
        })
        .select('id, company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate, selling_price_netto, created_at')
        .single();

      if (error) throw error;

      if (stock !== 0) {
        await supabase.from('stock_movements').insert({
          company_id: company.id,
          product_id: (data as Product).id,
          change_amount: stock,
          movement_type: 'IN',
        });
      }

      setProducts([data as Product, ...products]);
      setNewName('');
      setNewSku('');
      setNewStock('');
      setNewMinAlert('');
      setNewPurchasePrice('');
      setNewVatRate('23');
      setNewSellingPrice('');
      setShowAddForm(false);
      showToast('Produkt dodany pomyślnie.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się dodać produktu.';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        showToast('Produkt o tym SKU już istnieje.', 'error');
      } else {
        showToast(msg, 'error');
      }
    } finally {
      setAdding(false);
    }
  }

  const lowStockCount = products.filter((p) => p.current_stock <= p.minimum_stock_alert).length;
  const warehouseValueNetto = products.reduce((sum, p) => sum + p.current_stock * (p.purchase_price_netto ?? 0), 0);
  const warehouseValueBrutto = products.reduce((sum, p) => {
    const netto = p.current_stock * (p.purchase_price_netto ?? 0);
    return sum + netto * (1 + (p.vat_rate ?? 0) / 100);
  }, 0);
  const monthlyLosses = adjustments
    .filter((a) => a.adjustment_type === 'LOSS' || (a.adjustment_type === 'STOCKTAKE' && a.difference_amount < 0))
    .reduce((sum, a) => {
      const product = products.find((p) => p.id === a.product_id);
      return sum + Math.abs(a.difference_amount) * (product?.purchase_price_netto ?? 0);
    }, 0);

  const filteredProducts = useMemo(() => {
    let result = [...products];

    if (showShortagesOnly) {
      result = result.filter((p) => p.current_stock <= p.minimum_stock_alert);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );
    }

    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'stock') {
      result.sort((a, b) => a.current_stock - b.current_stock);
    } else if (sortBy === 'value') {
      result.sort((a, b) => (b.current_stock * (b.purchase_price_netto ?? 0)) - (a.current_stock * (a.purchase_price_netto ?? 0)));
    }

    return result;
  }, [products, searchQuery, sortBy, showShortagesOnly]);

  function formatPLN(value: number): string {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
      maximumFractionDigits: 2,
    }).format(value);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Magazyn AI</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {products.length} produktów · {lowStockCount > 0 && (
              <span className="text-red-600 dark:text-red-400 font-medium">{lowStockCount} poniżej progu alertu · </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all"
          >
            <PackagePlus className="h-4 w-4" />
            Dodaj produkt
          </button>
          <button
            onClick={onOpenLossReport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all"
          >
            <TrendingDown className="h-4 w-4" />
            Zgłoś stratę
          </button>
          <button
            onClick={onOpenStocktake}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-all"
          >
            <ClipboardCheck className="h-4 w-4" />
            Inwentaryzacja
          </button>
          <button
            onClick={onOpenSmartScan}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent-600 hover:bg-accent-500 hover:shadow-glow transition-all"
          >
            <Sparkles className="h-4 w-4" />
            Skan AI
          </button>
        </div>
      </div>

      {/* Financial cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Coins className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Wartość magazynu netto</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatPLN(warehouseValueNetto)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Brutto: {formatPLN(warehouseValueBrutto)}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Poniżej progu alertu</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{lowStockCount}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">produktów wymaga uzupełnienia</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Straty w tym miesiącu</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatPLN(monthlyLosses)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{adjustments.filter(a => a.adjustment_type === 'LOSS' || (a.adjustment_type === 'STOCKTAKE' && a.difference_amount < 0)).length} korekt</p>
        </div>
      </div>

      {showAddForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nowy produkt</h3>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nazwa</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="np. Śrubki M8"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">SKU</label>
              <input type="text" value={newSku} onChange={(e) => setNewSku(e.target.value)} placeholder="np. SRB-M8"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stan początkowy</label>
              <input type="number" min="0" value={newStock} onChange={(e) => setNewStock(e.target.value)} placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Próg alertu</label>
              <input type="number" min="0" value={newMinAlert} onChange={(e) => setNewMinAlert(e.target.value)} placeholder="10"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Cena zakupu netto</label>
              <input type="number" min="0" step="0.01" value={newPurchasePrice} onChange={(e) => setNewPurchasePrice(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Stawka VAT (%)</label>
              <input type="number" min="0" max="100" value={newVatRate} onChange={(e) => setNewVatRate(e.target.value)} placeholder="23"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Cena sprzedaży netto</label>
              <input type="number" min="0" step="0.01" value={newSellingPrice} onChange={(e) => setNewSellingPrice(e.target.value)} placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="submit" disabled={adding}
                className="px-4 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-500 hover:shadow-glow disabled:opacity-60 transition-all flex items-center gap-2">
                {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                Dodaj produkt
              </button>
            </div>
          </form>
        </div>
      )}

      {predictiveAlert && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/50 p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">Rekomendacja AI — uzupełnienie zapasów</h3>
              {alertLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">Generowanie rekomendacji...</span>
                </div>
              ) : (
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">{predictiveAlert}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400 dark:text-slate-500" />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Package className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Brak produktów w magazynie. Dodaj pierwszy produkt lub zeskanuj dokument dostawy.</p>
        </div>
      ) : (
        <div>
          {/* Control bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj po nazwie lub SKU..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'value')}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent bg-white dark:bg-slate-900"
              >
                <option value="name">Alfabetycznie (A-Z)</option>
                <option value="stock">Stan: od najmniejszego</option>
                <option value="value">Wartość magazynu: najwyższa</option>
              </select>
              <button
                onClick={() => setShowShortagesOnly(!showShortagesOnly)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${showShortagesOnly ? 'bg-red-600 text-white border border-red-600' : 'text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                <AlertTriangle className="h-4 w-4" />
                Pokaż braki
              </button>
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
              <Package className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Brak produktów spełniających kryteria filtrowania.</p>
            </div>
          ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Nazwa</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">SKU</th>
                <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Stan</th>
                <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Alert</th>
                <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Cena netto</th>
                <th className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((product) => {
                const isLow = product.current_stock <= product.minimum_stock_alert;
                return (
                  <tr key={product.id} className={`transition-colors ${isLow ? 'bg-red-50 dark:bg-red-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">{product.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 font-mono">{product.sku}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-slate-900 dark:text-slate-100">{product.current_stock}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-500 dark:text-slate-400">{product.minimum_stock_alert}</td>
                    <td className="px-4 py-3 text-sm text-right text-slate-600 dark:text-slate-400">{formatPLN(product.purchase_price_netto ?? 0)}</td>
                    <td className="px-4 py-3 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Niski stan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle className="h-3.5 w-3.5" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          )}
        </div>
      )}
    </div>
  );
}
