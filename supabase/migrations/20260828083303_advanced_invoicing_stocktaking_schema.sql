/*
# Advanced Invoicing & Stocktaking Schema

1. New Tables
- `inventory_adjustments`: logs stock discrepancies (losses, surpluses, stocktake results)
  - id (uuid PK)
  - company_id (uuid FK -> companies)
  - product_id (uuid FK -> products)
  - adjustment_type (text: 'LOSS' | 'SURPLUS' | 'STOCKTAKE')
  - difference_amount (int, negative for loss, positive for surplus)
  - reason (text)
  - created_at (timestamptz)

2. Modified Tables
- `outbound_invoices`: expanded for Polish accounting compliance
  - client_type (text: 'B2B' | 'B2C')
  - client_nip (text, nullable — required for B2B)
  - client_name (text — company name or person name)
  - client_address (text — street, postal code, city)
  - issue_date (date)
  - sale_date (date)
  - due_date (date)
  - payment_method (text: 'Przelew' | 'Gotówka' | 'Karta')
  - items (jsonb — array of line items with sku, name, quantity, unit_price_netto, vat_rate, total_netto, vat_amount, total_brutto)
  - summary_netto (decimal)
  - summary_vat (decimal)
  - summary_brutto (decimal)

3. Security
- RLS enabled on inventory_adjustments with owner-scoped CRUD (auth.uid() = company_id)
- RLS policies on outbound_invoices updated (existing policies already cover new columns since they are row-level, not column-level)

4. Important Notes
- All new columns on outbound_invoices are nullable to avoid breaking existing rows
- inventory_adjustments.difference_amount: negative = loss/shortage, positive = surplus/overage
- The STOCKTAKE adjustment_type is used when committing a full physical inventory count
*/

-- Create inventory_adjustments table
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('LOSS', 'SURPLUS', 'STOCKTAKE')),
  difference_amount int NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "select_own_inventory_adjustments" ON inventory_adjustments FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "insert_own_inventory_adjustments" ON inventory_adjustments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_inventory_adjustments" ON inventory_adjustments;
CREATE POLICY "delete_own_inventory_adjustments" ON inventory_adjustments FOR DELETE
  TO authenticated USING (auth.uid() = company_id);

-- Add Polish accounting columns to outbound_invoices
ALTER TABLE outbound_invoices
  ADD COLUMN IF NOT EXISTS client_type text DEFAULT 'B2B' CHECK (client_type IN ('B2B', 'B2C')),
  ADD COLUMN IF NOT EXISTS client_nip text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_address text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS sale_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'Przelew' CHECK (payment_method IN ('Przelew', 'Gotówka', 'Karta')),
  ADD COLUMN IF NOT EXISTS items jsonb,
  ADD COLUMN IF NOT EXISTS summary_netto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_vat numeric DEFAULT 0;

-- Create index for monthly loss queries
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_company_created
  ON inventory_adjustments(company_id, created_at);

-- Create index for outbound_invoices by company
CREATE INDEX IF NOT EXISTS idx_outbound_invoices_company
  ON outbound_invoices(company_id, created_at);
