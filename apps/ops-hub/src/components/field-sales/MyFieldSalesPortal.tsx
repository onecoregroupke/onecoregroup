'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, PackageOpen, Truck } from 'lucide-react'
import { api } from '@/lib/apiClient'

interface Allocation {
  id: string; label: string; weekStart: string; weekEnd: string
  lines: Array<{ itemId: string; itemName: string; unit: string; batchNumber: string; sellingPriceKsh: number; quantityIssued: number }>
}

export function MyFieldSalesPortal({ salespersonName, stock, allocations, activities, returns }: {
  salespersonName: string
  stock: Array<{ itemId: string; itemName: string; unit: string; balance: number; issued: number; sold: number; returned: number; damaged: number; sellingPriceKsh: number; deliveryNote: string; receivedDate: string }>
  allocations: Allocation[]
  activities: Array<{ id: string; ref: string; date: string; cash: number; mobile: number; bank: number; credit: number; status: string }>
  returns: Array<{ id: string; ref: string; date: string; status: string }>
}) {
  const [allocationId, setAllocationId] = useState(allocations[0]?.id ?? '')
  const selected = allocations.find((allocation) => allocation.id === allocationId) ?? null
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">My field sales</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-900"><Truck size={22} className="text-gray-400" /> {salespersonName}</h1>
        <p className="mt-1 text-sm text-gray-500">Record what left your custody today and request physical returns. You cannot post stock into a store.</p>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">My stock in custody</h2>
        {stock.length === 0 ? <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No stock is currently assigned to your custody.</p> : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{stock.map((row) => <div key={row.itemId} className="rounded-lg border border-gray-100 p-3"><p className="text-sm font-medium text-gray-800">{row.itemName}</p><p className="mt-1 text-2xl font-light tabular-nums text-gray-900">{row.balance} <span className="text-xs text-gray-400">{row.unit}</span></p><p className="text-xs font-medium text-emerald-700">KSh {(row.balance * row.sellingPriceKsh).toLocaleString()} at KSh {row.sellingPriceKsh.toLocaleString()} retail</p><p className="mt-1 text-[10px] text-gray-400">{row.deliveryNote ? `${row.deliveryNote} · received ${row.receivedDate} · ` : ''}issued {row.issued} · sold {row.sold} · returned {row.returned} · damaged {row.damaged}</p></div>)}</div>
        )}
      </section>

      {allocations.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You have no issued delivery note available for activity or returns.</p> : (
        <>
          <label className="block max-w-md text-xs font-medium text-gray-500">Delivery note
            <select className="input mt-1" value={allocationId} onChange={(e) => setAllocationId(e.target.value)}>{allocations.map((allocation) => <option key={allocation.id} value={allocation.id}>{allocation.label} · {allocation.weekStart} → {allocation.weekEnd}</option>)}</select>
          </label>
          {selected && <div className="grid gap-4 xl:grid-cols-2"><DailyActivityForm key={`activity-${selected.id}`} allocation={selected} /><ReturnRequestForm key={`return-${selected.id}`} allocation={selected} /></div>}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <History title="Daily activity history" empty="No activity submitted yet." rows={activities.map((row) => ({ key: row.id, title: `${row.ref} · ${row.date}`, detail: `cash KSh ${row.cash + row.mobile + row.bank} · credit KSh ${row.credit}`, status: row.status }))} />
        <History title="Physical return history" empty="No return requests yet." rows={returns.map((row) => ({ key: row.id, title: `${row.ref} · ${row.date}`, detail: row.status === 'submitted' ? 'Awaiting manager receipt' : 'Receiving decision recorded', status: row.status }))} />
      </div>
    </div>
  )
}

function DailyActivityForm({ allocation }: { allocation: Allocation }) {
  const router = useRouter()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [money, setMoney] = useState({ cash: '', mobile: '', bank: '', credit: '', submitted: '', references: '' })
  const [lines, setLines] = useState(() => allocation.lines.map((line) => ({ ...line, sold: '', damaged: '', sample: '', onHand: '', customer: '', paymentMethod: '', paymentReference: '', amountReceived: '', creditAmount: '', notes: '' })))
  const [state, setState] = useState({ saving: false, error: '', done: '' })

  function updateLine(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line))
  }

  function addCustomerLine(index: number) {
    setLines((current) => {
      const source = current[index]
      if (!source) return current
      const duplicate = {
        ...source,
        sold: '', damaged: '', sample: '', onHand: '', customer: '', paymentMethod: '',
        paymentReference: '', amountReceived: '', creditAmount: '', notes: '',
      }
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)]
    })
  }

  async function submit() {
    const active = lines.filter((line) => Number(line.sold) > 0 || Number(line.damaged) > 0 || Number(line.sample) > 0 || Number(line.onHand) >= 0 && line.onHand !== '')
    if (active.length === 0) { setState({ saving: false, error: 'Enter at least one sale, damage, sample or physical on-hand count.', done: '' }); return }
    setState({ saving: true, error: '', done: '' })
    const result = await api<{ error?: string }>('/api/field-sales', { method: 'POST', body: JSON.stringify({
      action: 'submit-daily-return', allocation_id: allocation.id, return_date: date,
      cash_received_ksh: Number(money.cash || 0), mobile_money_ksh: Number(money.mobile || 0), bank_ksh: Number(money.bank || 0), credit_sales_ksh: Number(money.credit || 0), amount_submitted_ksh: Number(money.submitted || 0), payment_references: money.references,
      lines: active.map((line) => ({ item_id: line.itemId, batch_number: line.batchNumber, quantity_sold: Number(line.sold || 0), quantity_damaged: Number(line.damaged || 0), quantity_sample: Number(line.sample || 0), quantity_on_hand: line.onHand === '' ? null : Number(line.onHand), customer: line.customer, payment_method: line.paymentMethod, payment_reference: line.paymentReference, amount_received_ksh: Number(line.amountReceived || 0), credit_amount_ksh: Number(line.creditAmount || 0), notes: line.notes })),
    }) })
    if (!result.ok) { setState({ saving: false, error: result.data?.error ?? 'Could not submit activity.', done: '' }); return }
    setState({ saving: false, error: '', done: 'Daily activity submitted. Custody was reduced; store inventory was not touched.' }); router.refresh()
  }
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><ClipboardList size={14} /> Record sale / daily activity</h2>
      <label className="mt-3 block max-w-xs text-xs font-medium text-gray-500">Activity date<input type="date" className="input mt-1" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <div className="mt-3 space-y-3">
        {lines.map((line, index) => (
          <div key={`${line.itemId}-${index}`} className="rounded-lg border border-gray-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-gray-800">{line.itemName} <span className="text-xs font-normal text-gray-400">· KSh {line.sellingPriceKsh.toLocaleString()} / {line.unit}</span></p>
              <button type="button" onClick={() => addCustomerLine(index)} className="text-xs font-medium text-ocg-gold hover:underline">+ Another customer line</button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <Mini label="Sold" value={line.sold} set={(value) => updateLine(index, { sold: value })} />
              <Mini label="Damaged" value={line.damaged} set={(value) => updateLine(index, { damaged: value })} />
              <Mini label="Sample" value={line.sample} set={(value) => updateLine(index, { sample: value })} />
              <Mini label="Physical on hand" value={line.onHand} set={(value) => updateLine(index, { onHand: value })} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <TextMini label="Customer" value={line.customer} set={(value) => updateLine(index, { customer: value })} />
              <TextMini label="Payment method" value={line.paymentMethod} set={(value) => updateLine(index, { paymentMethod: value })} />
              <TextMini label="Payment reference" value={line.paymentReference} set={(value) => updateLine(index, { paymentReference: value })} />
              <Mini label="Amount received (KSh)" value={line.amountReceived} set={(value) => updateLine(index, { amountReceived: value })} />
              <Mini label="Credit amount (KSh)" value={line.creditAmount} set={(value) => updateLine(index, { creditAmount: value })} />
              <TextMini label="Notes" value={line.notes} set={(value) => updateLine(index, { notes: value })} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Mini label="Cash (KSh)" value={money.cash} set={(cash) => setMoney({ ...money, cash })} />
        <Mini label="M-Pesa (KSh)" value={money.mobile} set={(mobile) => setMoney({ ...money, mobile })} />
        <Mini label="Bank (KSh)" value={money.bank} set={(bank) => setMoney({ ...money, bank })} />
        <Mini label="Credit (KSh)" value={money.credit} set={(credit) => setMoney({ ...money, credit })} />
        <Mini label="Amount submitted" value={money.submitted} set={(submitted) => setMoney({ ...money, submitted })} />
        <TextMini label="Payment references" value={money.references} set={(references) => setMoney({ ...money, references })} />
      </div>
      <Feedback state={state} />
      <button onClick={submit} disabled={state.saving} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{state.saving ? 'Submitting…' : 'Submit daily activity'}</button>
    </section>
  )
}

function ReturnRequestForm({ allocation }: { allocation: Allocation }) {
  const router = useRouter()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState(() => allocation.lines.map((line) => ({ ...line, quantity: '', condition: '' })))
  const [state, setState] = useState({ saving: false, error: '', done: '' })
  async function submit() { const active = lines.filter((line) => Number(line.quantity) > 0); if (!active.length) { setState({ saving: false, error: 'Enter at least one quantity being physically returned.', done: '' }); return } setState({ saving: true, error: '', done: '' }); const result = await api<{ error?: string }>('/api/field-sales', { method: 'POST', body: JSON.stringify({ action: 'create-return-request', allocation_id: allocation.id, return_date: date, lines: active.map((line) => ({ item_id: line.itemId, quantity_returned: Number(line.quantity), batch_number: line.batchNumber, condition: line.condition })) }) }); if (!result.ok) { setState({ saving: false, error: result.data?.error ?? 'Could not request the return.', done: '' }); return } setState({ saving: false, error: '', done: 'Return requested. Custody and store stock remain unchanged until a manager receives it.' }); router.refresh() }
  return <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ocg-gold"><PackageOpen size={14} /> Request physical return</h2><p className="mt-1 text-xs text-gray-500">Report what you will hand back. A receiving manager counts and accepts/rejects it before any stock changes.</p><label className="mt-3 block max-w-xs text-xs font-medium text-gray-500">Return date<input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></label><div className="mt-3 space-y-2">{lines.map((line, index) => <div key={line.itemId} className="grid gap-2 rounded-lg bg-gray-50 p-2 sm:grid-cols-[1fr_8rem_1fr]"><span className="text-sm text-gray-700">{line.itemName}</span><Mini label="Quantity" value={line.quantity} set={(value) => setLines((all) => all.map((entry, i) => i === index ? { ...entry, quantity: value } : entry))} /><TextMini label="Condition / reason" value={line.condition} set={(value) => setLines((all) => all.map((entry, i) => i === index ? { ...entry, condition: value } : entry))} /></div>)}</div><Feedback state={state} /><button onClick={submit} disabled={state.saving} className="mt-3 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{state.saving ? 'Submitting…' : 'Request return'}</button></section>
}

function History({ title, empty, rows }: { title: string; empty: string; rows: Array<{ key: string; title: string; detail: string; status: string }> }) { return <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h2>{rows.length === 0 ? <p className="mt-3 text-sm text-gray-500">{empty}</p> : <div className="mt-3 space-y-2">{rows.map((row) => <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 p-2"><span><span className="block text-sm font-medium text-gray-800">{row.title}</span><span className="block text-xs text-gray-400">{row.detail}</span></span><span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] capitalize text-gray-500">{row.status}</span></div>)}</div>}</section> }
function Mini({ label, value, set }: { label: string; value: string; set: (value: string) => void }) { return <label className="text-[10px] font-semibold uppercase text-gray-400">{label}<input type="number" min="0" step="any" className="input mt-1" value={value} onChange={(e) => set(e.target.value)} /></label> }
function TextMini({ label, value, set }: { label: string; value: string; set: (value: string) => void }) { return <label className="text-[10px] font-semibold uppercase text-gray-400">{label}<input className="input mt-1" value={value} onChange={(e) => set(e.target.value)} /></label> }
function Feedback({ state }: { state: { error: string; done: string } }) { return <>{state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}{state.done && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{state.done}</p>}</> }
