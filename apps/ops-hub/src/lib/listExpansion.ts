// Expandable list rules (§29). Pure — no I/O, no React — so the behaviour is
// testable without rendering.
//
// The panels already hold every record; the collapse is purely presentational.
// That is why this stays client-side: adding server pagination to hide rows the
// page has already fetched would be slower AND more code.

/** How many rows a panel shows before it needs an expand control. */
export const INITIAL_VISIBLE = 12

/** Above this many rows, an expanded panel also offers a search box (§29). */
export const SEARCH_THRESHOLD = 30

export interface SearchableItem {
  name: string
  sku: string
}

/** Whether this panel needs an expand/collapse control at all. */
export function needsExpansion(total: number, initial = INITIAL_VISIBLE): boolean {
  return total > initial
}

/** Whether an expanded panel is long enough to warrant a filter box. */
export function needsSearch(total: number, threshold = SEARCH_THRESHOLD): boolean {
  return total > threshold
}

/** Case-insensitive match on item name or SKU (§29). */
export function matchesQuery(item: SearchableItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q)
}

/**
 * The rows a panel actually renders.
 *
 * Filtering happens BEFORE the collapse, so searching a collapsed panel shows
 * matches from anywhere in the list rather than only from the first twelve —
 * which is the behaviour that makes the search worth having.
 */
export function visibleItems<T extends SearchableItem>(
  items: T[],
  opts: { expanded: boolean; query?: string; initial?: number } ,
): T[] {
  const initial = opts.initial ?? INITIAL_VISIBLE
  const filtered = opts.query ? items.filter((i) => matchesQuery(i, opts.query!)) : items
  return opts.expanded ? filtered : filtered.slice(0, initial)
}

/** The expand/collapse control's label, or null when none is needed. */
export function expansionLabel(
  total: number,
  expanded: boolean,
  initial = INITIAL_VISIBLE,
): string | null {
  if (!needsExpansion(total, initial)) return null
  return expanded ? 'Show fewer' : `Show all ${total} items`
}
