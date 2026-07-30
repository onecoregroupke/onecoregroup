/**
 * Decimal-safe money helpers. All financial arithmetic in the finance / school /
 * petty-cash modules goes through here — NEVER raw floating-point addition on
 * currency. Amounts are held as KES with 2 dp; internally we compute in integer
 * minor units (cents) and round half-up, matching NUMERIC(14,2) in Postgres.
 */

/** KES to integer minor units (cents), rounded half-up. */
export function toCents(amount: number | string | null | undefined): number {
  const n = typeof amount === 'string' ? parseMoney(amount) : Number(amount ?? 0)
  if (!Number.isFinite(n)) return 0
  // Avoid 0.005 float drift: work at 3 dp then round.
  return Math.round(n * 100)
}

/** Integer minor units back to a KES number with 2 dp. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

/** Sum a list of money amounts without float drift. Returns a 2dp number. */
export function sumMoney(amounts: Array<number | string | null | undefined>): number {
  return fromCents(amounts.reduce<number>((acc, a) => acc + toCents(a), 0))
}

/** a + b (2dp). */
export function addMoney(a: number | string, b: number | string): number {
  return fromCents(toCents(a) + toCents(b))
}

/** a - b (2dp). */
export function subMoney(a: number | string, b: number | string): number {
  return fromCents(toCents(a) - toCents(b))
}

/** Round any number to 2dp money. */
export function roundMoney(n: number): number {
  return fromCents(toCents(n))
}

/** Two money amounts equal to the cent. */
export function moneyEquals(a: number | string, b: number | string): boolean {
  return toCents(a) === toCents(b)
}

/**
 * Parse a money value out of a workbook cell that may be a number, a numeric
 * string with commas/spaces, a currency-prefixed string, or contain a trailing
 * "/=". Returns a finite number (0 for unparseable / blank). Parentheses denote
 * negatives (accounting style). Never throws.
 */
export function parseMoney(raw: unknown): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  let s = String(raw).trim()
  if (!s) return 0
  const negative = /^\(.*\)$/.test(s)
  s = s
    .replace(/[()]/g, '')
    .replace(/(ksh|kes|shs?|\/=)/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim()
  if (!s || s === '-') return 0
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

/** Format KES for display / export, e.g. 1234.5 → "1,234.50". */
export function formatKsh(amount: number | null | undefined, withSymbol = false): string {
  const n = roundMoney(Number(amount ?? 0))
  const s = n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return withSymbol ? `KES ${s}` : s
}
