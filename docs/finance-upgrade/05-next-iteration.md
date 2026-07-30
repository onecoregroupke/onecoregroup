# Recommended Next Iteration

The foundation, petty cash, imports/exports, and the canonical student-account ledger are
in place, tested, and building. The following build directly on them.

## 1. Student-profile account tab (Parts 3, 5, 12)
Embed a ledger view in the existing `/rayyan|rhythms|darul/students/[studentId]` pages:
- Consolidated balance + per-category and per-year balances (use `summariseStudentAccount`).
- A dense, spreadsheet-like ledger table (Date · Description · Receipt · M-Pesa · Debit ·
  Credit · running Balance) with sticky student identity and a pinned totals row.
- Inline draft entry with the `useAutosave` hook; **Post** / **Reverse** actions calling
  `/api/school-accounts`.
- "Download statement" button → `/api/finance/export?type=student-statement&school=&studentId=`.

## 2. Rhythms course-billing configuration UI (Part 4)
- CRUD for `school_programmes` (departments/courses) and versioned `school_fee_structures`
  (+ items), with effective dates.
- "Enrol student → generate charge schedule" flow that previews generated charges before
  posting (`school_enrollments` + draft `school_ledger_entries`), never overwriting history.
- Import the Rhythms DEBTS completion columns (exam book / final exam / certificate) into
  `school_student_requirements` via a `completion` adapter.

## 3. Ar-Rayyan category accounts polish (Part 5)
- Daycare vs Playhouse section toggle; per-category and per-year balance cards.
- Import the Playhouse **year-pivot** DEBTORS sheet as per-year opening balances via a
  `debtors` adapter (cross-check against derived balances; surface mismatches).

## 4. Academic reporting for Rhythms & Darul (Part 6)
- Generalise the Rayyan assessment pattern (`rayyan_assessments`) into a shared,
  configurable academic layer (assessment areas, competency scales, report templates) or
  per-school tables mirroring it.
- Report cards + transcripts rendered server-side (reuse the meeting-notes DOCX route
  pattern) and the finance↔academics indicator flags (read-only, configurable, auditable).

## 5. Import mapping-override UI (Part 8)
- Let the reviewer correct detected column roles before commit (persist to
  `data_imports.field_mappings`); the petty-cash adapter already reads
  `_mappings.operating_unit` / `.custodian`.
- Sheet-selection step and a per-sheet preview for multi-sheet workbooks.

## 6. Per-brand RLS policies (Part 13, defence-in-depth)
- Add `authenticated`-role RLS that scopes finance/petty-cash/ledger reads by a
  brand-access claim, complementing the query-layer enforcement already in place.

## 7. Reconciliation + approvals surfacing
- Petty-cash reconciliation screen (physical count vs expected, variance sign-off).
- Import approval step for high-value imports, mapped onto the permission system.
