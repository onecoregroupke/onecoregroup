import { db } from './serverClient'
import type { OcgBrandPrintIdentityRow } from '@ocg/db'

// =============================================================================
// Brand print identity — the legal identity that appears on generated documents
// (invoices, GRNs, issue notes, requisitions, intake acknowledgements, leave
// forms). Deliberately separate from the marketing `brands` row:
//
//   • Iceland Geyser Ltd is the company; Glitz N' Glim is its product brand.
//     They share one brand row, so `brands.name` is the wrong thing to print on
//     an invoice.
//   • NPT prints its own letterhead with its own phone lines.
//   • No One Core Group or WM & Co branding ever appears on these documents.
//
// Resolution order: the brand's override for this document type, then the
// brand's 'default', then null — callers must refuse to render rather than fall
// back to a generic identity.
// =============================================================================

export type DocumentScope =
  | 'default'
  | 'invoice'
  | 'quotation'
  | 'sales_order'
  | 'grn'
  | 'gin'
  | 'gtn'
  | 'requisition'
  | 'leave'
  | 'intake'
  | 'movement'
  | 'receipt'

export async function getPrintIdentity(
  brandId: string,
  scope: DocumentScope = 'default',
): Promise<OcgBrandPrintIdentityRow | null> {
  if (!brandId) return null
  const { data } = await db()
    .from('ocg_brand_print_identities')
    .select('*')
    .eq('brand_id', brandId)
    .in('document_scope', scope === 'default' ? ['default'] : [scope, 'default'])
    .eq('is_active', true)
  const rows = (data as OcgBrandPrintIdentityRow[] | null) ?? []
  if (rows.length === 0) return null
  return rows.find((r) => r.document_scope === scope) ?? rows.find((r) => r.document_scope === 'default') ?? null
}

export async function listPrintIdentities(brandIds?: string[] | null): Promise<OcgBrandPrintIdentityRow[]> {
  let q = db().from('ocg_brand_print_identities').select('*').order('document_scope', { ascending: true })
  if (brandIds && brandIds.length > 0) q = q.in('brand_id', brandIds)
  const { data } = await q
  return (data as OcgBrandPrintIdentityRow[] | null) ?? []
}

export async function upsertPrintIdentity(input: {
  brand_id: string
  document_scope?: string
  legal_name: string
  trading_name?: string
  postal_address?: string
  physical_address?: string
  email?: string
  phone?: string
  website?: string
  tax_pin?: string
  vat_number?: string
  logo_url?: string
  accent_hex?: string
  footer_note?: string
  extra_lines?: string[]
  updated_by?: string
}): Promise<OcgBrandPrintIdentityRow> {
  if (!input.brand_id) throw new Error('brand_id is required')
  if (!input.legal_name?.trim()) throw new Error('Legal name is required')
  const { data, error } = await db()
    .from('ocg_brand_print_identities')
    .upsert(
      {
        brand_id: input.brand_id,
        document_scope: input.document_scope || 'default',
        legal_name: input.legal_name.trim(),
        trading_name: input.trading_name ?? '',
        postal_address: input.postal_address ?? '',
        physical_address: input.physical_address ?? '',
        email: input.email ?? '',
        phone: input.phone ?? '',
        website: input.website ?? '',
        tax_pin: input.tax_pin ?? '',
        vat_number: input.vat_number ?? '',
        logo_url: input.logo_url ?? '',
        accent_hex: input.accent_hex ?? '',
        footer_note: input.footer_note ?? '',
        extra_lines: input.extra_lines ?? [],
        updated_by: input.updated_by ?? '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,document_scope' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgBrandPrintIdentityRow
}

/** Header lines for a printed document, in render order. Never empty strings. */
export function identityHeaderLines(identity: OcgBrandPrintIdentityRow): string[] {
  return [
    identity.postal_address,
    identity.physical_address,
    identity.phone,
    identity.email,
    identity.website,
    ...identity.extra_lines,
    identity.tax_pin ? `PIN No: ${identity.tax_pin}` : '',
    identity.vat_number ? `VAT No: ${identity.vat_number}` : '',
  ].filter((line) => line.trim().length > 0)
}
