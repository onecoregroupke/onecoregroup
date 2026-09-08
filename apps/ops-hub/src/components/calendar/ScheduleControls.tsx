'use client'

import { Plus, Trash2 } from 'lucide-react'

export interface ScheduleReminderValue {
  amount: string
  unit: 'minutes' | 'hours' | 'days'
  channel: 'email' | 'in_app'
}

export interface ScheduleOptionsValue {
  frequency: 'none' | 'daily' | 'weekdays' | 'selected_weekdays' | 'weekly' | 'monthly' | 'interval_days' | 'interval_weeks'
  interval_count: string
  weekdays: number[]
  end_mode: 'date' | 'count'
  ends_on: string
  occurrence_limit: string
  reminders: ScheduleReminderValue[]
}

export const emptyScheduleOptions = (): ScheduleOptionsValue => ({
  frequency: 'none', interval_count: '1', weekdays: [], end_mode: 'count', ends_on: '', occurrence_limit: '12', reminders: [],
})

export function scheduleOptionsPayload(value: ScheduleOptionsValue) {
  const recurrence = value.frequency === 'none' ? null : {
    frequency: value.frequency,
    intervalCount: Math.max(1, Number(value.interval_count || 1)),
    weekdays: value.weekdays,
    endsOn: value.end_mode === 'date' ? value.ends_on || null : null,
    occurrenceLimit: value.end_mode === 'count' ? Math.max(1, Number(value.occurrence_limit || 1)) : null,
  }
  const multiplier = { minutes: 1, hours: 60, days: 1440 }
  const reminders = value.reminders.map((reminder) => ({
    offsetMinutes: Math.max(0, Number(reminder.amount || 0)) * multiplier[reminder.unit],
    channel: reminder.channel,
  }))
  return { recurrence, reminders }
}

export function ScheduleControls({ value, onChange, startDate }: {
  value: ScheduleOptionsValue
  onChange: (value: ScheduleOptionsValue) => void
  startDate: string
}) {
  const set = <K extends keyof ScheduleOptionsValue>(key: K, next: ScheduleOptionsValue[K]) => onChange({ ...value, [key]: next })
  const updateReminder = (index: number, patch: Partial<ScheduleReminderValue>) => set('reminders', value.reminders.map((reminder, current) => current === index ? { ...reminder, ...patch } : reminder))
  return (
    <fieldset className="rounded-lg border border-gray-100 p-3">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Repeat & reminders</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Repeats"><select className="input" value={value.frequency} onChange={(event) => set('frequency', event.target.value as ScheduleOptionsValue['frequency'])}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="selected_weekdays">Selected weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="interval_days">Every N days</option><option value="interval_weeks">Every N weeks</option></select></Field>
        {['daily', 'selected_weekdays', 'weekly', 'monthly', 'interval_days', 'interval_weeks'].includes(value.frequency) && <Field label={value.frequency.includes('week') ? 'Week interval' : value.frequency === 'monthly' ? 'Month interval' : 'Day interval'}><input type="number" min="1" max="365" className="input" value={value.interval_count} onChange={(event) => set('interval_count', event.target.value)} /></Field>}
      </div>
      {value.frequency === 'selected_weekdays' && <div className="mt-3 flex flex-wrap gap-1.5">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => { const active = value.weekdays.includes(day); return <button type="button" key={label} onClick={() => set('weekdays', active ? value.weekdays.filter((candidate) => candidate !== day) : [...value.weekdays, day])} className={`rounded-full border px-2.5 py-1 text-xs ${active ? 'border-ocg-navy bg-ocg-navy text-white' : 'border-gray-200 text-gray-500'}`}>{label}</button> })}</div>}
      {value.frequency !== 'none' && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Ends"><select className="input" value={value.end_mode} onChange={(event) => set('end_mode', event.target.value as 'date' | 'count')}><option value="count">After a number of occurrences</option><option value="date">On a date</option></select></Field>{value.end_mode === 'count' ? <Field label="Occurrences"><input type="number" min="1" max="500" className="input" value={value.occurrence_limit} onChange={(event) => set('occurrence_limit', event.target.value)} /></Field> : <Field label="End date"><input type="date" min={startDate} className="input" value={value.ends_on} onChange={(event) => set('ends_on', event.target.value)} /></Field>}</div>}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between"><p className="text-xs font-medium text-gray-600">Additional reminders</p><button type="button" onClick={() => set('reminders', [...value.reminders, { amount: '30', unit: 'minutes', channel: 'in_app' }])} className="inline-flex items-center gap-1 text-xs font-medium text-ocg-gold"><Plus size={13} /> Add reminder</button></div>
        <div className="mt-2 space-y-2">{value.reminders.map((reminder, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"><input aria-label="Reminder amount" type="number" min="0" className="input" value={reminder.amount} onChange={(event) => updateReminder(index, { amount: event.target.value })} /><select aria-label="Reminder unit" className="input" value={reminder.unit} onChange={(event) => updateReminder(index, { unit: event.target.value as ScheduleReminderValue['unit'] })}><option value="minutes">minutes before</option><option value="hours">hours before</option><option value="days">days before</option></select><select aria-label="Reminder channel" className="input" value={reminder.channel} onChange={(event) => updateReminder(index, { channel: event.target.value as ScheduleReminderValue['channel'] })}><option value="in_app">In-app</option><option value="email">Email</option></select><button type="button" aria-label="Remove reminder" onClick={() => set('reminders', value.reminders.filter((_, current) => current !== index))} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div>)}</div>
      </div>
    </fieldset>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>{children}</label> }
