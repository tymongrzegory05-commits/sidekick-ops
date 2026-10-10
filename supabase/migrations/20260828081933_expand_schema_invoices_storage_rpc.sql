/*
# Expand schema: product price fields, invoices_history, outbound_invoices, storage bucket, RPC function

1. Alter products: add purchase_price_netto, vat_rate, selling_price_netto
2. New tables: invoices_history, outbound_invoices
3. Storage bucket: inventory_documents
4. RPC function: receive_inventory_delivery
5. RLS on all new tables + storage policies
*/

-- Add price columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS purchase_price_netto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_rate int DEFAULT 23,
  ADD COLUMN IF NOT EXISTS selling_price_netto numeric DEFAULT 0;

-- invoices_history
CREATE TABLE IF NOT EXISTS invoices_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  supplier text,
  total_netto numeric DEFAULT 0,
  total_vat numeric DEFAULT 0,
  total_brutto numeric DEFAULT 0,
  document_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoices_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_invoices_history" ON invoices_history;
CREATE POLICY "select_own_invoices_history" ON invoices_history FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_invoices_history" ON invoices_history;
CREATE POLICY "insert_own_invoices_history" ON invoices_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_invoices_history" ON invoices_history;
CREATE POLICY "delete_own_invoices_history" ON invoices_history FOR DELETE
  TO authenticated USING (auth.uid() = company_id);

-- outbound_invoices
CREATE TABLE IF NOT EXISTS outbound_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number text,
  total_brutto numeric DEFAULT 0,
  pdf_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE outbound_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_outbound_invoices" ON outbound_invoices;
CREATE POLICY "select_own_outbound_invoices" ON outbound_invoices FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_outbound_invoices" ON outbound_invoices;
CREATE POLICY "insert_own_outbound_invoices" ON outbound_invoices FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_outbound_invoices" ON outbound_invoices;
CREATE POLICY "delete_own_outbound_invoices" ON outbound_invoices FOR DELETE
  TO authenticated USING (auth.uid() = company_id);

-- Storage bucket for inventory documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory_documents', 'inventory_documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "select_own_inventory_docs" ON storage.objects;
CREATE POLICY "select_own_inventory_docs" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'inventory_documents');

DROP POLICY IF EXISTS "insert_own_inventory_docs" ON storage.objects;
CREATE POLICY "insert_own_inventory_docs" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'inventory_documents');

DROP POLICY IF EXISTS "delete_own_inventory_docs" ON storage.objects;
CREATE POLICY "delete_own_inventory_docs" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'inventory_documents');

-- RPC function: receive_inventory_delivery
CREATE OR REPLACE FUNCTION receive_inventory_delivery(
  p_company_id uuid,
  p_supplier text,
  p_total_netto numeric,
  p_total_vat numeric,
  p_total_brutto numeric,
  p_items jsonb,
  p_document_url text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_existing_stock int;
  v_new_stock int;
  v_sku text;
  v_name text;
  v_qty int;
  v_unit_price numeric;
  v_vat_rate int;
BEGIN
  -- Insert invoice record
  INSERT INTO invoices_history (company_id, supplier, total_netto, total_vat, total_brutto, document_url)
  VALUES (p_company_id, p_supplier, p_total_netto, p_total_vat, p_total_brutto, p_document_url)
  RETURNING id INTO v_invoice_id;

  -- Loop through items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sku := v_item->>'sku';
    v_name := v_item->>'name';
    v_qty := (v_item->>'quantity_received')::int;
    v_unit_price := COALESCE((v_item->>'unit_price_netto')::numeric, 0);
    v_vat_rate := COALESCE((v_item->>'vat_rate')::int, 23);

    -- Try to find existing product by SKU
    SELECT id, current_stock INTO v_product_id, v_existing_stock
    FROM products
    WHERE company_id = p_company_id AND LOWER(sku) = LOWER(v_sku)
    LIMIT 1;

    IF v_product_id IS NOT NULL THEN
      -- Update stock
      v_new_stock := v_existing_stock + v_qty;
      UPDATE products SET current_stock = v_new_stock WHERE id = v_product_id;
    ELSE
      -- Create new product
      INSERT INTO products (company_id, name, sku, current_stock, minimum_stock_alert, purchase_price_netto, vat_rate)
      VALUES (p_company_id, v_name, v_sku, v_qty, 5, v_unit_price, v_vat_rate)
      RETURNING id INTO v_product_id;
    END IF;

    -- Log stock movement
    INSERT INTO stock_movements (company_id, product_id, change_amount, movement_type)
    VALUES (p_company_id, v_product_id, v_qty, 'IN');
  END LOOP;

  RETURN v_invoice_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION receive_inventory_delivery TO authenticated;
