'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, ShieldCheck, UsersRound } from 'lucide-react'
import { api } from '@/lib/apiClient'
import type { EmployeeProfile } from '@/lib/people'

type Option = { id: string; name: string }
type AddKind = 'assignment' | 'responsibility' | 'capability' | 'authority' | 'cover' | 'resource' | 'qualification'

export function RoleCapabilityProfile({
  profile, brands, team, canEdit,
}: {
  profile: EmployeeProfile
  brands: Option[]
  team: Option[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [jobDescription, setJobDescription] = useState(profile.member.job_description)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState<AddKind | null>(null)
  const brandById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands])
  const teamById = useMemo(() => new Map(team.map((person) => [person.id, person.name])), [team])

  async function action(actionName: string, values: Record<string, unknown>) {
    setSaving(true); setError('')
    const { ok, data } = await api<{ error?: string }>(`/api/people/${profile.member.id}`, {
      method: 'POST',
      body: JSON.stringify({ action: actionName, values }),
    })
    setSaving(false)
    if (!ok) { setError(data?.error ?? 'Could not save.'); return false }
    setAdding(null)
    router.refresh()
    return true
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Role &amp; Capability</p>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">Organisational profile</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">Formal responsibility, routine, capability, authority and actual activity remain separate records.</p>
        </div>
        {!canEdit && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">Read only</span>}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Section title="Employment / Entity Assignments" onAdd={canEdit ? () => setAdding('assignment') : undefined}>
        {profile.assignments.length === 0 ? <Empty text="No structured entity assignment yet." /> : (
          <Rows rows={profile.assignments.map((row) => ({
            title: row.role_title || 'Role not named',
            detail: [brandById.get(row.brand_id), row.department, row.operational_area, row.assignment_kind].filter(Boolean).join(' · '),
          }))} />
        )}
      </Section>

      <Section title="Job Description">
        <textarea className="input min-h-32" disabled={!canEdit} value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Formal, approved job responsibilities…" />
        {canEdit && (
          <button disabled={saving} onClick={() => action('job-description', { job_description: jobDescription })} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
            <Save size={14} /> Save job description
          </button>
        )}
      </Section>

      <Section title="Responsibilities & Standard Routine" onAdd={canEdit ? () => setAdding('responsibility') : undefined}>
        {profile.responsibilities.length === 0 ? <Empty text="No structured responsibilities or routines yet." /> : (
          <Rows rows={profile.responsibilities.map((row) => ({ title: row.title, detail: [row.responsibility_type, row.cadence, row.description].filter(Boolean).join(' · ') }))} />
        )}
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Capabilities" onAdd={canEdit ? () => setAdding('capability') : undefined}>
          {profile.capabilities.length === 0 ? <Empty text="No verified capabilities yet." /> : <Rows rows={profile.capabilities.map((row) => ({ title: row.capability?.title ?? row.capability_id, detail: `${row.proficiency}${row.evidence_notes ? ` · ${row.evidence_notes}` : ''}` }))} />}
        </Section>
        <Section title="Authority" onAdd={canEdit ? () => setAdding('authority') : undefined}>
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Capability never grants approval or posting authority.</p>
          {profile.authorities.length === 0 ? <Empty text="No explicit authority grants." /> : <Rows rows={profile.authorities.map((row) => ({ title: `${row.authority_action} · ${row.authority_scope}`, detail: [row.operational_area, row.resource_type, row.active ? 'Active' : 'Revoked'].filter(Boolean).join(' · ') }))} />}
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Recurring Duties">
          {profile.duties.length === 0 ? <Empty text="No recurring duties assigned." /> : <Rows rows={profile.duties.map((row) => ({ title: row.title, detail: `${row.frequency} · ${row.priority}` }))} />}
        </Section>
        <Section title="Coverage / Backup" onAdd={canEdit ? () => setAdding('cover') : undefined}>
          {profile.cover.length === 0 ? <Empty text="No approved coverage relationships." /> : <Rows rows={profile.cover.map((row) => ({ title: row.process_name || 'General cover', detail: `${teamById.get(row.cover_member_id) ?? row.cover_member_id} · ${row.cover_type}` }))} />}
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Assets / Resources" onAdd={canEdit ? () => setAdding('resource') : undefined}>
          {profile.resources.length === 0 ? <Empty text="No stores, equipment or other resources assigned." /> : <Rows rows={profile.resources.map((row) => ({ title: row.resource_name, detail: `${row.resource_type} · ${row.responsibility}` }))} />}
        </Section>
        <Section title="Training / Qualifications" onAdd={canEdit ? () => setAdding('qualification') : undefined}>
          {profile.qualifications.length === 0 ? <Empty text="No training or qualifications recorded." /> : <Rows rows={profile.qualifications.map((row) => ({ title: row.title, detail: [row.qualification_type, row.provider, row.status].filter(Boolean).join(' · ') }))} />}
        </Section>
      </div>

      <Section title="Activity / Assignment History">
        {profile.activity.length === 0 ? <Empty text="No linked actual activity yet. Tasks and duty completions remain available in their own histories." /> : <Rows rows={profile.activity.map((row) => ({ title: row.summary, detail: `${new Date(row.activity_date).toLocaleString()} · ${row.activity_type}` }))} />}
      </Section>

      {adding && <AddDialog kind={adding} memberId={profile.member.id} brands={brands} team={team} saving={saving} onClose={() => setAdding(null)} onSubmit={action} />}
    </div>
  )
}

function Section({ title, children, onAdd }: { title: string; children: React.ReactNode; onAdd?: () => void }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ocg-gold">{title}</h3>
        {onAdd && <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-ocg-gold hover:text-ocg-gold"><Plus size={13} /> Add</button>}
      </div>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: Array<{ title: string; detail: string }> }) {
  return <ul className="divide-y divide-gray-100">{rows.map((row, index) => <li key={`${row.title}-${index}`} className="py-2.5"><p className="text-sm font-medium text-gray-800">{row.title}</p>{row.detail && <p className="mt-0.5 text-xs text-gray-500">{row.detail}</p>}</li>)}</ul>
}

function Empty({ text }: { text: string }) { return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">{text}</p> }

function AddDialog({ kind, brands, team, saving, onClose, onSubmit }: {
  kind: AddKind
  memberId: string
  brands: Option[]
  team: Option[]
  saving: boolean
  onClose: () => void
  onSubmit: (action: string, values: Record<string, unknown>) => Promise<boolean>
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    await onSubmit(kind === 'authority' ? 'grant-authority' : `add-${kind}`, Object.fromEntries(data.entries()))
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-2"><UsersRound size={18} className="text-ocg-gold" /><h3 className="font-semibold capitalize text-gray-900">Add {kind}</h3></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === 'assignment' && <><BrandSelect brands={brands} required /><Input name="role_title" label="Role title" required /><Input name="department" label="Department" /><Input name="operational_area" label="Operational area" /><Select name="assignment_kind" label="Assignment kind" options={['primary','additional','temporary']} /><PersonSelect name="reporting_manager_id" label="Reporting manager" team={team} /></>}
          {kind === 'responsibility' && <><Input name="title" label="Responsibility" required /><Select name="responsibility_type" label="Type" options={['formal','routine','resource','control']} /><Input name="cadence" label="Cadence" placeholder="Daily, weekly…" /><Input name="criticality" label="Criticality" placeholder="Normal, critical…" /><Textarea name="description" label="Description" /></>}
          {kind === 'capability' && <><Input name="code" label="Capability code" required /><Input name="title" label="Capability" required /><Input name="operational_area" label="Operational area" /><Select name="proficiency" label="Proficiency" options={['awareness','working','proficient','expert']} /><Textarea name="evidence_notes" label="Evidence / notes" /></>}
          {kind === 'authority' && <><BrandSelect brands={brands} /><Select name="authority_action" label="Authority action" options={['prepare','submit','review','approve','authorise','post','adjust','reverse']} /><Select name="authority_scope" label="Scope" options={['own','department','entity','group']} /><Input name="operational_area" label="Operational area" /><Input name="resource_type" label="Resource / document type" /><Input name="limit_amount_ksh" label="Limit (KSh)" type="number" /><Textarea name="grant_reason" label="Grant reason" /></>}
          {kind === 'cover' && <><PersonSelect name="cover_member_id" label="Cover person" team={team} required /><BrandSelect brands={brands} /><Input name="process_name" label="Capability / process" required /><Select name="cover_type" label="Cover type" options={['primary','secondary','emergency']} /><Textarea name="reason" label="Reason / conditions" /></>}
          {kind === 'resource' && <><BrandSelect brands={brands} /><Select name="resource_type" label="Resource type" options={['store','stock','equipment','classroom','register','vehicle','production_area','system']} /><Input name="resource_name" label="Resource name" required /><Input name="resource_reference" label="Reference" /><Textarea name="responsibility" label="Responsibility" /></>}
          {kind === 'qualification' && <><Select name="qualification_type" label="Type" options={['skill','qualification','training','certification']} /><Input name="title" label="Title" required /><Input name="provider" label="Provider" /><Input name="completed_on" label="Completed" type="date" /><Input name="expires_on" label="Expires" type="date" /><Input name="evidence_url" label="Evidence URL" /></>}
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ocg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><ShieldCheck size={15} />{saving ? 'Saving…' : 'Save'}</button></div>
      </form>
    </div>
  )
}

function Input({ name, label, required, type = 'text', placeholder }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><input className="input" name={name} type={type} required={required} placeholder={placeholder} /></label> }
function Textarea({ name, label }: { name: string; label: string }) { return <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><textarea className="input min-h-20" name={name} /></label> }
function Select({ name, label, options }: { name: string; label: string; options: string[] }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><select className="input" name={name}>{options.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label> }
function BrandSelect({ brands, required }: { brands: Option[]; required?: boolean }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Entity / brand</span><select className="input" name="brand_id" required={required}><option value="">Group / none</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label> }
function PersonSelect({ name, label, team, required }: { name: string; label: string; team: Option[]; required?: boolean }) { return <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">{label}</span><select className="input" name={name} required={required}><option value="">Select person</option>{team.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label> }
