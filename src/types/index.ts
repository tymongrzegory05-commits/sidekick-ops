export interface Company {
  id: string;
  company_name: string;
  industry: string;
  employee_count: number;
  created_at?: string;
}

export type Severity = 'High' | 'Medium' | 'Low';

export interface Bottleneck {
  area: string;
  description: string;
  severity: Severity;
}

export type SuggestedTier = 'Starter' | 'Growth' | 'Scale';

export interface Audit {
  id: string;
  company_id: string;
  financial_leak_estimate_pln: number;
  time_wasted_hours_monthly: number;
  bottlenecks: Bottleneck[];
  suggested_tier: SuggestedTier;
  monthly_price_pln: number;
  roi_summary: string;
  created_at?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  sku: string;
  current_stock: number;
  minimum_stock_alert: number;
  purchase_price_netto: number;
  vat_rate: number;
  selling_price_netto: number;
  created_at?: string;
}

export type MovementType = 'IN' | 'OUT';

export interface StockMovement {
  id: string;
  company_id: string;
  product_id: string;
  change_amount: number;
  movement_type: MovementType;
  created_at?: string;
}

export type AdjustmentType = 'LOSS' | 'SURPLUS' | 'STOCKTAKE';

export interface InventoryAdjustment {
  id: string;
  company_id: string;
  product_id: string;
  adjustment_type: AdjustmentType;
  difference_amount: number;
  reason: string | null;
  created_at?: string;
}

export interface PendingItem {
  sku: string;
  name: string;
  quantity_received: number;
  unit_price_netto: number;
  vat_rate: number;
  matched_product_id: string | null;
  matched_product_name: string | null;
  current_stock: number | null;
}

export interface ExtractedDelivery {
  supplier: string;
  total_netto: number;
  total_vat: number;
  total_brutto: number;
  items: {
    sku: string;
    name: string;
    quantity_received: number;
    unit_price_netto: number;
    vat_rate: number;
  }[];
}

export interface InvoiceHistory {
  id: string;
  company_id: string;
  supplier: string | null;
  total_netto: number;
  total_vat: number;
  total_brutto: number;
  document_url: string | null;
  created_at?: string;
}

export type ClientType = 'B2B' | 'B2C';
export type PaymentMethod = 'Przelew' | 'Gotówka' | 'Karta';

export interface InvoiceLineItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price_netto: number;
  vat_rate: number;
  total_netto: number;
  vat_amount: number;
  total_brutto: number;
}

export interface OutboundInvoice {
  id: string;
  user_id?: string | null;
  invoice_number: string | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
  buyer_nip?: string | null;
  issue_date: string | null;
  sale_date: string | null;
  payment_date?: string | null;
  payment_method: PaymentMethod | null;
  items: InvoiceLineItem[] | null;
  summary_netto: number;
  summary_vat: number;
  summary_brutto: number;
  status?: string | null;
  created_at?: string;
  company_id?: string;
  total_brutto?: number;
  pdf_url?: string | null;
  client_type?: ClientType | null;
  client_nip?: string | null;
  client_name?: string | null;
  client_address?: string | null;
  due_date?: string | null;
}

export type SmsStatus = 'pending' | 'sent';

export interface SmsRecipient {
  id: string;
  name: string;
  phone: string;
  date: string;
  amount: number;
  status: SmsStatus;
}

export type SettlementStatus = 'match' | 'mismatch';

export interface DailySettlement {
  id: string;
  company_id?: string;
  date: string;
  employee_name: string;
  declared_cash: number;
  declared_card: number;
  kw_amount: number;
  register_cash: number;
  register_card: number;
  terminal_card: number;
  status: SettlementStatus;
  discrepancy_amount: number;
  notes: string | null;
  created_at?: string;
}
