# Sidekick — POS Settlement Reconciliation & Venue Ops Engine

Sidekick is an internal operations tool built to eliminate manual end-of-day cash settlement errors and streamline shift handovers in high-traffic physical venues (reception desks, retail, entertainment centers).

It pairs OCR-assisted settlement receipt parsing (Gemini Vision) with an automated variance engine and inventory tracking, backed by Supabase (PostgreSQL).

---
image.png
## The Operational Problem

At the end of an operational shift, receptionists manually reconcile three independent sources:

1. Physical cash in the drawer (minus starting float).

2. Credit card terminal settlement summaries (daily batch totals).

3. The centralized POS software sales report.

When human transcription errors occur, locating the root cause of discrepancies (manko / superata) between drawer cash and system logs requires managers to manually re-audit paper printouts days later.

---

## Core Features & Workflow

### 1. Vision-Based Settlement Ingestion

- Ingests photos of thermal POS reports and drawer count sheets.

- Uses Gemini Vision with strict JSON schema outputs to extract structured numeric fields (cash total, card transactions, vouchers, float).

- **Sanity check layer:** Validates internal math before persisting to the database:

  $$\text{Drawer Cash} + \text{Terminal Total} - \text{Float} == \text{POS System Total}$$

  If the equation doesn't balance, the discrepancy is flagged for manager review before the shift is closed.

### 2. Discrepancy & Audit Ledger

- Records historical daily settlements per shift and employee.

- Computes persistent variance trends to isolate recurring hardware/process issues versus one-off register errors.

### 3. Inventory & Invoicing Integration

- Tracks stock consumption against recorded sales to prevent untracked shrinkage.

- Connects directly to external accounting via the Fakturownia API to automate invoice creation for venue bookings.

---

## Engineering Decisions & Trade-Offs

- **LLM Vision vs Traditional OCR (Tesseract):** Thermal receipts from POS printers frequently have faded ink, creases, and inconsistent formatting across registers. Rule-based OCR produced high character error rates on decimal numbers; multimodal vision with structured output schema handles skewed, poorly lit receipts reliably.

- **Relational Integrity (PostgreSQL):** Uses Supabase migrations with Row-Level Security (RLS) policies to ensure strict isolation between venue locations and prevent cross-shift data pollution.

- **Deterministic Validation:** The AI only parses raw values; all reconciliation math, variance calculation, and tolerance threshold checks are executed deterministically in TypeScript and SQL.

---

## Tech Stack

- **Client:** React, TypeScript, Vite, Tailwind CSS, Lucide Icons

- **Backend / Database:** Supabase (PostgreSQL, RLS, custom migrations)

- **AI Processing:** Google Gemini API (Structured Vision Prompting)

- **Integrations:** Fakturownia API (Automated Billing)

---

## Local Setup

1. Clone the repository:

   ```bash

   git clone [[https://github.com/tymongrzegory05-commits/b2b-basket-splitter.git](https://github.com/tymongrzegory05-commits/b2b-basket-splitter.git)](https://github.com/tymongrzegory05-commits/b2b-basket-splitter.git](https://github.com/tymongrzegory05-commits/b2b-basket-splitter.git))

   cd b2b-basket-splitter