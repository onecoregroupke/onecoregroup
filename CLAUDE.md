# One Core Group — System Handover & Build Context
**One Core Group · Nairobi, Kenya**
**Last updated: May 2026 · v1.0**

---

## 1. What This Is

One Core Group is a Kenyan multi-brand group. This monorepo holds the group's
public brand sites and two internal operating systems:

- **Ops Hub** (`apps/ops-hub`) — task delivery, assignment, and the agent stack.
  Create/assign/track tasks across all 6 brands; AI specialists draft work and
  deliver `.gdoc`/`.docx` into Drive. Ported from WM Task Ops, re-homed on OCG's
  Supabase Auth + permissions and made brand-aware.
- **Marketing Hub** (`apps/marketing-hub`) — the marketing operations board:
  calendar, content, campaigns, CRM, pillars, platforms, WhatsApp flows,
  reporting, and (in progress) episodes + live publishing.

**Source of truth: Supabase.** All apps share one Supabase project (`@ocg/db`).

### The 6 brands

| Brand | Slug | Color |
|---|---|---|
| Nairobi Piano Technicians | `nairobi-piano-technicians` | `#1a1a2e` |
| Glitz N' Glim | `glitz-n-glim` | `#b07a00` |
| Nuuranest Stays | `nuuranest-stays` | `#1a6b42` |
| Ar-Rayyan Playhouse & Daycare | `ar-rayyan-playhouse` | `#2c45a0` |
| Rhythms College | `rhythms-college` | `#9a2a2a` |
| Darul Swafa | `darul-swafa` | `#2a6a2a` |

---

## 2. Monorepo Layout

```
one-core-group/                 Turbo monorepo (npm workspaces)
├── apps/
│   ├── ops-hub/                Task delivery + agent stack (port 3030)
│   ├── marketing-hub/          Marketing operations board (port 3000)
│   ├── glitz-n-glim/           Glitz storefront
│   └── nuuranest-web/          Nuuranest site
├── packages/
│   ├── db/                     @ocg/db — Supabase client + types + migrations
│   ├── ui/                     @ocg/ui — shared components
│   └── email/                  @ocg/email — shared email templates
├── scripts/oc-ops.mjs          Agent CLI for the Ops Hub (see §7)
└── CLAUDE.md                   This file
```

Run an app: `npm run dev:ops` · `npm run dev:hub` · `npm run dev:glitz` · `npm run dev:nuuranest`.
Type-check everything: `npm run type-check`.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, App Router, Tailwind |
| Monorepo | Turborepo + npm workspaces (Node ≥ 20) |
| Database | Supabase (Postgres + RLS), one project shared by all apps |
| Auth | Supabase Auth + `user_permissions` (per-section `none｜view｜edit`) |
| AI | Groq — Llama 3.3 70B (specialist drafts) |
| Files | Google Drive (service account) for delivered docs |
| Email | Resend |
| Deploy | Vercel (one project per app) |

---

## 4. Auth & Permissions

Supabase Auth (email/password). Each invited user gets a `user_permissions` row
with a JSONB map of `section → 'none' | 'view' | 'edit'`. **No row = founding
admin** (full access). The client layout loads the row, `PermissionsContext`
exposes `can(section, level)`, and API routes validate the Supabase Bearer token
(`requireUser`). Section keys live in `@ocg/db` `SectionKey`.

- Marketing Hub gates on `marketing` (+ `dashboard`, `compliance`, `npt`, `glitz`, …).
- Ops Hub gates on `ops` (task system) and `ops_agents` (agent surface).
  "My Tasks" is visible to any signed-in user (their own work only).

---

## 5. Database (`packages/db`)

`@ocg/db` exports `createBrowserClient` / `createServerClient` and all row types.
Migrations are plain SQL, run in order in the Supabase SQL editor:

- `001`–`006` — brands, daily metrics, compliance, properties, products, piano catalogue
- `007` — `user_permissions`
- `008`–`016` — marketing: platforms, pillars, content, campaigns, CRM, WhatsApp, exec reports, seeds
- `017_ops_core.sql` — **Ops Hub core**: `ops_clients / ops_projects / ops_tasks /
  ops_team_members / ops_project_context / ops_completion_records`, atomic ID minter
  (`ops_next_sequence_val`). Projects/tasks are brand-aware (`brand_id → brands`).
- `018_ops_agents.sql` — **Ops Hub agents**: `ops_agent_runs / ops_agent_jobs /
  ops_agent_artifacts / ops_agent_context_sources / ops_agent_artifact_destinations /
  ops_review_queue / ops_report_logs`.

Convention for every table: authenticated users read; the `service_role` (used by
`/api/*` routes) does everything. New tables need explicit `GRANT ALL … TO service_role`.

---

## 6. Ops Hub (`apps/ops-hub`)

**Model:** `client (CLIENT-XXX)` and/or `brand` → `project (PROJ-XXX)` → `task (TASK-XXXX)`.
Internal brand work hangs off `brand_id` (no client needed); external work uses a client.
IDs are minted by `ops_next_sequence_val` — never invent them.

**Task lifecycle** (`lib/taskStatuses.ts`):
`Not Started → Ongoing → AI Draft Ready → (Approved | Edit Requested) → Completed`
(+ `Blocked`, `Partially Completed`).

**Assignment + completion:** tasks carry `assigned_to`; on create, Resend sends a
branded assignment email with a **no-login completion link** (HMAC of
`taskId:targetDate` via `OPS_TASK_TOKEN_SECRET`, expires target+14d). Team members
also see `/my-tasks`.

**Agent stack** (`lib/agents/*`): a specialist registry with runtime routing —
`internal` (Groq, runs inline) vs `hermes` (queued in `ops_agent_jobs` for a worker
or the oc-ops agent to draft) vs `none` (manual). `lib/agents/orchestrator.ts`
runs a specialist, writes an `ops_agent_artifacts` row, delivers `.gdoc`+`.docx`
to the project's Drive folder (`lib/drive.ts`), and flips the task to `AI Draft Ready`.

**API surface:**
- UI routes (Supabase Bearer): `/api/clients`, `/api/projects`, `/api/tasks`,
  `/api/tasks/[id]/status`, `/api/my-tasks`, `/api/complete` + `/api/complete/verify` (public, token).
- Agent routes (gated by `OPS_AGENT_API_KEY` via `x-ops-agent-key`): `/api/agent/run`,
  `/api/agent/tasks/eligible`, `/api/agent/tasks/[id]/{context,status,attach-context}`,
  `/api/agent/tasks`, `/api/agent/clients`, `/api/agent/projects`,
  `/api/agent/projects/[id]/context`, `/api/agent/artifacts`, `/api/agent/artifacts/[id]/approve`.

**Pages:** `/` dashboard · `/tasks` (+ brand/status filters) · `/tasks/[id]` ·
`/projects` · `/clients` · `/my-tasks` · `/agents` · `/settings` · `/complete` (public).

**Env (`apps/ops-hub/.env.local.example`):** Supabase keys, `OPS_AGENT_API_KEY`,
`OPS_TASK_TOKEN_SECRET`, `RESEND_API_KEY` + `OPS_EMAIL_FROM`, `GROQ_API_KEY`,
`GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` + `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `NEXT_PUBLIC_OPS_URL`.

---

## 7. Agent Operations Toolkit (oc-ops)

Any agent in this monorepo (Claude Code, Cowork, Codex, a worker) can drive the
Ops Hub the same way a human does, via one repo-native CLI:

```
node scripts/oc-ops.mjs <command>   # list-work, lookup-task, create-client,
                                     # create-project, create-task, run-specialist,
                                     # submit-artifact, set-status, approve-artifact,
                                     # attach-context, get/set-project-context
```

- Calls the deployed `/api/agent/*` API; reads `OPS_OPS_BASE_URL` + `OPS_AGENT_API_KEY`
  from `process.env` or `.env.local` (root or `apps/ops-hub`) — never hard-code the key.
- Brand-aware: `list-work --brand glitz-n-glim`, `create-project "…" --brand <slug>`.
- Full usage + workflows: **`.claude/skills/oc-ops/SKILL.md`**.
- IDs (`CLIENT-/PROJ-/TASK-`) are minted by the system — never invent them.
- Draft-only: never send external messages, never post to brand socials, never mark
  `Completed` without explicit human confirmation. Approved content flows to the
  Marketing Hub calendar; the oc-ops agent proposes, it does not publish.

---

## 8. Marketing Hub (`apps/marketing-hub`)

The marketing operations board. Data model (`@ocg/db` `Marketing*Row`,
migrations 008–016): platforms, pillars, content (status machine
`idea→draft→review→approved→scheduled→published`), campaigns, CRM
(contacts/deals/activities), WhatsApp flows, executive reports. Calendar colours
each content chip by its first pillar. `/api/marketing/*` routes use the service role.

This board is being reworked up to parity with the wallacemecha marketing board —
adding episodes/clipping, live publishers + OAuth/credentials, deeper metrics, a
richer dashboard, and the executive report engine (Workstream C).

---

## 9. Common Tasks

- **Add an ops migration:** new file in `packages/db/migrations/NNN_*.sql`, run it in
  the Supabase SQL editor, add row types to `packages/db/src/types.ts` (+ `Database`
  map + `src/index.ts` export).
- **Invite an ops user:** add to `ops_team_members` (name + email), and set their
  `user_permissions.permissions` (`ops`, `ops_agents`).
- **Generate the agent key:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  → set as `OPS_AGENT_API_KEY` in the Ops Hub Vercel env and your local `.env.local`.
