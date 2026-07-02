# OCG Ops Hub — Official Launch Checklist

The launch foundation (migration 035 + the modules below) turns the Ops Hub
into the company's daily operating system: compartmentalized finance,
inventory + procurement, meetings with AI prep, internal chat + forum, and the
admin's end-of-day close with a master report.

## 1. Run the migration

In the Supabase SQL editor, run:

```
packages/db/migrations/035_launch_foundation.sql
```

Idempotent — safe to re-run. It:

- adds `user_permissions.brand_access` (per-brand compartments for finance / inventory / procurement)
- adds team profile fields (`phone`, `job_title`, `department`, `start_date`, `notes`)
- adds `ops_projects.parent_project_id` (sub-projects)
- upgrades `ocg_meetings` (status, location, agenda, series, prep brief) + creates `ocg_meeting_action_items`
- creates `finance_voteheads` (+ seeds a baseline per brand) and adds `votehead_id`, `balance_after_ksh`, `recorded_by` to `finance_transactions`
- creates inventory (`inventory_items`, `inventory_movements`) and procurement (`procurement_vendors`, `procurement_purchases`, `procurement_purchase_items`)
- creates chat (`ocg_conversations`, `ocg_conversation_members`, `ocg_messages`) and forum (`ocg_forum_posts`, `ocg_forum_replies`)
- creates `ocg_day_closes`
- **tightens security**: drops the broad `authenticated` SELECT policies on all
  finance tables and makes every new table service-role only. All access now
  flows through the Ops Hub API, which enforces section + brand permissions.

Deploy the updated `ops-hub` app in the same release as the migration (the
`brand_access` column is read tolerantly, but the RLS tightening assumes the
new API paths are live).

## 2. Env vars (no new ones required)

Already-configured vars now also power the new modules:

- `GROQ_API_KEY` — meeting prep briefs + day-close narration (both degrade to a structured non-AI brief without it)
- `RESEND_API_KEY`, `OPS_EMAIL_FROM`, `OPS_REPORT_RECIPIENTS` — the day-close master report email
- `OPS_AGENT_API_KEY` — unchanged; still the only door into `/api/agent/*`

## 3. Set up the people

For each staff member, in **Portal Access** (`/management/users`):

1. Invite them (email + display name + role).
2. Grant sections in the permission matrix. New sections:
   - **Meetings** — inherits Management/Ops if unset
   - **Inventory**, **Procurement** — explicit grants only (no inheritance, like money)
3. **Brand compartments** (below the matrix): for Finance / Inventory /
   Procurement, leave a row empty for the *full cross-brand view* (managers +
   super admin only), or select brands to lock the person to exactly those
   brands. Example — three finance roles:
   - *Group finance manager*: Finance = View & Edit, no brands selected → sees everything
   - *Rhythms accountant*: Finance = View & Edit, brands = Rhythms College → sees/records Rhythms only
   - *Glitz bookkeeper*: Finance = View & Edit, brands = Glitz N' Glim → Glitz only

Compartments are enforced **server-side on every read and write** (pages and
APIs), not just hidden in the UI. Chat, Forum, and My Tasks are available to
every signed-in user.

## 4. Daily rhythm

- Staff record money in / money out (with voteheads and running balances),
  stock in / stock out, purchases, meeting minutes and action points as they work.
- Before a recurring meeting, open it and hit **Generate brief** — the system
  prepares the chair with the previous meeting's decisions, who delivered on
  their action points (live task statuses), and the linked project's state.
- At the end of the day, the admin's dashboard shows **Close the day**: verify
  the numbers, confirm, close — the master report (tasks, money, stock,
  meetings, duties, carry-overs) is emailed to `OPS_REPORT_RECIPIENTS` and
  logged in `ops_report_logs`.

## 5. Security posture after this release

- Finance / inventory / procurement / chat / meetings tables: **service-role
  only** at the database level; the API layer enforces section + brand scope.
- Permission lookup failures no longer fail open (previously a failed
  `user_permissions` read was treated as "founding admin").
- Revoking a portal user now takes effect immediately server-side (pages AND
  API), not just at the next client page load.
- Chat membership and message sender identity are always resolved from the
  verified session token — never from the request body.
- `/api/agent/*` remains gated by `OPS_AGENT_API_KEY` (constant-time compare);
  the task agent skills (oc-ops / oc-design / oc-video) are unchanged and
  draft-only.
