/*
# Create companies and audits tables for Operational Auditing SaaS

1. New Tables
- `companies`
  - `id` (uuid, primary key, matches auth.users.id) — one company profile per user
  - `company_name` (text, not null) — the company's display name
  - `industry` (text, not null) — industry category selected during onboarding
  - `employee_count` (int, not null) — number of employees
  - `created_at` (timestamptz, defaults to now)
- `audits`
  - `id` (uuid, primary key, auto-generated)
  - `company_id` (uuid, not null, matches auth.users.id, references companies) — owner of the audit
  - `financial_leak_estimate_pln` (int) — estimated monthly financial leak in PLN
  - `time_wasted_hours_monthly` (int) — estimated hours wasted per month
  - `bottlenecks` (jsonb) — array of {area, description, severity} objects
  - `suggested_tier` (text) — "Starter" | "Growth" | "Scale"
  - `monthly_price_pln` (int) — recommended monthly price in PLN
  - `roi_summary` (text) — narrative ROI summary
  - `created_at` (timestamptz, defaults to now)

2. Security
- Enable RLS on both `companies` and `audits`.
- Owner-scoped CRUD on both tables: each authenticated user can only SELECT, INSERT,
  UPDATE, and DELETE their own rows (where auth.uid() = company_id / id).
- `companies.id` defaults to auth.uid() so an insert omitting the id still satisfies
  the INSERT policy's WITH CHECK.
- `audits.company_id` defaults to auth.uid() for the same reason.

3. Important Notes
1. Each user has at most one company profile (companies.id = auth.users.id).
2. Each user has at most one audit (enforced at the application layer by checking
   for an existing audit before showing the chat interface).
3. Policies are idempotent (DROP IF EXISTS before CREATE).
*/

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  industry text NOT NULL,
  employee_count int NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_company" ON companies;
CREATE POLICY "select_own_company" ON companies FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_company" ON companies;
CREATE POLICY "insert_own_company" ON companies FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_company" ON companies;
CREATE POLICY "update_own_company" ON companies FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_company" ON companies;
CREATE POLICY "delete_own_company" ON companies FOR DELETE
  TO authenticated USING (auth.uid() = id);

CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_leak_estimate_pln int,
  time_wasted_hours_monthly int,
  bottlenecks jsonb,
  suggested_tier text,
  monthly_price_pln int,
  roi_summary text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_audit" ON audits;
CREATE POLICY "select_own_audit" ON audits FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_audit" ON audits;
CREATE POLICY "insert_own_audit" ON audits FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_audit" ON audits;
CREATE POLICY "update_own_audit" ON audits FOR UPDATE
  TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_audit" ON audits;
CREATE POLICY "delete_own_audit" ON audits FOR DELETE
  TO authenticated USING (auth.uid() = company_id);
