-- Migration 042: Platform-wide custom forms (report books, registers, logs)
-- Additive only. A form-template engine usable from ANY module of the hub:
-- define a form once (fields as JSONB), assign it to a brand and a fill rhythm
-- (daily / weekly / termly / per-event), and staff fill it from the Forms page.
-- Submissions are stored per user with the full answer payload.
--
-- Seeds editable sample templates for Ar-Rayyan Playhouse from the school's
-- physical report books (occurrence book, incident book, permission book,
-- attendance summary, health record, banking, lesson plans, records of work,
-- progress reports, ration book, M-Pesa fees update, minutes books, transport
-- log, stock card…). Edit them in the hub — they are data, not code.
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ocg_form_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID REFERENCES brands(id) ON DELETE CASCADE,  -- NULL = group-wide
  module      TEXT NOT NULL DEFAULT 'general',   -- general | rayyan | rhythms | darul | npt | glitz | nuuranest
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  frequency   TEXT NOT NULL DEFAULT 'daily',     -- daily | weekly | monthly | termly | per_event
  -- Array of fields: [{ key, label, type, required?, options?, placeholder? }]
  -- type: text | textarea | number | date | time | select | checkbox
  fields      JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_templates_brand  ON ocg_form_templates (brand_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_active ON ocg_form_templates (is_active);
-- Unique per brand+name so seeding below is idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_templates_brand_name
  ON ocg_form_templates ((COALESCE(brand_id::text, '')), name);

CREATE TABLE IF NOT EXISTS ocg_form_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       UUID NOT NULL REFERENCES ocg_form_templates(id) ON DELETE CASCADE,
  brand_id          UUID REFERENCES brands(id) ON DELETE SET NULL,
  submitted_by      TEXT NOT NULL DEFAULT '',   -- portal login email
  submitted_by_name TEXT NOT NULL DEFAULT '',
  submission_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  values            JSONB NOT NULL DEFAULT '{}',  -- { field key → answer }
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template ON ocg_form_submissions (template_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_date     ON ocg_form_submissions (submission_date DESC);
CREATE INDEX IF NOT EXISTS idx_form_submissions_by       ON ocg_form_submissions (submitted_by);

ALTER TABLE ocg_form_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocg_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form_templates_read" ON ocg_form_templates;
CREATE POLICY "form_templates_read" ON ocg_form_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "form_templates_service" ON ocg_form_templates;
CREATE POLICY "form_templates_service" ON ocg_form_templates
  USING (auth.role() = 'service_role') WITH CHECK (true);
DROP POLICY IF EXISTS "form_submissions_own" ON ocg_form_submissions;
CREATE POLICY "form_submissions_own" ON ocg_form_submissions
  FOR SELECT TO authenticated USING (submitted_by = (auth.jwt() ->> 'email'));
DROP POLICY IF EXISTS "form_submissions_service" ON ocg_form_submissions;
CREATE POLICY "form_submissions_service" ON ocg_form_submissions
  USING (auth.role() = 'service_role') WITH CHECK (true);
GRANT ALL ON TABLE ocg_form_templates   TO service_role;
GRANT ALL ON TABLE ocg_form_submissions TO service_role;

-- ─── Ar-Rayyan sample templates (edit freely in the hub) ─────────────────────
-- All inserts target the ar-rayyan-playhouse brand and no-op if already present.

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Daily Attendance Summary',
  'End-of-day attendance totals per class, with absentees and reasons.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"class","label":"Class","type":"select","required":true,"options":["Daycare","Playgroup","PP1","PP2"]},
    {"key":"boys_present","label":"Boys present","type":"number","required":true},
    {"key":"girls_present","label":"Girls present","type":"number","required":true},
    {"key":"absent_count","label":"Number absent","type":"number"},
    {"key":"absentees","label":"Absentees & reasons","type":"textarea"},
    {"key":"teacher","label":"Teacher","type":"text","required":true}]'::jsonb, 1
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Daily Occurrence Book',
  'Anything notable that happened during the day and the action taken.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"time","label":"Time","type":"time"},
    {"key":"occurrence","label":"Occurrence / event","type":"textarea","required":true},
    {"key":"action_taken","label":"Action taken","type":"textarea"},
    {"key":"teacher_on_duty","label":"Teacher on duty","type":"text"},
    {"key":"recorded_by","label":"Recorded by","type":"text","required":true}]'::jsonb, 2
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Incident Book',
  'Accidents and incidents involving a child, first aid given, and parent notification.',
  'per_event',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"time","label":"Time","type":"time","required":true},
    {"key":"child_name","label":"Child name","type":"text","required":true},
    {"key":"class","label":"Class","type":"select","options":["Daycare","Playgroup","PP1","PP2"]},
    {"key":"incident","label":"Incident description","type":"textarea","required":true},
    {"key":"first_aid","label":"First aid / action taken","type":"textarea"},
    {"key":"parent_notified","label":"Parent notified","type":"checkbox"},
    {"key":"notified_via","label":"Notified via","type":"select","options":["Phone call","WhatsApp","In person","Note"]},
    {"key":"witness","label":"Staff witness","type":"text"},
    {"key":"recorded_by","label":"Recorded by","type":"text","required":true}]'::jsonb, 3
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Permission Book',
  'Record of permissions — early pick-ups, visitors, and authorised releases.',
  'per_event',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"child_name","label":"Child name","type":"text","required":true},
    {"key":"class","label":"Class","type":"select","options":["Daycare","Playgroup","PP1","PP2"]},
    {"key":"person","label":"Person picking / requesting","type":"text","required":true},
    {"key":"relationship","label":"Relationship to child","type":"text"},
    {"key":"reason","label":"Reason / permission granted","type":"textarea","required":true},
    {"key":"time_out","label":"Time out","type":"time"},
    {"key":"time_in","label":"Time in","type":"time"},
    {"key":"authorised_by","label":"Authorised by","type":"text","required":true}]'::jsonb, 4
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Health Record (Daily)',
  'Daily health observations per child — temperature, symptoms, medication given.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"child_name","label":"Child name","type":"text","required":true},
    {"key":"class","label":"Class","type":"select","options":["Daycare","Playgroup","PP1","PP2"]},
    {"key":"observation","label":"Temperature / observation","type":"text"},
    {"key":"symptoms","label":"Symptoms","type":"textarea"},
    {"key":"medication","label":"Medication given & time","type":"textarea"},
    {"key":"parent_informed","label":"Parent informed","type":"checkbox"},
    {"key":"recorded_by","label":"Recorded by","type":"text","required":true}]'::jsonb, 5
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Daily Banking Record',
  'What was banked today, through which channel, and by whom.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"amount_ksh","label":"Amount banked (KSh)","type":"number","required":true},
    {"key":"channel","label":"Channel","type":"select","required":true,"options":["M-Pesa","Bank deposit","Cash box"]},
    {"key":"reference","label":"Reference code","type":"text"},
    {"key":"banked_by","label":"Banked by","type":"text","required":true},
    {"key":"verified_by","label":"Verified by","type":"text"}]'::jsonb, 6
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Diary of Events',
  'Admin book of daily events — visits, deliveries, meetings, notable happenings.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"event","label":"Event","type":"text","required":true},
    {"key":"details","label":"Details","type":"textarea"},
    {"key":"follow_up","label":"Follow-up needed","type":"textarea"},
    {"key":"recorded_by","label":"Recorded by","type":"text","required":true}]'::jsonb, 7
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Lesson Plan',
  'CBC lesson plan — strand, sub-strand, outcomes, experiences, and reflection.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"class","label":"Class","type":"select","required":true,"options":["Playgroup","PP1","PP2"]},
    {"key":"learning_area","label":"Learning area","type":"text","required":true},
    {"key":"strand","label":"Strand / theme","type":"text"},
    {"key":"sub_strand","label":"Sub-strand","type":"text"},
    {"key":"outcomes","label":"Learning outcomes","type":"textarea","required":true},
    {"key":"experiences","label":"Learning experiences","type":"textarea"},
    {"key":"resources","label":"Resources","type":"textarea"},
    {"key":"assessment","label":"Assessment","type":"textarea"},
    {"key":"reflection","label":"Reflection","type":"textarea"},
    {"key":"teacher","label":"Teacher","type":"text","required":true}]'::jsonb, 8
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Record of Work Covered',
  'Daily record of work actually covered per class and learning area.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"class","label":"Class","type":"select","required":true,"options":["Playgroup","PP1","PP2"]},
    {"key":"learning_area","label":"Learning area","type":"text","required":true},
    {"key":"work_covered","label":"Work covered","type":"textarea","required":true},
    {"key":"remarks","label":"Remarks","type":"textarea"},
    {"key":"teacher","label":"Teacher","type":"text","required":true}]'::jsonb, 9
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Scheme of Work',
  'Termly scheme of work per class and learning area, planned by week.',
  'termly',
  '[{"key":"term","label":"Term","type":"select","required":true,"options":["Term 1","Term 2","Term 3"]},
    {"key":"class","label":"Class","type":"select","required":true,"options":["Playgroup","PP1","PP2"]},
    {"key":"learning_area","label":"Learning area","type":"text","required":true},
    {"key":"week","label":"Week","type":"number"},
    {"key":"strand","label":"Strand","type":"text"},
    {"key":"sub_strand","label":"Sub-strand","type":"text"},
    {"key":"outcomes","label":"Learning outcomes","type":"textarea"},
    {"key":"experiences","label":"Learning experiences","type":"textarea"},
    {"key":"resources","label":"Resources","type":"textarea"},
    {"key":"assessment","label":"Assessment","type":"textarea"},
    {"key":"remarks","label":"Remarks","type":"textarea"},
    {"key":"teacher","label":"Teacher","type":"text","required":true}]'::jsonb, 10
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Progress Report',
  'Termly progress report per child with CBC performance level and remarks.',
  'termly',
  '[{"key":"term","label":"Term","type":"select","required":true,"options":["Term 1","Term 2","Term 3"]},
    {"key":"child_name","label":"Child name","type":"text","required":true},
    {"key":"class","label":"Class","type":"select","required":true,"options":["Playgroup","PP1","PP2"]},
    {"key":"areas","label":"Learning areas & performance","type":"textarea","required":true},
    {"key":"performance_level","label":"Overall performance level","type":"select","options":["Exceeding Expectation","Meeting Expectation","Approaching Expectation","Below Expectation"]},
    {"key":"teacher_remarks","label":"Teacher remarks","type":"textarea"},
    {"key":"head_remarks","label":"Head teacher remarks","type":"textarea"},
    {"key":"teacher","label":"Teacher","type":"text","required":true}]'::jsonb, 11
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Food / Ration Book',
  'Daily meals record — food items used, quantities, and children served.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"meal","label":"Meal","type":"select","required":true,"options":["Breakfast","10am snack","Lunch","4pm snack"]},
    {"key":"items_used","label":"Food items used","type":"textarea","required":true},
    {"key":"quantities","label":"Quantities","type":"textarea"},
    {"key":"children_served","label":"Children served","type":"number"},
    {"key":"prepared_by","label":"Prepared by","type":"text"}]'::jsonb, 12
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Fees M-Pesa Update Book',
  'Fee payments received via M-Pesa, logged daily against the child.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"child_name","label":"Child name","type":"text","required":true},
    {"key":"amount_ksh","label":"Amount received (KSh)","type":"number","required":true},
    {"key":"mpesa_code","label":"M-Pesa code","type":"text","required":true},
    {"key":"fee_item","label":"Fee item","type":"text"},
    {"key":"balance_ksh","label":"Balance (KSh)","type":"number"},
    {"key":"recorded_by","label":"Recorded by","type":"text","required":true}]'::jsonb, 13
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Inventory / Stock Card',
  'Stock movement per item — opening, received, issued, closing.',
  'weekly',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"item","label":"Item","type":"text","required":true},
    {"key":"opening_qty","label":"Opening quantity","type":"number"},
    {"key":"received","label":"Received","type":"number"},
    {"key":"issued","label":"Issued","type":"number"},
    {"key":"closing_qty","label":"Closing quantity","type":"number"},
    {"key":"remarks","label":"Remarks","type":"textarea"},
    {"key":"recorded_by","label":"Recorded by","type":"text","required":true}]'::jsonb, 14
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Staff Meeting Minutes',
  'Minutes book for staff meetings — agenda, minutes, and action items.',
  'per_event',
  '[{"key":"meeting_date","label":"Meeting date","type":"date","required":true},
    {"key":"attendees","label":"Attendees","type":"textarea","required":true},
    {"key":"agenda","label":"Agenda","type":"textarea"},
    {"key":"minutes","label":"Minutes","type":"textarea","required":true},
    {"key":"action_items","label":"Action items","type":"textarea"},
    {"key":"chaired_by","label":"Chaired by","type":"text"},
    {"key":"minuted_by","label":"Minuted by","type":"text","required":true}]'::jsonb, 15
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Parents Meeting Minutes & Attendance',
  'Minutes and attendance for parent meetings.',
  'per_event',
  '[{"key":"meeting_date","label":"Meeting date","type":"date","required":true},
    {"key":"parents_present","label":"Parents present (count)","type":"number"},
    {"key":"agenda","label":"Agenda","type":"textarea"},
    {"key":"minutes","label":"Minutes","type":"textarea","required":true},
    {"key":"resolutions","label":"Resolutions","type":"textarea"},
    {"key":"chaired_by","label":"Chaired by","type":"text"},
    {"key":"minuted_by","label":"Minuted by","type":"text","required":true}]'::jsonb, 16
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Transport Route Log',
  'Daily transport log per route — driver, escort, children on board, timings.',
  'daily',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"route","label":"Route","type":"text","required":true},
    {"key":"driver","label":"Driver","type":"text"},
    {"key":"escort","label":"Escort","type":"text"},
    {"key":"children_on_board","label":"Children on board","type":"number"},
    {"key":"departure","label":"Departure time","type":"time"},
    {"key":"return_time","label":"Return time","type":"time"},
    {"key":"incidents","label":"Incidents / notes","type":"textarea"}]'::jsonb, 17
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;

INSERT INTO ocg_form_templates (brand_id, module, name, description, frequency, fields, sort_order)
SELECT b.id, 'rayyan', 'Uniform Sales Record',
  'Uniform items sold — sizes, amounts, and payment method.',
  'per_event',
  '[{"key":"date","label":"Date","type":"date","required":true},
    {"key":"child_name","label":"Child name","type":"text","required":true},
    {"key":"items","label":"Items & sizes","type":"textarea","required":true},
    {"key":"amount_ksh","label":"Amount (KSh)","type":"number","required":true},
    {"key":"payment_method","label":"Payment method","type":"select","options":["M-Pesa","Cash","Bank"]},
    {"key":"sold_by","label":"Sold by","type":"text","required":true}]'::jsonb, 18
FROM brands b WHERE b.slug = 'ar-rayyan-playhouse'
ON CONFLICT ((COALESCE(brand_id::text, '')), name) DO NOTHING;
