import Link from 'next/link'
import { getNptServiceData } from '@/lib/management'

export const dynamic = 'force-dynamic'

export default async function NptTechniciansPage() {
  const { team, jobs } = await getNptServiceData()
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-semibold text-gray-900">Technicians</h1><p className="text-sm text-gray-500">Technician workload uses Ops team members and NPT service job assignments.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {team.length === 0 ? <p className="text-sm text-gray-500">No team members configured yet.</p> : team.map((m) => {
          const assigned = jobs.filter((j) => j.technician_id === m.id)
          const upcoming = assigned.filter((j) => j.scheduled_at && j.status !== 'Completed')
          return <Link key={m.id} href={`/management/team/${m.id}`} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-ocg-gold/50"><p className="font-medium text-gray-800">{m.name}</p><p className="text-xs text-gray-400">{m.role}{m.email ? ` · ${m.email}` : ''}</p><p className="mt-3 text-sm text-ocg-gold">{upcoming.length} upcoming service job{upcoming.length === 1 ? '' : 's'}</p></Link>
        })}
      </div>
    </div>
  )
}
