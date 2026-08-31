export interface InventoryAliasItem {
  id: string
  name: string
  canonical_name?: string | null
  is_active?: boolean
}

export interface InventoryAliasRowLike {
  item_id: string
  alias: string
  active?: boolean
}

export function normalizeInventoryAlias(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Resolve only one unambiguous active identity. Zero or many matches return null. */
export function resolveInventoryAlias(
  value: string,
  items: InventoryAliasItem[],
  aliases: InventoryAliasRowLike[],
): string | null {
  const wanted = normalizeInventoryAlias(value)
  if (!wanted) return null

  const activeItems = new Map(items.filter((item) => item.is_active !== false).map((item) => [item.id, item]))
  const matches = new Set<string>()
  for (const item of activeItems.values()) {
    const identity = item.canonical_name || item.name
    if (normalizeInventoryAlias(identity) === wanted) matches.add(item.id)
  }
  for (const alias of aliases) {
    if (alias.active === false || !activeItems.has(alias.item_id)) continue
    if (normalizeInventoryAlias(alias.alias) === wanted) matches.add(alias.item_id)
  }
  return matches.size === 1 ? [...matches][0]! : null
}
