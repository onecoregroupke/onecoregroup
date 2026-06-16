---
name: oc-ops
description: One Core Group Ops Hub operations for any agent in this monorepo. Use to fetch/list tasks across the 6 brands, look up a task's full context, create clients/projects/tasks, submit specialist drafts that auto-deliver to Drive, and move tasks through the AI lifecycle. Triggers on "list OCG work", "what's due for NPT/Glitz/Nuura/etc", "create a project for <brand>", "draft a proposal for TASK-XXXX", "approve/complete a task", or anything about One Core Group tasks/projects/clients.
---

# One Core Group Ops Hub — agent operations toolkit

This monorepo hosts the OCG Ops Hub (`apps/ops-hub`, deployed at ops.onecoregroup.com).
Tasks, projects, and clients live in Supabase (source of truth) under the `ops_*`
tables. This skill lets any agent here do the same things a human does in the Hub,
by calling the deployed `/api/agent/*` API through one repo-native CLI.

One Core Group runs **6 brands**, each with its own social accounts:

| Brand | Slug |
|---|---|
| Nairobi Piano Technicians | `nairobi-piano-technicians` |
| Glitz N' Glim | `glitz-n-glim` |
| Nuuranest Stays | `nuuranest-stays` |
| Ar-Rayyan Playhouse & Daycare | `ar-rayyan-playhouse` |
| Rhythms College | `rhythms-college` |
| Darul Swafa | `darul-swafa` |

## The tool

```
node scripts/oc-ops.mjs <command> [options]
```

It reads `OPS_OPS_BASE_URL` (or `NEXT_PUBLIC_OPS_URL`) + `OPS_AGENT_API_KEY` from
`process.env` or `.env.local` (repo root or `apps/ops-hub/.env.local`, both
gitignored), so **never put the API key in a command or output**. If it reports
the key is missing, add to `.env.local`:

```
OPS_OPS_BASE_URL=https://ops.onecoregroup.com
OPS_AGENT_API_KEY=<the 64-hex key from the Ops Hub Vercel env>
```

Every command prints one JSON object with an `"ok"` flag. On `ok:false`, read `error`.

## Portable repo skill setup

These skills are intentionally stored in this repo so any device/account can work the same way after syncing the repository. Configure each device with:

```
OPS_OPS_BASE_URL=https://ops.onecoregroup.com
OPS_AGENT_API_KEY=<the Ops Hub agent key>
OCG_LOCAL_DELIVERY_ROOT=<path to the locally synced One Core Group Drive folder>
```

If Google Drive Desktop is not connected, guide the setup first. If work must continue, use the relevant skill's local fallback folder (`.claude/skills/<skill>/projects/TASK-XXXX/03_Working-Files`) and attach that fallback path to Task Ops with `attach-context`.

## Commands

| Need | Command |
|---|---|
| List active, agent-eligible tasks (optionally per brand) | `node scripts/oc-ops.mjs list-work [--brand <slug>] [--project PROJ-XXX] [--status "Ongoing"] [--limit 20]` |
| Full context for one task | `node scripts/oc-ops.mjs lookup-task TASK-XXXX` |
| Create an external client | `node scripts/oc-ops.mjs create-client "<Name>" [--industry ..] [--country-city ..]` |
| Create a project (brand OR client) | `node scripts/oc-ops.mjs create-project "<Name>" --brand <slug>` · `… --client CLIENT-XXX` |
| Create a task under a project | `node scripts/oc-ops.mjs create-task "<Name>" --project PROJ-XXX [--priority High] [--target-date YYYY-MM-DD] [--assigned-to ..] [--description ..]` |
| Draft inline with an internal specialist | `node scripts/oc-ops.mjs run-specialist TASK-XXXX --specialist analysis` |
| Submit a draft → deliver to Drive | `node scripts/oc-ops.mjs submit-artifact --task TASK-XXXX --specialist proposal --title "<t>" --content-file <path> [--summary ..]` |
| Move a task through the lifecycle | `node scripts/oc-ops.mjs set-status TASK-XXXX --status "<status>" [--note ..]` |
| Approve a delivered draft | `node scripts/oc-ops.mjs approve-artifact <artifact_id> [--note ..]` |
| Pin a note/link to a task | `node scripts/oc-ops.mjs attach-context --task TASK-XXXX --title "<t>" [--type note] [--url ..]` |
| Read a project's context doc | `node scripts/oc-ops.mjs get-project-context PROJ-XXX` |
| Set a project's ideal/done/satisfaction | `node scripts/oc-ops.mjs set-project-context PROJ-XXX [--ideal ..] [--done ..] [--satisfaction ..] [--code-refs ..] [--append ..]` |

## Taxonomy (do not invent IDs)

- IDs are minted by the system: `CLIENT-XXX`, `PROJ-XXX`, `TASK-XXXX`. Never make them up.
- A project belongs to **a brand (internal) and/or an external client** — pass `--brand` or `--client`.
- Valid statuses: `Not Started · Ongoing · AI Draft Ready · Edit Requested · Approved · Completed · Blocked · Partially Completed`.
- Lifecycle: `Not Started → Ongoing → AI Draft Ready → (Approved | Edit Requested) → Completed`.
- Runtimes: `analysis · research · report` run **inline** (Groq) and deliver immediately;
  `proposal · content · video_clipping · design_deck · client_communication · email_draft · project_admin · finance`
  are queued for the Hermes runtime — draft them yourself, then `submit-artifact`.

## Workflows

**Plan a brand's work**
1. `list-work --brand glitz-n-glim` → see active, agent-eligible tasks for that brand.
2. `lookup-task TASK-XXXX` → read `payload.task / .project.context_summary / .brand`.

**Onboard a project + starter tasks for a brand**
1. `create-project "<Name>" --brand <slug>` → note `PROJ-XXX`.
2. Confirm the starter tasks, then `create-task "<Name>" --project PROJ-XXX` for each.

**Draft & deliver a doc (proposal / content plan / etc.)**
1. `lookup-task TASK-XXXX` → read the context. Don't invent brand/client facts — mark them `[TO CONFIRM]`.
2. Write the markdown to a temp file (scope, deliverables, hooks/CTAs for content, assumptions, next steps;
   pricing as `[PRICING — confirm]`).
3. `submit-artifact --task TASK-XXXX --specialist <type> --title "…" --content-file <tmp> --summary "<one line>"`.
   This delivers `.gdoc` + `.docx` into the brand/project Drive folder and flips the task to `AI Draft Ready`.
4. Report the `doc_link`, the assumptions you made, the next step, and the exact deliverable location. Remember `artifact_id` for approval.

**Review lifecycle**
- Approve a draft: `approve-artifact <artifact_id>` (task → `Approved`).
- Request changes: `set-status TASK-XXXX --status "Edit Requested" --note "<what to change>"`, then re-draft.
- Complete: `set-status TASK-XXXX --status "Completed" --note "<why>"` (only with explicit human confirmation).

**Capture a project's intent**
- `set-project-context PROJ-XXX` patches by `## ` heading — only flags you pass change:
  `--ideal` (target end state), `--done` (definition of done), `--satisfaction` (what makes this
  brand/client happy), `--code-refs` (repo paths/files — always record code locations here),
  `--append` (dated note). `--mode replace --content-file <p>` rewrites the whole doc.

## Guardrails

Draft-only and internal. Never send external messages or post to a brand's social
accounts, never mark work `Completed` without explicit human confirmation, and
never invent brand/client facts, pricing, or IDs. The marketing calendar in
`apps/marketing-hub` is where approved content goes — propose, don't publish.

Every final chat response after a draft delivery must include the deliverable location and confirm whether Task Ops was updated with an artifact, attached context note, or status change. If Task Ops could not be reached, say that plainly and include the local path that needs to be attached later.
