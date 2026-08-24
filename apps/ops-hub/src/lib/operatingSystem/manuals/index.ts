import type { ManualDocument } from '../model'
import { groupManual } from './group'
import { nptManual } from './nairobiPianoTechnicians'
import { icelandGlitzManual } from './icelandGlitz'
import { rhythmsCollegeManual } from './rhythmsCollege'
import { arRayyanManual } from './arRayyan'
import { darulSwafaManual } from './darulSwafa'
import { nuuraNestManual } from './nuuraNest'

/**
 * The vetted v1 baseline for every Operating System manual (§57).
 *
 * Keyed by `content_ref`, which the version row in the database names. Content
 * lives here rather than as a JSONB blob in a migration because a manual is
 * reviewed like code: a change to how the company says it operates should show
 * up in a diff, not vanish into a database column nobody reads.
 *
 * The database `content` column takes precedence when a future authoring
 * surface writes structured chapters into it — see resolveManualContent().
 * Either way there is ONE resolved document, and both the web reader and the
 * PDF renderer consume it (§7).
 */
export const MANUAL_BASELINES: Record<string, ManualDocument> = {
  'one-core-group': groupManual,
  'nairobi-piano-technicians': nptManual,
  'iceland-glitz-n-glim': icelandGlitzManual,
  'rhythms-college': rhythmsCollegeManual,
  'ar-rayyan': arRayyanManual,
  'darul-swafa': darulSwafaManual,
  'nuura-nest': nuuraNestManual,
}

/** Every baseline, in the order the landing page lists them. */
export const MANUAL_ORDER = [
  'one-core-group',
  'nairobi-piano-technicians',
  'iceland-glitz-n-glim',
  'rhythms-college',
  'ar-rayyan',
  'darul-swafa',
  'nuura-nest',
] as const

export type ManualSlug = (typeof MANUAL_ORDER)[number]

export function baselineFor(ref: string): ManualDocument | null {
  return MANUAL_BASELINES[ref] ?? null
}
