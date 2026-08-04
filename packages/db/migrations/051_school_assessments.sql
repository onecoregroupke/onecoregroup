-- Migration 051: school-agnostic academic assessments (marks) for Rhythms/Darul
-- (Rayyan already has rayyan_assessments). Additive.
--
-- One row per student per subject per assessment. Status captures missed /
-- deferred / repeated exams. The transcript reads these; balances (fees) stay
-- entirely separate in school_ledger_entries.

create extension if not exists pgcrypto;

create table if not exists school_assessments (
  id                 uuid primary key default gen_random_uuid(),
  school             text not null check (school in ('rayyan','rhythms','darul')),
  brand_id           uuid references brands(id) on delete set null,
  student_id         uuid not null,                 -- app-resolved into *_students
  student_admission_no text not null default '',
  subject            text not null default '',      -- learning area / course / module
  academic_year      text not null default '',
  term               text not null default '',
  assessment_type    text not null default 'exam',  -- exam | cat | assignment | practical
  score              numeric(6, 2),
  max_score          numeric(6, 2) not null default 100,
  grade              text not null default '',
  status             text not null default 'recorded'
                       check (status in ('recorded','missed','deferred','repeated')),
  remarks            text not null default '',
  teacher            text not null default '',
  assessed_on        date,
  recorded_by        text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_school_assessments_student on school_assessments(school, student_id);
create index if not exists idx_school_assessments_term on school_assessments(academic_year, term);

alter table school_assessments enable row level security;
drop policy if exists "school_assessments_auth" on school_assessments;
create policy "school_assessments_auth" on school_assessments for select to authenticated using (true);
drop policy if exists "school_assessments_service" on school_assessments;
create policy "school_assessments_service" on school_assessments using (auth.role() = 'service_role') with check (true);
grant all on table school_assessments to service_role;
