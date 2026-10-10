/*
# Daily Settlements (Skaner Rozliczeń AI)

1. New Tables
- `daily_settlements`: przechowuje dzienne rozliczenia kasowe zweryfikowane przez Gemini Vision AI
  - id (uuid, PK)
  - company_id (uuid, FK -> companies, domyślnie auth.uid())
  - date (date) — dzień rozliczenia
  - employee_name (text) — pracownik odczytany z karteczki
  - declared_cash (numeric) — gotówka zadeklarowana na karteczce
  - declared_card (numeric) — kwota na karcie zadeklarowana na karteczce
  - kw_amount (numeric) — zwroty / wypłaty (KW)
  - register_cash (numeric) — gotówka z raportu dobowego kasy fiskalnej
  - register_card (numeric) — sprzedaż kartą z raportu dobowego kasy fiskalnej
  - terminal_card (numeric) — kwota z wydruku terminala płatniczego
  - status (text: 'match' | 'mismatch')
  - discrepancy_amount (numeric) — wyliczone manko (-) / nadwyżka (+)
  - notes (text)
  - created_at (timestamptz)

2. Security
- RLS włączone, dostęp ograniczony do właściciela przez auth.uid() = company_id
  (spójne z konwencją pozostałych tabel w aplikacji)

3. Notes
- Rekord jest tworzony po ręcznej weryfikacji/korekcie danych odczytanych przez
  Gemini Vision AI ze zdjęcia trzech dokumentów (raport kasowy, wydruk terminala,
  odręczna karteczka pracownika)
*/

CREATE TABLE IF NOT EXISTS daily_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT auth.uid() REFERENCES companies(id) ON DELETE CASCADE,
  date date NOT NULL,
  employee_name text NOT NULL,
  declared_cash numeric NOT NULL DEFAULT 0,
  declared_card numeric NOT NULL DEFAULT 0,
  kw_amount numeric NOT NULL DEFAULT 0,
  register_cash numeric NOT NULL DEFAULT 0,
  register_card numeric NOT NULL DEFAULT 0,
  terminal_card numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'match' CHECK (status IN ('match', 'mismatch')),
  discrepancy_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE daily_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_daily_settlements" ON daily_settlements;
CREATE POLICY "select_own_daily_settlements" ON daily_settlements FOR SELECT
  TO authenticated USING (auth.uid() = company_id);

DROP POLICY IF EXISTS "insert_own_daily_settlements" ON daily_settlements;
CREATE POLICY "insert_own_daily_settlements" ON daily_settlements FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "update_own_daily_settlements" ON daily_settlements;
CREATE POLICY "update_own_daily_settlements" ON daily_settlements FOR UPDATE
  TO authenticated USING (auth.uid() = company_id) WITH CHECK (auth.uid() = company_id);

DROP POLICY IF EXISTS "delete_own_daily_settlements" ON daily_settlements;
CREATE POLICY "delete_own_daily_settlements" ON daily_settlements FOR DELETE
  TO authenticated USING (auth.uid() = company_id);

CREATE INDEX IF NOT EXISTS idx_daily_settlements_company_created
  ON daily_settlements(company_id, created_at);
