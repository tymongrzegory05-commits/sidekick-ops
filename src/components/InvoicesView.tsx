import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Company, Product, ClientType, PaymentMethod, InvoiceLineItem } from '@/types';
import {
  Building2,
  CheckCircle,
  FileText,
  Loader2,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  User,
  X,
  Download,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { extractReceiptItems } from '@/lib/inventory';

interface InvoicesViewProps {
  company: Company;
}

interface DraftLineItem {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: string;
  unit_price_netto: string;
  vat_rate: string;
}

function emptyLineItem(): DraftLineItem {
  return { product_id: null, sku: '', name: '', quantity: '1', unit_price_netto: '0', vat_rate: '23' };
}

function calcLine(item: DraftLineItem): { total_netto: number; vat_amount: number; total_brutto: number } {
  const qty = parseFloat(item.quantity) || 0;
  const price = parseFloat(item.unit_price_netto) || 0;
  const vat = parseFloat(item.vat_rate) || 0;
  const total_netto = qty * price;
  const vat_amount = total_netto * (vat / 100);
  const total_brutto = total_netto + vat_amount;
  return { total_netto, vat_amount, total_brutto };
}

function formatPLN(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface FakturowniaInvoiceItem {
  id: number | string;
  number?: string;
  buyer_name?: string;
  buyer_tax_no?: string;
  price_gross?: string | number;
  issue_date?: string;
}

interface FakturowniaCreds {
  token: string;
  domain: string;
}

export function InvoicesView({ company }: InvoicesViewProps) {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<FakturowniaInvoiceItem[]>([]);
  const [fakturowniaCreds, setFakturowniaCreds] = useState<FakturowniaCreds | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [issuing, setIssuing] = useState(false);

  const [clientType, setClientType] = useState<ClientType>('B2B');
  const [clientName, setClientName] = useState('');
  const [clientNip, setClientNip] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr());
  const [saleDate, setSaleDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState(addDays(todayStr(), 14));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Przelew');
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([emptyLineItem()]);
  const [clientNotes, setClientNotes] = useState('');
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  async function fetchInvoices() {
    const { data: userData } = await supabase.auth.getUser();
    const meta = userData.user?.user_metadata ?? {};
    const token: string | undefined = meta.fakturownia_token;
    const domain: string | undefined = meta.fakturownia_domain;

    if (!token || !domain) {
      setFakturowniaCreds(null);
      setInvoices([]);
      return;
    }

    setFakturowniaCreds({ token, domain });

    try {
      const response = await fetch(`/api/fakturownia/invoices.json?api_token=${encodeURIComponent(token)}`);
      if (!response.ok) {
        console.warn('FAKTUROWNIA API ERROR (fetchInvoices):', await response.text());
        setInvoices([]);
        return;
      }
      const data = await response.json();
      setInvoices(Array.isArray(data) ? (data as FakturowniaInvoiceItem[]) : []);
    } catch (err) {
      console.warn('FAKTUROWNIA API ERROR (fetchInvoices):', err);
      setInvoices([]);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [, prodRes] = await Promise.all([
        fetchInvoices(),
        supabase
          .from('products')
          .select('id, company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate, selling_price_netto, created_at')
          .eq('company_id', company.id)
          .order('name', { ascending: true }),
      ]);
      if (prodRes.error) throw prodRes.error;
      setProducts((prodRes.data as Product[]) ?? []);
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
  }, []);

  const totals = useMemo(() => {
    let netto = 0;
    let vat = 0;
    let brutto = 0;
    for (const item of lineItems) {
      const c = calcLine(item);
      netto += c.total_netto;
      vat += c.vat_amount;
      brutto += c.total_brutto;
    }
    return { netto, vat, brutto };
  }, [lineItems]);

  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLineItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        unit_price_netto: String(product.selling_price_netto || product.purchase_price_netto || 0),
        vat_rate: String(product.vat_rate || 23),
      };
      return copy;
    });
  }

  function updateLineItem(index: number, field: keyof DraftLineItem, value: string) {
    setLineItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleReceiptScan(file: File) {
    setReceiptFile(file);
    setScanningReceipt(true);
    try {
      const items = await extractReceiptItems(file);
      if (items.length === 0) {
        showToast('AI nie znalazło pozycji na paragonie.', 'info');
        return;
      }
      const newItems: DraftLineItem[] = items.map((item) => ({
        product_id: null,
        sku: '',
        name: item.name,
        quantity: String(item.quantity),
        unit_price_netto: String(item.unit_price_netto.toFixed(2)),
        vat_rate: String(item.vat_rate),
      }));
      setLineItems(newItems);
      showToast(`AI zaciągnęło ${newItems.length} pozycji z paragonu.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nie udało się przeanalizować paragonu.';
      showToast(msg, 'error');
    } finally {
      setScanningReceipt(false);
    }
  }

  function resetForm() {
    setClientType('B2B');
    setClientName('');
    setClientNip('');
    setClientAddress('');
    setClientEmail('');
    setIssueDate(todayStr());
    setSaleDate(todayStr());
    setDueDate(addDays(todayStr(), 14));
    setPaymentMethod('Przelew');
    setLineItems([emptyLineItem()]);
    setClientNotes('');
    setReceiptFile(null);
  }

  async function handleIssueInvoice(e: React.FormEvent) {
    e.preventDefault();

    if (!clientName.trim()) {
      showToast('Podaj nazwę klienta.', 'error');
      return;
    }
    if (clientType === 'B2B' && !clientNip.trim()) {
      showToast('NIP jest wymagany dla faktury B2B.', 'error');
      return;
    }
    if (lineItems.length === 0 || lineItems.every((li) => !li.name.trim())) {
      showToast('Dodaj co najmniej jedną pozycję faktury.', 'error');
      return;
    }

    const validItems = lineItems.filter((li) => li.name.trim() && parseFloat(li.quantity) > 0);
    if (validItems.length === 0) {
      showToast('Dodaj co najmniej jedną pozycję z ilością większą od zera.', 'error');
      return;
    }

    setIssuing(true);
    try {
      const itemsJson: InvoiceLineItem[] = validItems.map((li) => {
        const c = calcLine(li);
        return {
          sku: li.sku,
          name: li.name,
          quantity: parseFloat(li.quantity) || 0,
          unit_price_netto: parseFloat(li.unit_price_netto) || 0,
          vat_rate: parseFloat(li.vat_rate) || 0,
          total_netto: parseFloat(c.total_netto.toFixed(2)),
          vat_amount: parseFloat(c.vat_amount.toFixed(2)),
          total_brutto: parseFloat(c.total_brutto.toFixed(2)),
        };
      });

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      const meta = user?.user_metadata ?? {};
      const token = meta.fakturownia_token;
      const domain = meta.fakturownia_domain;

      let invoiceNumber = '—';

      if (token && domain) {
        try {
          const positions = itemsJson.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            total_price_net: item.total_netto,
            tax: Math.round(item.vat_rate),
            total_price_gross: item.total_brutto,
          }));

          const response = await fetch('/api/fakturownia/invoices.json', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              api_token: token,
              invoice: {
                kind: 'vat',
                buyer_name: clientName.trim(),
                buyer_tax_no: clientNip.trim() || '',
                issue_date: issueDate,
                sell_date: saleDate,
                payment_to: dueDate,
                positions,
              },
            }),
          });

          if (!response.ok) {
            let errMessage = 'Błąd API Fakturowni';
            try {
              const err = await response.json();
              console.error('FAKTUROWNIA API ERROR:', err);
              errMessage = 'Błąd Fakturowni: ' + (err.message || JSON.stringify(err));
            } catch {
              const errText = await response.text();
              console.error('FAKTUROWNIA API ERROR (non-JSON):', errText);
              if (errText) errMessage = 'Błąd Fakturowni: ' + errText;
            }
            throw new Error(errMessage);
          }

          const result = await response.json();
          invoiceNumber = result.number ?? '—';
        } catch (fakturowniaErr) {
          console.error('FAKTUROWNIA API ERROR:', fakturowniaErr);
          const msg = fakturowniaErr instanceof Error ? fakturowniaErr.message : 'Nie udało się wystawić faktury w Fakturowni.';
          showToast(msg, 'error');
          return;
        }
      }

      try {
        const { error: insertError } = await supabase.from('outbound_invoices').insert({
          buyer_name: clientName.trim(),
          buyer_nip: clientType === 'B2B' ? clientNip.trim() : null,
          summary_netto: parseFloat(totals.netto.toFixed(2)),
          summary_vat: parseFloat(totals.vat.toFixed(2)),
          summary_brutto: parseFloat(totals.brutto.toFixed(2)),
          issue_date: issueDate,
          payment_method: paymentMethod,
          status: 'issued',
        });

        if (insertError) {
          console.warn('SUPABASE ERROR (outbound_invoices insert):', insertError);
        }
      } catch (supabaseErr) {
        console.warn('SUPABASE ERROR (outbound_invoices insert):', supabaseErr);
      }

      showToast(
        invoiceNumber !== '—' ? `Faktura ${invoiceNumber} wystawiona pomyślnie` : 'Faktura wystawiona pomyślnie',
        'success',
      );
      resetForm();
      setShowForm(false);
      await fetchInvoices();
    } catch (err) {
      console.error('ISSUE INVOICE ERROR:', err);
      const msg = err instanceof Error ? err.message : 'Nie udało się wystawić faktury.';
      showToast(msg, 'error');
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Faktury</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Wystawiaj faktury zgodnie z polskim prawem księgowym</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-accent-600 hover:bg-accent-500 hover:shadow-glow transition-all"
        >
          <Plus className="h-4 w-4" />
          Wystaw fakturę
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nowa faktura</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleIssueInvoice} className="space-y-5">
            {/* Client Type Toggle */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Typ klienta</label>
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setClientType('B2B')}
                  className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${clientType === 'B2B' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  <Building2 className="h-4 w-4" />
                  Firma (NIP)
                </button>
                <button
                  type="button"
                  onClick={() => setClientType('B2C')}
                  className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${clientType === 'B2C' ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  <User className="h-4 w-4" />
                  Osoba fizyczna
                </button>
              </div>
            </div>

            {/* Client fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {clientType === 'B2B' ? 'Nazwa firmy' : 'Imię i nazwisko'}
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder={clientType === 'B2B' ? 'np. Kowalski Sp. z o.o.' : 'np. Jan Kowalski'}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                />
              </div>
              {clientType === 'B2B' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">NIP <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={clientNip}
                    onChange={(e) => setClientNip(e.target.value)}
                    placeholder="1234567890"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Adres</label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="ul. Przykładowa 1, 00-001 Warszawa"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                />
              </div>
              {clientType === 'B2C' && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Uwagi</label>
                  <input
                    type="text"
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    placeholder="Dodatkowe uwagi do faktury..."
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">E-mail klienta</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="klient@firma.pl"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Sposób płatności</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent bg-white dark:bg-slate-900"
                >
                  <option value="Przelew">Przelew</option>
                  <option value="Gotówka">Gotówka</option>
                  <option value="Karta">Karta</option>
                </select>
              </div>
            </div>

            {/* Date pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Data wystawienia</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Data sprzedaży</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Termin płatności</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                />
              </div>
            </div>

            {/* Receipt OCR Upload (B2C only) */}
            {clientType === 'B2C' && (
              <div>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleReceiptScan(file);
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={scanningReceipt}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                >
                  {scanningReceipt ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-slate-500 dark:text-slate-400" />
                      AI analizuje paragon...
                    </>
                  ) : receiptFile ? (
                    <>
                      <Receipt className="h-5 w-5 text-emerald-500" />
                      {receiptFile.name} — kliknij, aby zmienić
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                      Załącz paragon (AI zaciągnie pozycje)
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Line Items Builder */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Pozycje faktury</label>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Dodaj pozycję
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-3 py-2">Produkt</th>
                      <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-2 py-2">Ilość</th>
                      <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-2 py-2">Cena netto</th>
                      <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-2 py-2">VAT%</th>
                      <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-2 py-2">Netto</th>
                      <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-2 py-2">VAT</th>
                      <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase px-2 py-2">Brutto</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {lineItems.map((item, i) => {
                      const c = calcLine(item);
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 min-w-[200px]">
                            {products.length > 0 ? (
                              <select
                                    value={item.product_id ?? ''}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        handleProductSelect(i, e.target.value);
                                      } else {
                                        updateLineItem(i, 'product_id', '');
                                        updateLineItem(i, 'sku', '');
                                        updateLineItem(i, 'name', '');
                                      }
                                    }}
                                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent bg-white dark:bg-slate-900"
                                  >
                                    <option value="">— wybierz produkt —</option>
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name} ({p.sku})
                                      </option>
                                    ))}
                                  </select>
                            ) : (
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateLineItem(i, 'name', e.target.value)}
                                placeholder="Nazwa produktu"
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                              />
                            )}
                            {item.sku && (
                              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{item.sku}</p>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(i, 'quantity', e.target.value)}
                              className="w-16 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-right focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price_netto}
                              onChange={(e) => updateLineItem(i, 'unit_price_netto', e.target.value)}
                              className="w-20 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-right focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.vat_rate}
                              onChange={(e) => updateLineItem(i, 'vat_rate', e.target.value)}
                              className="w-14 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-right focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                            />
                          </td>
                          <td className="px-2 py-2 text-right text-xs font-medium text-slate-700 dark:text-slate-300">{formatPLN(c.total_netto)}</td>
                          <td className="px-2 py-2 text-right text-xs text-slate-500 dark:text-slate-400">{formatPLN(c.vat_amount)}</td>
                          <td className="px-2 py-2 text-right text-xs font-semibold text-slate-900 dark:text-slate-100">{formatPLN(c.total_brutto)}</td>
                          <td className="px-2 py-2">
                            {lineItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLineItem(i)}
                                className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-4 flex justify-end">
              <div className="w-full sm:w-72 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Suma netto:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatPLN(totals.netto)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Suma VAT:</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{formatPLN(totals.vat)}</span>
                </div>
                <div className="flex justify-between text-base pt-1.5 border-t border-slate-200 dark:border-slate-800">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Suma brutto:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{formatPLN(totals.brutto)}</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={issuing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {issuing ? 'Wystawianie...' : 'Wystaw fakturę'}
            </button>
          </form>
        </div>
      )}

      <div className="mt-2">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Historia faktur</h3>

        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-8 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-slate-400 dark:text-slate-500" />
              <p className="text-sm text-slate-400 dark:text-slate-500">Ładowanie historii…</p>
            </div>
            <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
            <FileText className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Brak wystawionych faktur</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Wystaw pierwszą fakturę, a pojawi się tutaj.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 dark:shadow-none border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Numer</th>
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Nabywca</th>
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">NIP</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Kwota brutto</th>
                    <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Data</th>
                    <th className="text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Akcje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.map((inv, index) => {
                    const grossValue = typeof inv.price_gross === 'string' ? parseFloat(inv.price_gross) : (inv.price_gross ?? 0);
                    const issueDateLabel = inv.issue_date
                      ? new Date(inv.issue_date).toLocaleDateString('pl-PL')
                      : '—';
                    const pdfUrl = fakturowniaCreds
                      ? `https://${fakturowniaCreds.domain}.fakturownia.pl/invoices/${inv.id}.pdf?api_token=${fakturowniaCreds.token}`
                      : null;

                    return (
                    <tr key={inv.id ?? `invoice-${index}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {inv.number ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {inv.buyer_name ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-500 dark:text-slate-400 font-mono">
                        {inv.buyer_tax_no || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatPLN(grossValue || 0)}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {issueDateLabel}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-right">
                        {pdfUrl ? (
                          <a
                            href={pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Pobierz PDF
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Wkrótce"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/60 cursor-not-allowed"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Pobierz PDF
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
