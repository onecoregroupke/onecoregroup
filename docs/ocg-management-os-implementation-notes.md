# One Core Management OS Implementation Notes

## Current Platform Audit

One Core Group already has a shared Supabase-backed monorepo with two internal operating systems:

- `apps/ops-hub`: task delivery, projects, clients, team members, task assignment, AI draft queues, completion records, Google Drive/Supabase artifact delivery, and daily/weekly/monthly ops reports.
- `apps/marketing-hub`: marketing dashboard, daily metrics, compliance, content calendar, campaigns, CRM, WhatsApp flows, reports, episodes, publishing jobs, and a Marketing-to-Ops production handoff.

The existing operational backbone is:

- `ops_clients`, `ops_projects`, `ops_tasks`, `ops_team_members`, `ops_project_context`, and `ops_completion_records`.
- `ops_agent_runs`, `ops_agent_jobs`, `ops_agent_artifacts`, `ops_agent_context_sources`, `ops_agent_artifact_destinations`, `ops_review_queue`, and `ops_report_logs`.
- `marketing_content.ops_task_id`, `marketing_content.production_status`, `marketing_content.deliverable_url`, and `marketing_ops_projects` connect marketing production work to the Ops Hub.
- Permissions are handled by Supabase Auth plus `user_permissions`; Ops Hub currently gates broad work through `ops` and `ops_agents`.

## Reuse First

The Management OS should extend Ops Hub rather than create a third internal app. Ops already owns accountability: work, owners, statuses, dates, brands, projects, completion records, and AI drafts. Marketing Hub should remain the specialist marketing workspace and report into the management cockpit.

Reuse:

- Existing dashboard layout, sidebar, topbar, cards, task status badges, and brand colors.
- Existing `listTasks`, `listProjects`, `listTeam`, `listBrands`, and `db()` server client helpers.
- Existing task status vocabulary where possible: `Blocked`, `AI Draft Ready`, `Completed`, `Ongoing`, and due dates already cover much of the leadership view.
- Existing marketing tables for campaign/content production status before adding separate marketing management tables.

## Additive Extensions

Additive migration `025_ocg_management_os.sql` introduces:

- Management control tables: `ocg_approvals`, `ocg_blockers`, `ocg_meetings`, `ocg_decisions`, `ocg_recurring_tasks`.
- NPT service module tables: customers, pianos, service jobs, service history, quote/invoice records, and reminders.
- Ar Rayyan admin tables: students, guardians, admissions, fee follow-ups, SchoolPay import batches, SchoolPay payment snapshots, classes, attendance notes, and admin tasks.

These tables are intentionally additive. They do not replace Gazelle, SchoolPay, Marketing Hub, or existing Ops Hub tables. The first UI pass reads them when present and shows empty states when there is no data.

## What Should Not Be Touched

- Do not rename or remove existing Ops/Marketing tables.
- Do not replace SchoolPay fee collection. The Rayyan module tracks admin follow-up and reconciliation snapshots only.
- Do not integrate directly with Gazelle until export/API details are available.
- Do not auto-send customer, parent, or client messages. Keep AI outputs as drafts unless a separate approved send workflow exists.
- Do not hardcode brand IDs; resolve brands by slug/name through the existing `brands` table.

## Safe Build Sequence

1. Add the additive database migration and TypeScript row types.
2. Add `/management` for the director cockpit using existing ops/marketing data plus new control tables.
3. Add `/management/team` and `/management/team/[memberId]` for workload visibility.
4. Add first NPT internal service views under Ops Hub using empty-state-first tables.
5. Add first Ar Rayyan admin/SchoolPay reconciliation views under Ops Hub.
6. Later: add create/edit forms, CSV importers, SchoolPay reconciliation helpers, Gazelle export importers, approval workflows, and recurring-task generation.

## Gazelle and SchoolPay Direction

For Nairobi Piano Technicians, the recommended path is to build an internal Gazelle-inspired service OS in stages: first customer/piano/job/reminder records, then scheduling and service history, then quote/invoice tracking, then import/export from Gazelle if data is available.

For Ar Rayyan, the recommended path is to keep SchoolPay as the payment processor and build an internal reconciliation/admin layer around it. The system should import or manually capture SchoolPay snapshots, match them to students/admission numbers, and surface fee follow-up items without pretending to process payments.
