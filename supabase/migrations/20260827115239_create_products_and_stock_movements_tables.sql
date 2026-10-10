/*
# Create products and stock_movements tables for Inventory module

1. New Tables
- `products`
  - `id` (uuid, primary key, auto-generated)
  - `company_id` (uuid, not null, matches auth.users.id, references companies) — owner
  - `name` (text, not null) — product name
  - `sku` (text, not null) — stock keeping unit, unique per company
  - `current_stock` (int, not null, default 0) — current quantity in stock
  - `minimum_stock_alert` (int, not null, default 0) — threshold for low-stock alerts
  - `created_at` (timestamptz, defaults to now)
- `stock_movements`
  - `id` (uuid, primary key, auto-generated)
  - `company_id` (uuid, not null, references companies) — owner
  - `product_id` (uuid, not null, references products ON DELETE CASCADE) — which product
  - `change_amount` (int, not null) — positive for IN, negative for OUT
  - `movement_type` (text, not null) — "IN" or "OUT"
  - `created_at` (timestamptz, defaults to now)

2. Security
- Enable RLS on both tables.
- Owner-scoped CRUD: each authenticated user can only access rows where company_id = auth.uid().
- Both company_id columns default to auth.uid() so inserts omitting it still pass WITH CHECK.
- Unique constraint on (company_id, sku) to prevent duplicate SKUs per company.

3. Important Notes
1. products.company_id defaults to auth.uid() for seamless inserts.
2. stock_movements.company_id defaults to auth.uid() for the same reason.
3. Policies are idempotent (DROP IF EXISTS before CREATE).
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text NOT NULL,
  current_stock int NOT NULL DEFAULT 0,
  minimum_stock_alert int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, sku)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_products" ON products;
CREATE POLICY "select_own_products" ON products FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_products" ON products;
CREATE POLICY "insert_own_products" ON products FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_products" ON products;
CREATE POLICY "update_own_products" ON products FOR UPDATE
  TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_products" ON products;
CREATE POLICY "delete_own_products" ON products FOR DELETE
  TO authenticated USING (auth.uid() = company_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change_amount int NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('IN', 'OUT')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_movements" ON stock_movements;
CREATE POLICY "select_own_movements" ON stock_movements FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_movements" ON stock_movements;
CREATE POLICY "insert_own_movements" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_movements" ON stock_movements;
CREATE POLICY "update_own_movements" ON stock_movements FOR UPDATE
  TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_movements" ON stock_movements;
CREATE POLICY "delete_own_movements" ON stock_movements FOR DELETE
  TO authenticated USING (auth.uid() = company_id);
