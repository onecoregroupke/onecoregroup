# Iceland ERP + UI — Completion Report

**Branch:** `feat/erp-ui` (from `main` @ `d9ce1df`) · **Commits:** `ca8fe07`, `9d40bfd`
**Date:** 2026-08-18
**Tests:** 376 pass · **Type-check:** clean across 7 workspaces

Mapping report: [01-MAPPING-REPORT.md](./01-MAPPING-REPORT.md)
Prior phases: [`docs/shamim-workflow/`](../shamim-workflow/) · [`docs/duties-calendar-manufacturing/`](../duties-calendar-manufacturing/)

---

## Read this first

Two things need saying before anything else.

**1. The source documents did not arrive.** The brief said QuickBooks exports,
Iceland sales workbooks, delivery notes, petty-cash records, supplier documents,
goods-movement records and inventory records would follow. The only attachment
was a zip that is a **byte-identical re-send of the 17 photographs already
audited on 2026-08-05** (verified by md5 over the file set). No import was run,
no row was written from a source file, and no sequence was advanced. The mapping
report maps everything that *was* supplied — the physical documents — field by
field, and marks the spreadsheet and QuickBooks column mappings as pending
rather than inventing them.

**2. The UI gap is now partly closed, not closed.** Four of the nine priority
areas now have production UI. Five do not. The per-area status below is exact.

---

## 1. Audit finding — the blocker nobody had hit yet

Migrations **059–064 had no row types and no `Database` map entries** in
`packages/db`. `select()` happens to be permissive in this supabase-js version,
so the previous session's pure-logic modules type-checked; **`insert()` is not**.
The moment any code tried to write to `production_runs`, `field_sales_*`,
`petty_cash_floats` or `quickbooks_*`, it failed to compile.

So the schema was live in Supabase, the logic was tested, and **nothing could
write to any of it**. That is why there was no data-access layer for those
tables: it could not have been built without this first.

**Fixed.** 25 row types + Insert types + `Database` map entries + package
exports, following the repo's existing `Pick<Row, required> & Partial<Row>`
Insert convention. `InventoryItemRow` also gained the eleven migration-060
columns it already had in the database but not in TypeScript.

---

## 2. Per-area status against your priority list

| # | Area | Status |
|---|---|---|
| 1 | **Daily Duties** | **Complete** — configurable engine, manager + personal UI, review queue |
| 2 | **Calendar** | **Complete** — day/week/month, five scopes, event composer |
| 3 | Forms | **Not started** — the 052 lifecycle is still API-only |
| 4 | **Manufacturing** | **Complete** — stores, production runs, material issue, FG transfer |
| 5 | **Inventory** | **Partial** — stock card done; stock counts and reorder-alert UI not built |
| 6 | Procurement | **Not started** — `procurementChain.ts` and `/api/procurement/chain` exist; no UI |
| 7 | Field Sales | **Not started** — types now wired, no data layer, API or UI |
| 8 | Petty Cash | **Not started** — float lifecycle; the existing transaction UI is untouched |
| 9 | **Analytics** | **Complete (operational)** — manufacturing, inventory, tasks, duties, attendance |

---

## 3. What was built

### Daily Duties — complete

**`/duties`** — every signed-in user, their own occurrences only. Scope is fixed
to `own` in code and cannot be widened by a query parameter. Shows today plus a
7-day overdue window, with the completion controls each template requires
(checklist, note, evidence).

**`/management/duties`** — rebuilt on derived occurrences grouped by person,
with the review queue and the full duty builder.

**The duty builder** covers everything the engine supports and nothing it does
not: target by employee / team / department / role / location / brand; daily,
weekdays, weekly, monthly, last-working-day or every-N-days; time of day, grace,
reminder, escalation; skip-holidays; required note / evidence / checklist /
form / manager review; reviewer; checklist items.

Correctness points worth naming:

- **A group-targeted duty is ONE template.** Per-person occurrences are derived
  on read, so no duplicate task records are ever generated — the property the
  brief asked for, preserved from migration 055 rather than re-implemented.
- **`/api/duties/log` was a latent duplicate-row bug.** It keyed the completion
  log on `(duty, date)` while migration 055 re-keyed the table on
  `(duty, date, assignee)`. For a group-targeted duty that meant a second log
  row. It now delegates to the same validating service as `/api/duties/complete`
  — one completion path, one set of requirement checks.
- **A blank target resolves to nobody, never everybody** — refused in the
  builder, and already enforced in `resolveDutyAssignees`.
- **Reviewers cannot accept their own work** — checked server-side on both the
  assignee id and the recorded completer name.
- **Removing a checklist item deactivates it**; past completions keep their results.

### Calendar — complete

**`/calendar`** — day, week and month over the unified feed: tasks, personal
tasks, derived duty occurrences, approved leave and calendar events. Colour per
item type, type filters, an event composer, and a scope selector.

- **Entries come from existing records.** A task on the calendar *is* the
  `ops_tasks` row; a duty *is* the derived occurrence. There is no shadow
  calendar table, so completing a duty in `/duties` changes what the calendar
  shows without any sync step.
- **Named scopes resolve server-side.** `personal / team / department / company
  / management` become member-id lists in `lib/calendarScope.ts`, never in the
  browser, so a client cannot enumerate the roster by probing ids. The result is
  then intersected with the viewer's permission scope — **a scope can only ever
  narrow what permissions already allow.**
- A person with no team recorded resolves to **themselves**, not to everybody.
- Private events stay private from the founding admin too (pre-existing rule, preserved).
- Every reschedule writes to `ocg_calendar_reschedules`.

### Manufacturing — complete

**`/manufacturing`** — the raw material → production → packaging → finished
goods flow.

- **Three stores kept structurally apart**, each showing opening / in / out /
  current, so a "total stock" figure cannot silently mix ingredients with
  sellable product.
- **Three-step production run.** Plan → issue materials → record output.
  Issuing deducts through `recordStockMovement()`, so an over-issue is refused
  by the ledger *before* any material row is written. Only **accepted** units
  transfer into finished goods; rejected units are recorded and never stocked.
  The UI cannot express the other thing.
- Posting a finished-goods transfer is idempotent by construction: a status
  guard for the ordinary case, and the partial unique index on
  `inventory_movements.fg_transfer_id` for a concurrent replay.
- Production suggestions are labelled **suggestions**, not orders.
- Unclassified items (still `consumable`) are surfaced as a warning, because
  they are invisible to production planning until classified.

### Inventory — stock card complete

**`/inventory/stock-cards`** — the Opening · In · Out · Closing view you asked
for, filterable by brand, store, item type, item and date range, with per-item
movement history showing the source document behind every line.

The one design decision worth flagging: **balances are replayed from the ledger
rather than read from a stored figure**, and the difference against
`inventory_items.quantity` is surfaced as a **Drift** column. If those two
disagree, a quantity was changed outside the ledger. Hiding that would make the
page more reassuring and less true.

### Analytics — operational dashboards complete

**`/management/analytics/operations`** — the existing analytics page was
finance-only (brand income + school fees). This adds the operational half:

- **Manufacturing** — throughput, reject rate, plan attainment, raw and
  packaging consumption, per-product reject rates, bottlenecks by run age.
- **Inventory** — valuation by item type, stock-outs, below-reorder,
  slow-moving stock, ledger drift.
- **Tasks** — completion rate, overdue, awaiting review, workload per person.
- **Duties** — occurrence completion and on-time rates per person, computed
  from the derived occurrences (bounded to 62 days).
- **Attendance** — days covered, average hours, missing check-outs per person.

**Metrics that cannot be computed honestly are named as absent rather than shown
as zero.** SKU performance, salesperson performance and territory performance
need the sales order book that does not exist yet; the page says so, in place,
rather than rendering a zero that reads as a measured result.

---

## 4. Migrations added

**None.** Every table this work uses was already applied (001–065, verified by
`node scripts/supabase-sql.mjs --pending` → *All migrations applied*). The gap
was TypeScript, not SQL.

One migration **is recommended and deliberately not run** — a partial unique
index on `inventory_items (brand_id, lower(sku))`. It must not be added until a
duplicate scan has been run against live data, because it will fail if
duplicates already exist, and that failure is itself the check worth doing
first. See mapping report §4.2 and §13.

---

## 5. APIs added

| Route | Methods | Gate |
|---|---|---|
| `/api/duties` | GET, POST, PATCH | `duties` edit (create/edit) · pause/end separated from edit |
| `/api/duties/occurrences` | GET | any user; scope from permissions, never from a parameter |
| `/api/duties/complete` | POST | own occurrence; `duties` edit to act on behalf |
| `/api/duties/review` | GET, POST | `duties_review`; no self-review |
| `/api/duties/checklist` | GET, PUT | read any; write `duties` edit |
| `/api/duties/log` | POST | rewritten to delegate to the validating service |
| `/api/calendar` | GET, POST, PATCH | any user; visibility per item; reschedule audited |
| `/api/manufacturing` | POST | `inventory` edit + per-brand assertion |

Actions on `/api/manufacturing`: `create-store`, `set-bom-line`,
`remove-bom-line`, `create-run`, `issue-materials`, `record-consumption`,
`create-fg-transfer`, `post-fg-transfer`. Every one writes an audit event.

**Permissions:** `duties`, `duties_all`, `duties_review`, `calendar_team`,
`calendar_events` and `forms_approvals` are now **grantable in the Portal Access
matrix** — they existed in the type but could not be assigned. The `duties*`
keys fall back to an explicit `management` grant so every existing manager keeps
working unchanged. `calendar_team` deliberately has **no** fallback: a plain
management grant must not silently open every colleague's schedule.

---

## 6. UI completed

| Page | Purpose |
|---|---|
| `/duties` | Personal recurring duties |
| `/management/duties` | Duty configuration, occurrences by person, review queue |
| `/calendar` | Day / week / month, five scopes |
| `/manufacturing` | Stores, production runs, FG transfers, suggestions |
| `/inventory/stock-cards` | Opening / In / Out / Closing + movement history |
| `/management/analytics/operations` | Operational dashboards |

Navigation added: Calendar, My Duties, Manufacturing, Field Sales, Petty Cash.
**Field Sales and Petty Cash nav entries were deliberately NOT added** — their
pages do not exist yet, and a link to a 404 is worse than no link.

All existing design-language conventions were followed: server components with
`requireSection`, gold eyebrow + title header, `rounded-xl border-gray-100
bg-white shadow-sm` cards, the shared `.input` class, lucide icons, no new
design system, no new component library.

---

## 7. Imports completed

**None, deliberately.** The standing instruction was *do not import until the
mapping is validated*, and the source files did not arrive. The reusable import
framework (`lib/imports/framework.ts`) already provides preview → mapping →
validation → duplicate detection → commit → rollback → audit and was not
modified; it needs an adapter per workbook, which needs the workbook.

---

## 8. Remaining work

1. **Procurement UI** — requisition → GRN → GIN/GTN → supplier profiles. The
   data layer (`procurementChain.ts`, 701 lines) and `/api/procurement/chain`
   already exist, so this is the cheapest remaining item: UI only.
2. **Field Sales** — custody, daily returns, return notes, weekly
   reconciliation. Types are now wired; data layer, API and UI all still needed.
3. **Petty Cash float lifecycle** — issue, spend, replenish, carry-forward,
   closure, document packets. Same position as field sales.
4. **Forms lifecycle UI** — draft/autosave, correction, review, references,
   attachments are all API-only.
5. **Stock counts and reorder-alert UI** — tables and logic exist, no screens.
6. **QuickBooks reconciliation UI** — blocked on the exports for the field
   mapping defaults, but the match-review screen could be built now.
7. **The customer sales-invoice tables** — the one genuine schema gap
   (mapping report §8). Nothing can record invoice 1261 today.
8. **Notification dispatcher** — alerts, briefs and reminders compute; nothing sends.
9. **Delivery-note and document PDF rendering** — print identity is seeded, no renderer.

---

## 9. Blockers

| Blocker | Needed from you |
|---|---|
| Spreadsheet + QuickBooks import | The actual files |
| VAT convention | Inclusive back-computation at 16% (as invoice 1261), or exclusive-then-added? |
| Outbound delivery-note series | The current number on the physical pad |
| `UNIT` / `QTY` semantics | Keep the pad's inverted meaning, or normalise? |
| Canonical customer table | Three vocabularies exist; which wins? |
| Shamim's account | Still no `Shamim` in the codebase — needs the email on her Supabase row |

---

## 10. Testing

| Check | Result |
|---|---|
| `npm test` | **376 pass, 0 fail** |
| `npm run type-check` | **7 workspaces successful** |
| Dev server boot | **Ready in 7.4s**, no errors |
| New route compilation | All 6 pages compile and return 307 → `/login` unauthenticated |
| Server error log | **No server errors found** |

**No new automated tests were added.** The work in this session is UI and data
access; the pure logic it drives was already covered by the existing 376. That
is a real gap, not a claim of adequacy — there are still no integration tests
and no API-authorization tests.

---

## 11. Screenshots

**None, and I will not pretend otherwise.** Every new page is behind
authentication, and I am not permitted to enter credentials. What I verified
instead: each route compiles, the server logs no errors, and every route
correctly redirects an unauthenticated request. **The authenticated pages have
not been rendered or exercised against live data.**

To verify them yourself:

```bash
npm run dev:ops
```

then sign in and open `/duties`, `/calendar`, `/manufacturing`,
`/inventory/stock-cards` and `/management/analytics/operations`.

---

## 12. Architectural decisions

1. **No new tables, no new ledger.** Everything posts through
   `inventory_movements` via `recordStockMovement()`, so `quantity_after`, the
   item's live quantity and the once-only partial indexes keep working. Custody
   remains its own ledger (migration 061) because stock held by a salesperson is
   genuinely a different balance, not a duplicate of the same one.

2. **Occurrences stay derived.** The temptation with duties-in-a-calendar is to
   materialise rows. Doing so would have broken the brief's central property. The
   calendar reads the same derived occurrence the duty page does.

3. **Calendar scopes resolved server-side.** The alternative — sending the
   roster to the browser and filtering there — would have made every user's
   colleagues, teams and departments readable by anyone who opened devtools.

4. **Drift surfaced, not hidden.** Replaying the ledger and comparing it to the
   stored quantity is more expensive than reading the stored figure. It is worth
   it: the comparison is the only way to notice a quantity edited outside the ledger.

5. **Absent metrics named as absent.** A zero and a "no data" look identical on
   a dashboard and mean opposite things. Where a metric cannot be computed
   honestly, the page says why instead of rendering zero.

6. **Row types added rather than casts.** Casting past the missing `Database`
   entries would have worked and left the next person the same trap.

7. **Permission keys made grantable.** They existed in `SectionKey` but were
   absent from `SECTIONS`, so no administrator could assign them — a permission
   model nobody can configure is not a permission model.

---

## 13. Recommendations

1. **Procurement UI next.** It is the largest business surface with a complete
   data layer already behind it — the best ratio of value to remaining work.
2. **Send the workbooks.** Everything import-related has now been blocked across
   three sessions. The engine is built and tested; it needs the files.
3. **Answer the VAT question before any invoice work.** It changes every stored
   line total, and getting it wrong corrupts history rather than just looking wrong.
4. **Run the SKU and supplier duplicate scans** before the first import, then add
   the unique indexes. After an import, duplicates are far harder to unpick.
5. **Build the sales-invoice tables.** Until they exist, Iceland's actual
   revenue documents have nowhere to live, and sales analytics cannot be honest.
6. **Add API-authorization tests.** The brand-scope checks are written into every
   new route and are covered by nothing. That is the highest-risk untested surface.
7. **Add the Field Sales and Petty Cash nav entries** when those pages are built
   — the placeholder comment in `Sidebar.tsx` marks the spot.
