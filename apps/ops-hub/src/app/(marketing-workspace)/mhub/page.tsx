import { createServerClient } from '@ocg/db'
import type { Brand, DailyMetric, ComplianceLog } from '@ocg/db'
import { DashboardClient } from './DashboardClient'

async function getDashboardData() {
  try {
    const supabase = createServerClient()
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay() + 1)
    const weekStartStr = weekStart.toISOString().split('T')[0]!

    const [brandsRes, metricsRes, complianceRes] = await Promise.all([
      supabase.from('brands').select('*').eq('is_active', true).order('name'),
      supabase
        .from('daily_metrics')
        .select('*')
        .gte('metric_date', weekStartStr)
        .order('metric_date', { ascending: false }),
      supabase
        .from('compliance_log')
        .select('*')
        .eq('week_start', weekStartStr),
    ])

    return {
      brands: (brandsRes.data as Brand[]) ?? [],
      metrics: (metricsRes.data as DailyMetric[]) ?? [],
      compliance: (complianceRes.data as ComplianceLog[]) ?? [],
    }
  } catch {
    return { brands: [], metrics: [], compliance: [] }
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  return <DashboardClient {...data} />
}
