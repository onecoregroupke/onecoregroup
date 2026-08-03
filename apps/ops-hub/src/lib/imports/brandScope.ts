// Brand-scoped import matrix (§3). Each brand only sees the import types that are
// operationally relevant to it. Non-school brands (NPT, Glitz, Nuuranest)
// deliberately CANNOT import student / school-fee data. Enforced on BOTH the
// client (which types render) AND the server (/api/imports rejects a type that
// is not allowed for the brand). Pure + unit-tested (brandScope.test.ts).

export type ImportSchool = 'rayyan' | 'rhythms' | 'darul'

const SCHOOL_BY_BRAND: Record<string, ImportSchool> = {
  'ar-rayyan-playhouse': 'rayyan',
  'rhythms-college': 'rhythms',
  'darul-swafa': 'darul',
}

export interface ImportTypeDef { value: string; label: string }

// The concrete adapters that exist today.
const PETTY_CASH: ImportTypeDef = { value: 'petty-cash', label: 'Petty cash (income + expenses)' }
const SCHOOL_LEDGER: ImportTypeDef = { value: 'school-ledger', label: 'Student fee ledger (all fee categories)' }

/** The school a school-brand maps to, or null for a non-school brand. */
export function schoolForBrandSlug(slug: string | undefined | null): ImportSchool | null {
  return slug ? (SCHOOL_BY_BRAND[slug] ?? null) : null
}

export function isSchoolBrand(slug: string | undefined | null): boolean {
  return !!slug && slug in SCHOOL_BY_BRAND
}

/**
 * Import types available for a brand.
 *   school brands (Rayyan / Rhythms / Darul) → student fee ledger + petty cash
 *   everyone else (NPT, Glitz, Nuuranest)    → petty cash only (NO student/fee)
 * Additional per-brand adapters (NPT sales/inventory, bank statements, …) plug in
 * here as they are built.
 */
export function importTypesForBrand(slug: string | undefined | null): ImportTypeDef[] {
  return isSchoolBrand(slug) ? [SCHOOL_LEDGER, PETTY_CASH] : [PETTY_CASH]
}

export function importTypeAllowedForBrand(slug: string | undefined | null, type: string): boolean {
  return importTypesForBrand(slug).some((t) => t.value === type)
}
