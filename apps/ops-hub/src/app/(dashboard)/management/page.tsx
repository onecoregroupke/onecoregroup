import {
  ApprovalQueueCard,
  BrandOverviewCard,
  MarketingPipelineCard,
  RecentCompletionsCard,
  SchoolAdminCard,
  ServiceOperationsCard,
  TaskRiskCard,
  TeamWorkloadCard,
  ThisWeekPrioritiesCard,
} from '@/components/management/DashboardCards'
import { ManagementActionPanel } from '@/components/management/ManagementActionPanel'
import { getManagementData } from '@/lib/management'
import { requireSection } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

export default async function ManagementCockpitPage() {
  await requireSection('management')
  const data = await getManagementData()
  const draftReady = data.tasks.filter((t) => t.current_status === 'AI Draft Ready')
  const recurringDue = data.recurring.filter((r) => r.is_active && r.next_run_at)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">
          Director Cockpit
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">One Core Management OS</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          A leadership view across brand operations, task risk, approvals, team workload,
          marketing production, NPT service operations, and Ar Rayyan admin follow-up.
        </p>
      </div>

      <ManagementActionPanel
        brands={data.brands.map((brand) => ({ id: brand.id, name: brand.short_name || brand.name }))}
        team={data.team.map((member) => ({ id: member.id, label: member.name }))}
        projects={data.projects.map((project) => ({ id: project.project_id, label: project.project_name }))}
        tasks={data.tasks.map((task) => ({ id: task.task_id, label: `${task.task_id} · ${task.task_name}` }))}
      />

      <BrandOverviewCard brands={data.brands} projects={data.projects} tasks={data.tasks} />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <TaskRiskCard tasks={data.tasks} blockers={data.blockers} today={data.today} />
        <ApprovalQueueCard approvals={data.approvals} draftReady={draftReady} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <TeamWorkloadCard team={data.team} tasks={data.tasks} />
        <ThisWeekPrioritiesCard tasks={data.tasks} recurring={recurringDue} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <MarketingPipelineCard content={data.marketingContent} campaigns={data.marketingCampaigns} />
        <RecentCompletionsCard completions={data.completions} tasks={data.tasks} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ServiceOperationsCard jobs={data.nptJobs} reminders={data.nptReminders} />
        <SchoolAdminCard
          students={data.rayyanStudents}
          admissions={data.rayyanAdmissions}
          feeFollowups={data.rayyanFeeFollowups}
          adminTasks={data.rayyanAdminTasks}
          snapshots={data.rayyanSchoolpaySnapshots}
        />
      </div>
    </div>
  )
}
