// Pure duty rules (§§1–4, §13). No I/O — fully unit-tested in dutyModel.test.ts.
//
// Three concerns live here because each one is a correctness rule that must
// behave identically in the API, the UI and the brief generator:
//   1. TARGETING     — which employees a duty template resolves to.
//   2. COMPLETION    — whether a submitted completion satisfies the template.
//   3. PERMISSIONS   — the duties.* capability vocabulary from §3.

import type { PermissionsMap, BrandAccessMap } from '@ocg/db'
import { can, allowedBrands } from './permissions'
import { isDutyDueOn, type RecurrenceRule } from './recurrence'

// ─── Targeting ──────────────────────────────────────────────────────────────

export const DUTY_TARGET_KINDS = ['employee', 'team', 'department', 'brand', 'location', 'role'] as const
export type DutyTargetKind = (typeof DUTY_TARGET_KINDS)[number]

export const DUTY_KINDS = ['task', 'checklist', 'report', 'form', 'inspection'] as const
export type DutyKind = (typeof DUTY_KINDS)[number]

export interface DutyTarget {
  target_kind: string
  assignee_id?: string | null
  brand_id?: string | null
  target_team?: string | null
  target_department?: string | null
  target_role?: string | null
  target_location?: string | null
}

export interface TargetableMember {
  id: string
  name: string
  email: string
  active: boolean
  team?: string | null
  department?: string | null
  role?: string | null
  location?: string | null
  brand_ids?: string[] | null
}

/** Case- and whitespace-insensitive match; a blank target never matches. */
function matches(target: string | null | undefined, value: string | null | undefined): boolean {
  const t = (target ?? '').trim().toLowerCase()
  if (!t) return false
  return t === (value ?? '').trim().toLowerCase()
}

/**
 * The employees a duty template addresses. Inactive members are never targeted.
 *
 * A group-targeted duty produces one occurrence PER PERSON per due date — which
 * is why migration 055 re-keys the occurrence log on (duty, date, assignee).
 * An 'employee' duty with no assignee resolves to nobody rather than everybody:
 * silently fanning an unassigned duty out to the whole company would be the
 * worst possible failure mode.
 */
export function resolveDutyAssignees(duty: DutyTarget, members: TargetableMember[]): TargetableMember[] {
  const active = members.filter((m) => m.active)
  switch (duty.target_kind) {
    case 'employee':
      return duty.assignee_id ? active.filter((m) => m.id === duty.assignee_id) : []
    case 'team':
      return active.filter((m) => matches(duty.target_team, m.team))
    case 'department':
      return active.filter((m) => matches(duty.target_department, m.department))
    case 'role':
      return active.filter((m) => matches(duty.target_role, m.role))
    case 'location':
      return active.filter((m) => matches(duty.target_location, m.location))
    case 'brand':
      return duty.brand_id ? active.filter((m) => (m.brand_ids ?? []).includes(duty.brand_id!)) : []
    default:
      // Unknown kind → fall back to the explicit assignee only. Never fan out.
      return duty.assignee_id ? active.filter((m) => m.id === duty.assignee_id) : []
  }
}

export function describeDutyTarget(duty: DutyTarget, memberName?: string): string {
  switch (duty.target_kind) {
    case 'employee': return memberName ? memberName : 'One employee'
    case 'team': return `Team: ${duty.target_team || '—'}`
    case 'department': return `Department: ${duty.target_department || '—'}`
    case 'role': return `Role: ${duty.target_role || '—'}`
    case 'location': return `Location: ${duty.target_location || '—'}`
    case 'brand': return 'Everyone in the brand'
    default: return 'One employee'
  }
}

// ─── Working-day policy ─────────────────────────────────────────────────────

export interface HolidayRule {
  holiday_date: string
  brand_id?: string | null
  is_working_day: boolean
}

/**
 * Whether a duty occurrence actually falls on `dateISO`, combining the
 * recurrence rule with the holiday calendar. A holiday only suppresses a duty
 * when the template opted in via skip_holidays — a security round or a livestock
 * check still has to happen on a public holiday.
 */
export function isDutyActiveOn(
  duty: RecurrenceRule & { skip_holidays?: boolean; brand_id?: string | null },
  dateISO: string,
  holidays: HolidayRule[] = [],
): boolean {
  if (!isDutyDueOn(duty, dateISO)) return false
  if (!duty.skip_holidays) return true
  const applicable = holidays.filter(
    (h) => h.holiday_date === dateISO && (h.brand_id == null || h.brand_id === duty.brand_id),
  )
  // A declared working day overrides a same-date holiday.
  if (applicable.some((h) => h.is_working_day)) return true
  return applicable.length === 0
}

// ─── Completion gating ──────────────────────────────────────────────────────

export interface DutyRequirements {
  requires_note?: boolean
  requires_proof?: boolean        // 048: attachment/evidence
  requires_checklist?: boolean
  requires_approval?: boolean
  required_form_template_id?: string | null
}

export interface DutySubmission {
  status: string
  note?: string
  attachment_count?: number
  checklist_done?: number
  checklist_total?: number
  form_submission_id?: string | null
}

/**
 * §12: "The system should not accept completion when a required report is
 * missing." Returns every unmet requirement so the UI can show them at once
 * rather than one per attempt.
 *
 * Only a 'done' submission is gated — 'skipped' and 'pending' are explicitly how
 * someone records that the duty did NOT happen, and blocking those would push
 * people into recording false completions.
 */
export function validateDutyCompletion(req: DutyRequirements, sub: DutySubmission): string[] {
  if (sub.status !== 'done') return []
  const problems: string[] = []
  if (req.requires_note && !(sub.note ?? '').trim()) {
    problems.push('A completion note is required for this duty.')
  }
  if (req.requires_proof && (sub.attachment_count ?? 0) < 1) {
    problems.push('Evidence (at least one attachment) is required for this duty.')
  }
  if (req.requires_checklist) {
    const total = sub.checklist_total ?? 0
    const done = sub.checklist_done ?? 0
    if (total === 0) problems.push('This duty has no checklist items configured — ask a manager to add them.')
    else if (done < total) problems.push(`All ${total} checklist items must be ticked (${done} done).`)
  }
  if (req.required_form_template_id && !sub.form_submission_id) {
    problems.push('The required form must be submitted before this duty can be completed.')
  }
  return problems
}

/** The review state a fresh completion should land in (§13). */
export function initialReviewState(req: DutyRequirements, status: string): string {
  if (status !== 'done') return 'not_required'
  return req.requires_approval ? 'pending' : 'not_required'
}

/**
 * On-time measurement (§2 "Whether it was completed on time").
 * `due_at` and `completed_at` are ISO instants; grace is added to the deadline.
 * With no configured due time, an occurrence completed on its own date is on time.
 */
export function wasCompletedOnTime(
  dueAtIso: string | null,
  completedAtIso: string | null,
  graceMinutes = 0,
): boolean | null {
  if (!completedAtIso) return null
  if (!dueAtIso) return true
  const due = Date.parse(dueAtIso)
  const done = Date.parse(completedAtIso)
  if (!Number.isFinite(due) || !Number.isFinite(done)) return null
  return done <= due + Math.max(0, graceMinutes) * 60_000
}

/**
 * The instant an occurrence is due. Combines the occurrence date with the
 * template's time_of_day. Times are stored as wall-clock 'HH:MM' in the duty's
 * timezone; Africa/Nairobi is UTC+3 year-round with no DST, which is why a fixed
 * offset is safe here. A duty in any other zone must not use this helper.
 */
export function dutyDueAt(dateISO: string, timeOfDay: string, timezone = 'Africa/Nairobi'): string | null {
  const t = (timeOfDay ?? '').trim()
  if (!/^\d{2}:\d{2}$/.test(t)) return null
  if (timezone !== 'Africa/Nairobi') return `${dateISO}T${t}:00Z` // caller-supplied zone: treat as UTC
  return new Date(`${dateISO}T${t}:00+03:00`).toISOString()
}

/** Overdue = past its due instant (plus grace) and not completed. */
export function isOccurrenceOverdue(
  dueAtIso: string | null,
  status: string | null,
  nowIso: string,
  graceMinutes = 0,
): boolean {
  if (status === 'done' || status === 'skipped') return false
  if (!dueAtIso) return false
  const due = Date.parse(dueAtIso) + Math.max(0, graceMinutes) * 60_000
  return Date.parse(nowIso) > due
}

// ─── Permissions (§3) ───────────────────────────────────────────────────────
//
// The brief names ten capabilities. The platform stores permissions as
// section → none|view|edit with optional brand scoping, and every route already
// uses that model. Introducing a second, parallel permission store would mean
// two places to get wrong, so the capabilities are DERIVED from the existing
// model instead:
//
//   duties        view → view_own + complete_own
//                 edit → create + assign + edit + pause + end
//   duties_all    view → view_team (brand-scoped) / view_all (unscoped)
//   duties_review view → review
//
// The vocabulary the brief asks for exists and is enforced; only the storage is
// shared. Brand scoping on `duties` is what stops a manager assigning duties
// outside the brands they manage.

export type DutyCapability =
  | 'view_own' | 'complete_own' | 'create' | 'assign' | 'edit'
  | 'pause' | 'end' | 'view_team' | 'view_all' | 'review'

export interface DutyActor {
  permissions: PermissionsMap | null
  brandAccess: BrandAccessMap | null
  teamMemberId?: string | null
}

export function dutyCan(actor: DutyActor, capability: DutyCapability): boolean {
  const p = actor.permissions
  if (p === null) return true // founding admin
  switch (capability) {
    case 'view_own':
    case 'complete_own':
      return true // any signed-in user may see and complete their own duties
    case 'create':
    case 'assign':
    case 'edit':
    case 'pause':
    case 'end':
      return can(p, 'duties', 'edit')
    case 'view_team':
      return can(p, 'duties_all', 'view') || can(p, 'duties', 'edit')
    case 'view_all':
      return can(p, 'duties_all', 'view') && allowedBrands(actor.brandAccess, 'duties_all') === null
    case 'review':
      return can(p, 'duties_review', 'view') || can(p, 'duties', 'edit')
    default:
      return false
  }
}

/**
 * The brands within which this actor may create or assign duties.
 * null = unrestricted. An empty array means "granted, but scoped to nothing" —
 * which the caller must treat as no permission rather than as unrestricted.
 */
export function dutyAssignableBrands(actor: DutyActor): string[] | null {
  if (actor.permissions === null) return null
  return allowedBrands(actor.brandAccess, 'duties')
}

/** §3: a manager may only assign duties within brands they are authorised for. */
export function canAssignDutyInBrand(actor: DutyActor, brandId: string | null): boolean {
  if (!dutyCan(actor, 'assign')) return false
  const scope = dutyAssignableBrands(actor)
  if (scope === null) return true
  if (!brandId) return false // a scoped manager cannot create group-wide duties
  return scope.includes(brandId)
}

/**
 * Duty visibility scope, mirroring taskScope() so both surfaces behave alike.
 *   'all'    — every duty in the group
 *   'brands' — duties in these brands only (the team/brand manager)
 *   'own'    — only duties targeted at this person
 */
export type DutyScope =
  | { kind: 'all' }
  | { kind: 'brands'; brandIds: string[] }
  | { kind: 'own' }

export function dutyScope(actor: DutyActor): DutyScope {
  if (actor.permissions === null) return { kind: 'all' }
  if (!dutyCan(actor, 'view_team')) return { kind: 'own' }
  const scoped = allowedBrands(actor.brandAccess, 'duties_all') ?? allowedBrands(actor.brandAccess, 'duties')
  return scoped === null ? { kind: 'all' } : { kind: 'brands', brandIds: scoped }
}
