-- Migration 044: School finance foundation (canonical student-account layer).
--
-- Additive & non-destructive. Introduces a shared, school-agnostic accounting
-- layer that sits ON TOP OF the existing per-school student tables
-- (rayyan_students / rhythms_students / darul_students) and the existing
-- *_fee_invoices/_fee_payments tables (which are preserved and backfilled).
--
-- Design (see docs/finance-upgrade/02-repo-audit-and-architecture.md, D1):
--   * One set of tables keyed by a `school` discriminator + `brand_id`, instead
--     of duplicating ×3 per school.
--   * `student_id` is an app-resolved UUID into the relevant per-school student
--     table (no cross-table FK is possible across three tables); we also keep a
--     denormalised `student_admission_no` for import matching + resilience.
--   * Balances are DERIVED from ledger entries (Σ charges − Σ payments), never
--     stored as the source of truth.
--   * Posted ledger entries are immutable; corrections use reversal/adjustment
--     entries. Autosave writes DRAFT entries only.
--   * Charge prices are effective-dated / versioned; historical charges are
--     never rewritten when a future price changes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── School enum guard (text + CHECK; no hard enum type, to stay additive) ─────
--    Valid schools: 'rayyan' | 'rhythms' | 'darul'.
--    Sections/branches: e.g. Rayyan 'daycare' | 'playhouse'.

-- ── Configurable charge categories ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS school_charge_categories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school            TEXT NOT NULL CHECK (school IN ('rayyan','rhythms','darul')),
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  section           TEXT NOT NULL DEFAULT '',          -- e.g. daycare | playhouse | ''(all)
  programme_id      UUID,                              -- optional scope to a programme/course
  code              TEXT NOT NULL DEFAULT '',          -- stable key, e.g. 'tuition'
  name              TEXT NOT NULL,                     -- display, e.g. 'Tuition Fee'
  kind              TEXT NOT NULL DEFAULT 'charge',    -- charge | payment | both
  billing_cadence   TEXT NOT NULL DEFAULT 'one_off',  -- one_off | monthly | termly | annual | recurring
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_charge_categories_school ON school_charge_categories(school);
CREATE INDEX IF NOT EXISTS idx_school_charge_categories_brand ON school_charge_categories(brand_id);
CREATE INDEX IF NOT EXISTS idx_school_charge_categories_programme ON school_charge_categories(programme_id);

-- ── Programmes / departments / courses ───────────────────────────────────────
--    Rhythms departments (Computer Studies, Music, …) and courses; Rayyan
--    sections (Daycare / Playhouse); Darul halaqa levels. `kind` distinguishes.
CREATE TABLE IF NOT EXISTS school_programmes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school            TEXT NOT NULL CHECK (school IN ('rayyan','rhythms','darul')),
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  parent_id         UUID REFERENCES school_programmes(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT 'programme',  -- department | programme | course | section | level
  code              TEXT NOT NULL DEFAULT '',
  name              TEXT NOT NULL,
  duration_label    TEXT NOT NULL DEFAULT '',          -- e.g. '6 months', '1 year'
  applies_to        TEXT NOT NULL DEFAULT '',          -- optional student-type filter
  completion_requirements TEXT NOT NULL DEFAULT '',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_programmes_school ON school_programmes(school);
CREATE INDEX IF NOT EXISTS idx_school_programmes_parent ON school_programmes(parent_id);

-- ── Fee structures (versioned, effective-dated) ──────────────────────────────
CREATE TABLE IF NOT EXISTS school_fee_structures (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school            TEXT NOT NULL CHECK (school IN ('rayyan','rhythms','darul')),
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  programme_id      UUID REFERENCES school_programmes(id) ON DELETE SET NULL,
  version           INTEGER NOT NULL DEFAULT 1,
  name              TEXT NOT NULL DEFAULT '',
  academic_year     TEXT NOT NULL DEFAULT '',
  effective_from    DATE,
  effective_to      DATE,
  status            TEXT NOT NULL DEFAULT 'active',     -- active | superseded | draft
  currency          TEXT NOT NULL DEFAULT 'KES',
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_fee_structures_school ON school_fee_structures(school);
CREATE INDEX IF NOT EXISTS idx_school_fee_structures_programme ON school_fee_structures(programme_id);

CREATE TABLE IF NOT EXISTS school_fee_structure_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id   UUID NOT NULL REFERENCES school_fee_structures(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES school_charge_categories(id) ON DELETE SET NULL,
  label              TEXT NOT NULL,
  amount_ksh         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  billing_cadence    TEXT NOT NULL DEFAULT 'one_off',   -- one_off | monthly | termly | annual
  is_required        BOOLEAN NOT NULL DEFAULT true,
  is_completion_req  BOOLEAN NOT NULL DEFAULT false,    -- non-financial milestone (exam book, cert)
  sort_order         INTEGER NOT NULL DEFAULT 0,
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_fee_structure_items_structure ON school_fee_structure_items(fee_structure_id);

-- ── Enrollments (student ↔ programme/course) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS school_enrollments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school             TEXT NOT NULL CHECK (school IN ('rayyan','rhythms','darul')),
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  student_id         UUID NOT NULL,                     -- app-resolved into *_students
  student_admission_no TEXT NOT NULL DEFAULT '',
  programme_id       UUID REFERENCES school_programmes(id) ON DELETE SET NULL,
  fee_structure_id   UUID REFERENCES school_fee_structures(id) ON DELETE SET NULL,
  section            TEXT NOT NULL DEFAULT '',          -- daycare | playhouse | ''
  academic_year      TEXT NOT NULL DEFAULT '',
  term               TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'active',     -- active | completed | transferred | withdrawn
  start_date         DATE,
  end_date           DATE,
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_enrollments_student ON school_enrollments(school, student_id);
CREATE INDEX IF NOT EXISTS idx_school_enrollments_programme ON school_enrollments(programme_id);

-- ── Canonical student ledger (sub-ledger per category) ───────────────────────
--    entry_type: charge (Dr, increases due) | payment (Cr, decreases due)
--                | adjustment | opening_balance | reversal | write_off | refund
--    posting state: draft (autosave) | posted (immutable) | reversed
CREATE TABLE IF NOT EXISTS school_ledger_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school             TEXT NOT NULL CHECK (school IN ('rayyan','rhythms','darul')),
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  student_id         UUID NOT NULL,                     -- app-resolved into *_students
  student_admission_no TEXT NOT NULL DEFAULT '',
  enrollment_id      UUID REFERENCES school_enrollments(id) ON DELETE SET NULL,
  category_id        UUID REFERENCES school_charge_categories(id) ON DELETE SET NULL,
  category_label     TEXT NOT NULL DEFAULT '',          -- denormalised for source fidelity
  section            TEXT NOT NULL DEFAULT '',          -- daycare | playhouse | department
  entry_type         TEXT NOT NULL DEFAULT 'charge'
                       CHECK (entry_type IN ('charge','payment','adjustment','opening_balance','reversal','write_off','refund')),
  entry_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  academic_year      TEXT NOT NULL DEFAULT '',
  term               TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  amount_ksh         NUMERIC(14, 2) NOT NULL DEFAULT 0, -- always POSITIVE; direction from entry_type
  currency           TEXT NOT NULL DEFAULT 'KES',
  -- payment metadata
  method             TEXT NOT NULL DEFAULT '',          -- mpesa | cash | bank | schoolpay | ''
  receipt_no         TEXT NOT NULL DEFAULT '',          -- preserved verbatim as text
  mpesa_code         TEXT NOT NULL DEFAULT '',          -- preserved verbatim as text
  receiving_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
  -- posting / lifecycle
  state              TEXT NOT NULL DEFAULT 'draft'
                       CHECK (state IN ('draft','posted','reversed')),
  reverses_entry_id  UUID REFERENCES school_ledger_entries(id) ON DELETE SET NULL,
  -- source fidelity + provenance
  source_balance     NUMERIC(14, 2),                    -- the workbook's own BALANCE cell (audit only)
  source_workbook    TEXT NOT NULL DEFAULT '',
  source_sheet       TEXT NOT NULL DEFAULT '',
  source_row         INTEGER,
  import_id          UUID,                              -- FK added in 046 (data_imports)
  notes              TEXT NOT NULL DEFAULT '',
  comment            TEXT NOT NULL DEFAULT '',
  recorded_by        TEXT NOT NULL DEFAULT '',
  posted_by          TEXT NOT NULL DEFAULT '',
  posted_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_ledger_student ON school_ledger_entries(school, student_id);
CREATE INDEX IF NOT EXISTS idx_school_ledger_brand ON school_ledger_entries(brand_id);
CREATE INDEX IF NOT EXISTS idx_school_ledger_category ON school_ledger_entries(category_id);
CREATE INDEX IF NOT EXISTS idx_school_ledger_state ON school_ledger_entries(state);
CREATE INDEX IF NOT EXISTS idx_school_ledger_date ON school_ledger_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_school_ledger_import ON school_ledger_entries(import_id);
-- Idempotent imports: a given source coordinate can land once per entry_type
-- (a mirrored Dr+Cr workbook row legitimately produces one charge + one payment).
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_ledger_source
  ON school_ledger_entries(source_workbook, source_sheet, source_row, entry_type)
  WHERE source_workbook <> '' AND source_row IS NOT NULL;

-- ── Payment allocations (payment entry → charge entry) ───────────────────────
CREATE TABLE IF NOT EXISTS school_payment_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_entry_id   UUID NOT NULL REFERENCES school_ledger_entries(id) ON DELETE CASCADE,
  charge_entry_id    UUID NOT NULL REFERENCES school_ledger_entries(id) ON DELETE CASCADE,
  amount_ksh         NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_alloc_payment ON school_payment_allocations(payment_entry_id);
CREATE INDEX IF NOT EXISTS idx_school_alloc_charge ON school_payment_allocations(charge_entry_id);

-- ── Student completion requirements / milestones (non-financial) ─────────────
--    e.g. Rhythms: exam book, final exam, certificate. Configurable per course.
CREATE TABLE IF NOT EXISTS school_student_requirements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school             TEXT NOT NULL CHECK (school IN ('rayyan','rhythms','darul')),
  brand_id           UUID REFERENCES brands(id) ON DELETE SET NULL,
  student_id         UUID NOT NULL,
  student_admission_no TEXT NOT NULL DEFAULT '',
  enrollment_id      UUID REFERENCES school_enrollments(id) ON DELETE SET NULL,
  requirement_code   TEXT NOT NULL DEFAULT '',          -- exam_book | final_exam | certificate | custom
  requirement_label  TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',    -- pending | done | not_done | issued | not_issued | waived
  status_date        DATE,
  notes              TEXT NOT NULL DEFAULT '',
  source_workbook    TEXT NOT NULL DEFAULT '',
  source_sheet       TEXT NOT NULL DEFAULT '',
  source_row         INTEGER,
  import_id          UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_school_requirements_student ON school_student_requirements(school, student_id);

-- ── RLS + grants (repo convention: authenticated read; service_role all) ──────
ALTER TABLE school_charge_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_programmes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_fee_structures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_fee_structure_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_enrollments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_ledger_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_payment_allocations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_student_requirements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'school_charge_categories','school_programmes','school_fee_structures',
    'school_fee_structure_items','school_enrollments','school_ledger_entries',
    'school_payment_allocations','school_student_requirements'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_auth" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "%1$s_auth" ON %1$s FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_service" ON %1$s;', t);
    EXECUTE format('CREATE POLICY "%1$s_service" ON %1$s USING (auth.role() = ''service_role'') WITH CHECK (true);', t);
    EXECUTE format('GRANT ALL ON TABLE %1$s TO service_role;', t);
  END LOOP;
END $$;
