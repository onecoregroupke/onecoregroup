# OCG People & Knowledge Model

How the Ops Hub represents *who is responsible for what, what they're allowed to approve, who
can cover for them,* and *what the group actually knows* — as structured data an intelligence
layer can eventually reason over. This sweep built the structure; it deliberately does not add
any reasoning/AI on top of it.

---

## 1. Five things that look similar but are not the same record

| Concept | Where it lives | Answers |
|---|---|---|
| **Job Description** | `ops_team_members.job_description` + `employee_responsibilities` (`responsibility_type = 'formal'`) | What is this person officially responsible for? |
| **Standard Routine** | `employee_responsibilities` (`responsibility_type = 'routine'`) + `ocg_daily_duties` | What normally happens daily/weekly/monthly? |
| **Capability** | `employee_capabilities` / `employee_capability_assignments` | What does this person know how to do? |
| **Authority** | `employee_authorities` | What is this person allowed to approve/post/reverse? |
| **Actual Activity** | `employee_activity_history`, plus task completions and duty logs in their own tables | What did this person actually do, on a given date? |

The system never infers one from another. A person can be capable of approving purchase orders
without holding approval authority; a person can hold approval authority for one brand and not
another; a duty being "normally done" by someone doesn't mean today's occurrence was actually
completed by them (see cover, below).

## 2. Employee model

One person can hold **multiple entity assignments** — `employee_entity_assignments` is
many-rows-per-member, each with its own brand, department, operational area, role title and
`assignment_kind` (primary/additional/temporary), and its own reporting manager. There is no
`one person = one brand = one job title` assumption anywhere in the schema.

Capability and authority are **brand-scoped, not just person-scoped**: an `employee_authorities`
row carries its own `brand_id` and `operational_area`, so the same person can be authorised to
approve finance journals for Brand A and only prepare (not approve) them for Brand B.

### Coverage / backup

`employee_cover_assignments`: `covered_member_id`, `cover_member_id`, optional
`capability_id`/`process_name`, `cover_type` (primary/secondary/emergency), effective dates,
approver. This is queryable independently of any specific duty — "who can cover Fatma for daily
reconciliation" is a direct lookup, not something reconstructed from history.

### Resources

`employee_resource_assignments` — a person's responsibility for a store, register, vehicle,
classroom, production area or system, with its own `resource_type` and free-text reference.

### Qualifications

`employee_qualifications` — skill/qualification/training/certification, with provider, dates and
status, kept separate from capability (a qualification is evidence; a capability assignment is
the operational fact "this person can do X").

## 3. Duty cover vs. capability cover

Two related but distinct mechanisms:

- **`employee_cover_assignments`** is the standing relationship ("Reviewer can cover Operator for
  Daily Reconciliation, emergency only").
- **`ocg_duty_assignment_events`** (migration 067) is what actually happened on one occurrence —
  `original_assignee_id`, `substitute_assignee_id`, `reason`, timestamp. Recording a cover event
  never overwrites the duty's normal assignee; both the standing owner and the day's substitute
  remain visible. This is what lets a future "who can take over this missing person's work" query
  join standing cover relationships against actual substitution history instead of guessing from
  whoever happened to complete the last occurrence.

## 4. Authority is never inferred from capability

`hasAuthority(grants, action, { brandId, operationalArea, onDate })` in
`src/lib/governanceModel.ts` takes only `employee_authorities` rows as input — capability grants
are not part of its signature and cannot leak in. Every server route that gates an approval/post/
reverse/authorise action (finance journals, historical-import review/approve/post/lock, knowledge
publish) calls this function explicitly rather than checking module edit permission alone. Module
`edit` permission on `finance` lets someone *prepare* a journal; posting it needs a separate
`post` authority grant scoped to that brand and operational area. Verified live: an actor with
edit permission but no grant got 403 on `journal-approve`; a second actor with an explicit
`approve` grant succeeded.

## 5. Group knowledge

`ocg_knowledge_entries` (identity + scope: brand, department, operational area, knowledge type,
owner, visibility) and `ocg_knowledge_versions` (the actual content: one immutable row per
version, with status, source metadata and `supersedes_version_id`). An entry's
`current_version_id` points at whichever version is live; publishing a new version creates a new
row rather than mutating the old one, so "what did this policy say before the change, and who
changed it" is a direct query, not a reconstruction from audit JSON.

### Knowledge types

policy · SOP · procedure · job description · operational routine · checklist · control · rule ·
company information · product/service knowledge · training · historical/legacy system ·
reference material.

### Status — the load-bearing distinction

`draft → current`, or `legacy → superseded → archived`. **A historical/legacy/reference source
never starts as `current`.** `initialKnowledgeStatus(sourceClass)` in `governanceModel.ts`:

```
live source        → draft   (can be published to current, with authority)
historical/legacy/  → legacy (institutional knowledge, not active policy, by default)
reference source
```

A 2019 Rhythms operating manual is valuable institutional memory and gets registered — as
`legacy`, immediately queryable and citable, but never automatically treated as today's policy.
Only an explicit `publish` action, gated on an `approve` authority grant (not just knowledge edit
permission), moves a version to `current`.

### Future AI-readiness (not built in this sweep)

The intended priority order for a future reasoning layer, already expressible from this schema
without any further migration:

1. Current, approved knowledge (`status = 'current'`)
2. Current operational records (posted forms, posted ledger, live inventory)
3. Approved role/capability/authority information
4. Legacy/reference material (`status = 'legacy'`, cite but don't treat as instruction)

No autonomous agent, ranking model or automatic knowledge-application logic was added — this
sweep's job was to make sure the data those future decisions would run on is trustworthy and
correctly labelled, not to make the decisions.

## 6. UI

`/management/team/[memberId]` → **Role & Capability** tab: Employment/Entity Assignments, Job
Description, Responsibilities & Standard Routine, Capabilities, Authority (with an explicit
"capability never grants authority" notice), Recurring Duties, Coverage/Backup, Assets/Resources,
Training/Qualifications, Activity/Assignment History — each section independently addable,
each backed by its own table, read-only for users without `people` edit permission.

`/knowledge`: list + create + version + publish, scoped by the viewer's `knowledge` record access
level (own/department/management/group).
