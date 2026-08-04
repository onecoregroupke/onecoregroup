'use client'

import { useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCheck, Download, Plus, RotateCcw } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { SchoolChargeCategoryRow, SchoolLedgerEntryRow } from '@ocg/db'
import type { StudentAccountSummary } from '@/lib/schoolBalance'

type School = 'rayyan' | 'rhythms' | 'darul'

const money = (n: number) => `KSh ${Math.round(Number(n) || 0).toLocaleString()}`
const today = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

// Signed direction, mirrored from schoolBalance (charge/opening/refund +, payment/write_off −).
function signed(e: Pick<SchoolLedgerEntryRow, 'entry_type' | 'amount_ksh'>): number {
  const a = Number(e.amount_ksh) || 0
  if (e.entry_type === 'payment' || e.entry_type === 'write_off') return -a
  if (e.entry_type === 'reversal') return 0
  return a
}

/**
 * The canonical student-account panel: derived balance + per-category and
 * per-year breakdown, a dense ledger with running balance, record charge/payment
 * (explicit post — never autosaved, per the "no autosave on approval actions"
 * rule), reverse a posted entry, and download the Excel statement. Reused by
 * every school profile (Rayyan / Rhythms / Darul); the ledger is school-agnostic.
 */
export function StudentAccount({ school, studentId, admissionNo = '', brandId, canEdit }: {
  school: School
  studentId: string
  admissionNo?: string
  brandId?: string
  canEdit: boolean
}) {
  const [entries, setEntries] = useState<SchoolLedgerEntryRow[]>([])
  const [summary, setSummary] = useState<StudentAccountSummary | null>(null)
  const [categories, setCategories] = useState<SchoolChargeCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    entry_type: 'payment', category_label: '', amount_ksh: '', entry_date: today(),
    description: '', method: 'mpesa', receipt_no: '', mpesa_code: '', academic_year: '', term: '',
  })

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function load() {
    setLoading(true); setError('')
    const [acc, cats] = await Promise.all([
      api<{ entries: SchoolLedgerEntryRow[]; summary: StudentAccountSummary; error?: string }>(`/api/school-accounts?school=${school}&studentId=${studentId}`),
      api<{ categories: SchoolChargeCategoryRow[] }>(`/api/school-accounts?school=${school}`),
    ])
    if (!acc.ok) { setError(acc.data?.error ?? 'Could not load the student account.'); setLoading(false); return }
    setEntries(acc.data.entries ?? [])
    setSummary(acc.data.summary ?? null)
    setCategories(cats.data?.categories ?? [])
    setLoading(false)
  }
  useEffect(() => { void load() }, [school, studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function record() {
    if (!form.amount_ksh || Number(form.amount_ksh) <= 0) { setError('Enter an amount greater than zero.'); return }
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/school-accounts', {
      method: 'POST',
      body: JSON.stringify({
        action: form.entry_type,
        values: { school, student_id: studentId, student_admission_no: admissionNo, brand_id: brandId, ...form, state: 'posted' },
      }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to record entry.'); return }
    setForm((f) => ({ ...f, amount_ksh: '', description: '', receipt_no: '', mpesa_code: '' }))
    setShowForm(false)
    void load()
  }

  async function reverse(id: string) {
    const reason = window.prompt('Reason for reversing this entry? (kept for audit)')
    if (!reason?.trim()) return
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/school-accounts', {
      method: 'POST', body: JSON.stringify({ action: 'reverse', values: { school, id, reason } }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to reverse.'); return }
    void load()
  }

  // Commit draft charges (e.g. an enrolment's proposed schedule) to posted. This
  // is the explicit human step — draft entries never count toward the balance and
  // are never auto-posted.
  async function commit(id: string) {
    if (!window.confirm('Post this draft charge to the ledger? It will count toward the balance.')) return
    setBusy(true); setError('')
    const { ok, data } = await api<{ error?: string }>('/api/school-accounts', {
      method: 'POST', body: JSON.stringify({ action: 'commit', values: { school, id } }),
    })
    setBusy(false)
    if (!ok) { setError(data?.error ?? 'Failed to post the draft.'); return }
    void load()
  }

  async function commitAll() {
    const drafts = entries.filter((e) => e.state === 'draft')
    if (drafts.length === 0) return
    if (!window.confirm(`Post ${drafts.length} draft charge(s) to the ledger?`)) return
    setBusy(true); setError('')
    for (const d of drafts) {
      const { ok, data } = await api<{ error?: string }>('/api/school-accounts', {
        method: 'POST', body: JSON.stringify({ action: 'commit', values: { school, id: d.id } }),
      })
      if (!ok) { setError(data?.error ?? 'Failed to post a draft.'); break }
    }
    setBusy(false); void load()
  }

  const draftCount = entries.filter((e) => e.state === 'draft').length

  // Running balance over POSTED entries only (reversed originals & drafts carry
  // the balance forward unchanged) — matches the derived summary + the export.
  const rows = useMemo(() => {
    let running = 0
    return entries.map((e) => {
      const s = signed(e)
      if (e.state === 'posted') running += s
      return { e, s, running, isCharge: s > 0 }
    })
  }, [entries])

  const statementHref = `/api/finance/export?type=student-statement&school=${school}&studentId=${studentId}${brandId ? `&brand=${brandId}` : ''}`

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ocg-gold">
          <Banknote size={14} /> Student fee account
        </h2>
        <div className="flex flex-wrap gap-2">
          <a href={statementHref} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-ocg-gold hover:text-ocg-gold">
            <Download size={13} /> Statement
          </a>
          {canEdit && draftCount > 0 && (
            <button onClick={commitAll} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">
              <CheckCheck size={13} /> Post {draftCount} draft{draftCount > 1 ? 's' : ''}
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-ocg-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
              <Plus size={13} /> Record charge / payment
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm text-gray-500">Loading account…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Outstanding" value={money(summary?.postedBalance ?? 0)} tone={(summary?.postedBalance ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <Stat label="Total charged" value={money(summary?.totalCharges ?? 0)} />
            <Stat label="Total paid" value={money(summary?.totalPayments ?? 0)} tone="text-emerald-600" />
            <Stat label="Entries" value={String(summary?.entryCount ?? 0)} sub={summary && summary.draftBalance !== 0 ? `${money(summary.draftBalance)} in drafts` : ''} />
          </div>

          {canEdit && showForm && (
            <div className="mt-4 grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 lg:grid-cols-4">
              <Field label="Type">
                <select className="input" value={form.entry_type} onChange={(e) => set('entry_type', e.target.value)}>
                  <option value="payment">Payment received</option>
                  <option value="charge">Charge / bill</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </Field>
              <Field label="Category">
                <input className="input" list="student-fee-categories" value={form.category_label} onChange={(e) => set('category_label', e.target.value)} placeholder="Tuition, Uniform…" />
                <datalist id="student-fee-categories">
                  {categories.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
              </Field>
              <Field label="Amount KSh"><input type="number" min="1" className="input" value={form.amount_ksh} onChange={(e) => set('amount_ksh', e.target.value)} /></Field>
              <Field label="Date"><input type="date" className="input" value={form.entry_date} onChange={(e) => set('entry_date', e.target.value)} /></Field>
              <Field label="Method">
                <select className="input" value={form.method} onChange={(e) => set('method', e.target.value)}>
                  <option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="">—</option>
                </select>
              </Field>
              <Field label="Receipt no."><input className="input" value={form.receipt_no} onChange={(e) => set('receipt_no', e.target.value)} /></Field>
              <Field label="M-Pesa code"><input className="input" value={form.mpesa_code} onChange={(e) => set('mpesa_code', e.target.value)} /></Field>
              <Field label="Term / year"><input className="input" value={form.term} onChange={(e) => set('term', e.target.value)} placeholder="Term 1 · 2026" /></Field>
              <Field label="Description"><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
              <div className="flex items-end lg:col-span-4">
                <button onClick={record} disabled={busy} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                  {busy ? 'Recording…' : 'Post entry'}
                </button>
              </div>
            </div>
          )}

          {summary && summary.byCategory.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">By category</p>
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[440px] text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400"><th className="px-3 py-2">Category</th><th className="px-3 py-2 text-right">Charged</th><th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {summary.byCategory.map((c) => (
                      <tr key={c.key}><td className="px-3 py-2 text-gray-700">{c.label}</td><td className="px-3 py-2 text-right text-gray-600">{money(c.charged)}</td><td className="px-3 py-2 text-right text-emerald-700">{money(c.paid)}</td><td className={`px-3 py-2 text-right font-medium ${c.balance > 0 ? 'text-amber-700' : 'text-gray-700'}`}>{money(c.balance)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Ledger</p>
            {rows.length === 0 ? (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No fee entries yet. {canEdit ? 'Record a charge or payment above, or import the fee workbook.' : ''}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Receipt / M-Pesa</th>
                    <th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th>
                    {canEdit && <th className="px-3 py-2"></th>}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(({ e, s, running, isCharge }) => (
                      <tr key={e.id} className={`hover:bg-gray-50 ${e.state !== 'posted' ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{e.entry_date}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {e.description || e.category_label || e.entry_type}
                          {e.state === 'reversed' && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">reversed</span>}
                          {e.state === 'draft' && <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">draft</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{[e.receipt_no, e.mpesa_code].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{isCharge && s !== 0 ? money(Math.abs(s)) : ''}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{!isCharge && s !== 0 ? money(Math.abs(s)) : ''}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{e.state === 'posted' ? money(running) : '—'}</td>
                        {canEdit && <td className="px-3 py-2 text-right">
                          {e.state === 'posted' && e.entry_type !== 'reversal' && (
                            <button onClick={() => reverse(e.id)} disabled={busy} title="Reverse this entry" className="text-gray-300 hover:text-red-500"><RotateCcw size={14} /></button>
                          )}
                          {e.state === 'draft' && (
                            <button onClick={() => commit(e.id)} disabled={busy} title="Post this draft charge" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">Post</button>
                          )}
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function Stat({ label, value, sub, tone = 'text-gray-900' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className={`text-2xl font-light ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-amber-600">{sub}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label>
}
