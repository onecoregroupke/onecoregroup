// Assigning an Ops Task from the calendar (§§22–26). Pure — no I/O — so the
// page, the composer and the tests agree on who may assign what, to whom.
//
// The one rule this file exists to protect: the calendar is an INPUT STATION.
// It produces a payload for the canonical POST /api/tasks and nothing else. No
// calendar-specific task record, no direct Supabase insert, no second
// assignment email. Everything downstream stays owned by the task engine.

import type { PermissionsMap } from '@ocg/db'
import { can, type TaskScope } from './permissions'

export interface AssignableProject {
  id: string
  label: string
  brandId: string | null
  brandLabel: string
}

export interface AssignablePerson {
  id: string
  name: string
}

/**
 * Whether this actor may assign tasks at all.
 *
 * Deliberately the SAME expression POST /api/tasks applies before creating a
 * task. §23: "Do not determine task-assignment authority using only a
 * client-side manager role string." Resolving it from the permissions map, on
 * the server, is what makes the hidden menu item a courtesy rather than the
 * control.
 */
export function canAssignTaskFromCalendar(
  permissions: PermissionsMap | null,
  isSuperAdmin: boolean,
): boolean {
  return can(permissions, 'ops', 'edit') || isSuperAdmin
}

/**
 * The projects this actor may assign work under.
 *
 * A brand manager is confined to their brands — the same check POST /api/tasks
 * re-runs on submit. Offering a project the server will refuse would be a
 * misleading menu; enforcing it ONLY here would be no enforcement at all, which
 * is why both exist.
 */
export function assignableProjects<T extends { brandId: string | null }>(
  projects: T[],
  scope: TaskScope,
): T[] {
  if (scope.kind !== 'brands') return projects
  return projects.filter((p) => !!p.brandId && scope.brandIds.includes(p.brandId))
}

/** The people this actor may assign work to, under the same brand confinement. */
export function assignablePeople<T extends { brandIds: string[] }>(
  people: T[],
  scope: TaskScope,
): T[] {
  if (scope.kind !== 'brands') return people
  return people.filter((m) => m.brandIds.some((b) => scope.brandIds.includes(b)))
}

export interface TaskComposerForm {
  task_name: string
  project_id: string
  assigned_to: string
  priority: string
  category: string
  target_date: string
  task_description: string
}

export interface TaskCreatePayload {
  task_name: string
  project_id: string
  assigned_to: string
  priority: string
  category: string
  target_date: string
  task_description: string
}

/**
 * The body sent to POST /api/tasks.
 *
 * Note what is absent: no brand_id. createTask() inherits brand and client from
 * the project, so sending a brand here would create a second opinion about
 * which brand the task belongs to — and eventually a disagreement.
 */
export function buildTaskPayload(form: TaskComposerForm): TaskCreatePayload {
  return {
    task_name: form.task_name.trim(),
    project_id: form.project_id,
    assigned_to: form.assigned_to,
    priority: form.priority,
    category: form.category,
    target_date: form.target_date,
    task_description: form.task_description,
  }
}

/** What must be filled in before the payload is worth sending. */
export function validateTaskForm(form: TaskComposerForm): string | null {
  if (!form.task_name.trim()) return 'A task title is required.'
  if (!form.project_id) return 'Choose the project this task belongs to.'
  return null
}

/** The composer's initial state for a clicked calendar day (§24). */
export function initialTaskForm(date: string, defaultProjectId: string): TaskComposerForm {
  return {
    task_name: '',
    project_id: defaultProjectId,
    assigned_to: '',
    priority: 'Medium',
    category: 'Operations',
    // The clicked day becomes the task's target date; the user may change it.
    target_date: date,
    task_description: '',
  }
}
