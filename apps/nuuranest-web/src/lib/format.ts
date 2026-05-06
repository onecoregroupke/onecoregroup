export function formatKsh(amount: number | string | null | undefined): string {
  if (amount == null) return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return `KSH ${n.toLocaleString('en-KE')}`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  })
}
