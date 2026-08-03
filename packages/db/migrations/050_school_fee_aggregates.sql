-- Migration 050: server-side school-fee aggregates (RPC).
--
-- Additive. Efficient GROUP BY rollups over school_ledger_entries so the brand
-- finance workspace + analytics can show fee totals, per-category, per-month, and
-- top debtors without fetching tens of thousands of rows to the app. Posted
-- entries only. Direction: charge/opening/adjustment/refund add to due; payment/
-- write_off reduce it.

create or replace function school_fee_totals(p_school text)
returns table(charged numeric, paid numeric, outstanding numeric, students bigint)
language sql stable as $$
  select
    coalesce(sum(amount_ksh) filter (where entry_type = 'charge'), 0),
    coalesce(sum(amount_ksh) filter (where entry_type = 'payment'), 0),
    coalesce(sum(case when entry_type in ('charge','opening_balance','adjustment','refund') then amount_ksh
                      when entry_type in ('payment','write_off') then -amount_ksh else 0 end), 0),
    count(distinct student_id)
  from school_ledger_entries
  where school = p_school and state = 'posted';
$$;

create or replace function school_fee_by_category(p_school text)
returns table(category_label text, charged numeric, paid numeric, balance numeric)
language sql stable as $$
  select coalesce(nullif(category_label, ''), 'General'),
    coalesce(sum(amount_ksh) filter (where entry_type = 'charge'), 0),
    coalesce(sum(amount_ksh) filter (where entry_type = 'payment'), 0),
    coalesce(sum(case when entry_type in ('charge','opening_balance','adjustment','refund') then amount_ksh
                      when entry_type in ('payment','write_off') then -amount_ksh else 0 end), 0)
  from school_ledger_entries
  where school = p_school and state = 'posted'
  group by 1 order by 4 desc;
$$;

create or replace function school_fee_by_month(p_school text)
returns table(ym text, charged numeric, paid numeric)
language sql stable as $$
  select to_char(entry_date, 'YYYY-MM'),
    coalesce(sum(amount_ksh) filter (where entry_type = 'charge'), 0),
    coalesce(sum(amount_ksh) filter (where entry_type = 'payment'), 0)
  from school_ledger_entries
  where school = p_school and state = 'posted'
  group by 1 order by 1;
$$;

create or replace function school_fee_top_debtors(p_school text, p_limit int default 15)
returns table(student_id uuid, admission_no text, outstanding numeric)
language sql stable as $$
  select student_id, max(student_admission_no),
    coalesce(sum(case when entry_type in ('charge','opening_balance','adjustment','refund') then amount_ksh
                      when entry_type in ('payment','write_off') then -amount_ksh else 0 end), 0) as bal
  from school_ledger_entries
  where school = p_school and state = 'posted' and student_id is not null
  group by student_id
  having coalesce(sum(case when entry_type in ('charge','opening_balance','adjustment','refund') then amount_ksh
                           when entry_type in ('payment','write_off') then -amount_ksh else 0 end), 0) > 0
  order by bal desc limit p_limit;
$$;

grant execute on function school_fee_totals(text)        to service_role, authenticated;
grant execute on function school_fee_by_category(text)   to service_role, authenticated;
grant execute on function school_fee_by_month(text)      to service_role, authenticated;
grant execute on function school_fee_top_debtors(text, int) to service_role, authenticated;
