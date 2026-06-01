// =============================================================================
// Platform credential store (server-only). Reads/writes encrypted OAuth tokens.
// =============================================================================

import { createServerClient } from '@ocg/db'
import type { MarketingPlatformCredentialRow } from '@ocg/db'
import { encryptToken, decryptToken, CRED_KEY_VERSION } from './encryption'

export interface StoredToken {
  accessToken: string
  refreshToken?: string | null
}

export interface SaveCredentialInput {
  brandId: string
  platformId?: string | null
  platform: string
  accountHandle?: string | null
  externalUserId?: string | null
  accessToken: string
  refreshToken?: string | null
  scopes?: string[]
  expiresAt?: string | null
  createdByEmail?: string | null
}

export async function saveCredential(
  input: SaveCredentialInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('marketing_platform_credentials')
    .upsert(
      {
        brand_id: input.brandId,
        platform_id: input.platformId ?? null,
        platform: input.platform,
        account_handle: input.accountHandle ?? null,
        external_user_id: input.externalUserId ?? null,
        encrypted_payload: encryptToken(input.accessToken),
        refresh_payload: input.refreshToken ? encryptToken(input.refreshToken) : null,
        key_version: CRED_KEY_VERSION,
        scopes: input.scopes ?? [],
        expires_at: input.expiresAt ?? null,
        last_validated_at: new Date().toISOString(),
        status: 'active',
        created_by_email: input.createdByEmail ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'brand_id,platform,account_handle' },
    )
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'save_failed' }
  return { ok: true, id: (data as { id: string }).id }
}

/** Fetch + decrypt the active credential for (brand, platform). Returns null if
 *  none/decrypt fails — callers fall back to remind-only. */
export async function getActiveToken(
  brandId: string,
  platform: string,
): Promise<StoredToken | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('marketing_platform_credentials')
    .select('*')
    .eq('brand_id', brandId)
    .eq('platform', platform)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as MarketingPlatformCredentialRow
  try {
    return {
      accessToken: decryptToken(row.encrypted_payload),
      refreshToken: row.refresh_payload ? decryptToken(row.refresh_payload) : null,
    }
  } catch {
    return null
  }
}

export interface CredentialSummary {
  id: string
  brandId: string
  platform: string
  accountHandle: string | null
  status: string
  expiresAt: string | null
  lastValidatedAt: string | null
}

/** Safe summaries for the Platforms admin UI — never returns token material. */
export async function listCredentialSummaries(brandId?: string): Promise<CredentialSummary[]> {
  const supabase = createServerClient()
  let q = supabase
    .from('marketing_platform_credentials')
    .select('id, brand_id, platform, account_handle, status, expires_at, last_validated_at')
    .order('updated_at', { ascending: false })
  if (brandId) q = q.eq('brand_id', brandId)
  const { data } = await q
  return (
    (data as Array<{
      id: string
      brand_id: string
      platform: string
      account_handle: string | null
      status: string
      expires_at: string | null
      last_validated_at: string | null
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    platform: r.platform,
    accountHandle: r.account_handle,
    status: r.status,
    expiresAt: r.expires_at,
    lastValidatedAt: r.last_validated_at,
  }))
}
