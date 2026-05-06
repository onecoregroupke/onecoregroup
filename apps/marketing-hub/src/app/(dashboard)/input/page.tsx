'use client'

import { useState, useEffect } from 'react'
import { getClient } from '@/lib/supabase'
import type { Brand, DailyMetricInsert } from '@ocg/db'
import { CheckCircle, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react'

const BRANDS_CONFIG = [
  { slug: 'nairobi-piano-technicians', label: 'Nairobi Piano Technicians', short: 'NPT', color: '#1a1a2e' },
  { slug: 'glitz-n-glim', label: "Glitz N' Glim", short: 'Glitz', color: '#b07a00' },
  { slug: 'nuuranest-stays', label: 'Nuuranest Stays', short: 'Nuura', color: '#1a6b42' },
  { slug: 'ar-rayyan-playhouse', label: 'Ar-Rayyan Playhouse & Daycare', short: 'Ar-Rayyan', color: '#2c45a0' },
  { slug: 'rhythms-college', label: 'Rhythms College', short: 'Rhythms', color: '#9a2a2a' },
  { slug: 'darul-swafa', label: 'Darul Swafa', short: 'Darul', color: '#2a6a2a' },
]

interface MetricForm {
  feed_posts_count: number
  stories_count: number
  reach: number
  impressions: number
  engagement: number
  likes: number
  comments: number
  dm_inquiries: number
  follower_count: number
  follower_change: number
  team_notes: string
  challenges: string
  plan_tomorrow: string
}

const DEFAULT_FORM: MetricForm = {
  feed_posts_count: 0,
  stories_count: 0,
  reach: 0,
  impressions: 0,
  engagement: 0,
  likes: 0,
  comments: 0,
  dm_inquiries: 0,
  follower_count: 0,
  follower_change: 0,
  team_notes: '',
  challenges: '',
  plan_tomorrow: '',
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-gray-400 text-xs mb-1">{hint}</p>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value)))}
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
      />
    </div>
  )
}

function TextareaInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy resize-none"
      />
    </div>
  )
}

export default function InputPortalPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]!)
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<MetricForm>(DEFAULT_FORM)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    const supabase = getClient()
    supabase
      .from('brands')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        setBrands((data as Brand[]) ?? [])
      })
  }, [])

  function updateForm(field: keyof MetricForm, value: number | string) {
    setForm((p) => ({ ...p, [field]: value }))
  }

  function resetAll() {
    setSelectedBrand(null)
    setStep(1)
    setForm(DEFAULT_FORM)
    setStatus('idle')
    setError('')
  }

  async function submit() {
    if (!selectedBrand) return
    setStatus('loading')
    setError('')

    try {
      const supabase = getClient()

      const payload: Omit<DailyMetricInsert, 'id' | 'created_at' | 'updated_at'> = {
        brand_id: selectedBrand.id,
        metric_date: date,
        feed_posts_count: form.feed_posts_count,
        stories_count: form.stories_count,
        reach: form.reach,
        impressions: form.impressions,
        engagement: form.engagement,
        likes: form.likes,
        comments: form.comments,
        dm_inquiries: form.dm_inquiries,
        follower_count: form.follower_count,
        follower_change: form.follower_change,
        youtube_views: 0,
        youtube_subscribers: 0,
        source: 'manual',
        team_notes: form.team_notes || null,
        challenges: form.challenges || null,
        plan_tomorrow: form.plan_tomorrow || null,
      }

      const { error: dbError } = await supabase
        .from('daily_metrics')
        .upsert(payload, { onConflict: 'brand_id,metric_date' })

      if (dbError) throw new Error(dbError.message)

      // Update compliance log
      const weekStart = new Date(date)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 5)

      const { data: existingMetrics } = await supabase
        .from('daily_metrics')
        .select('metric_date, feed_posts_count')
        .eq('brand_id', selectedBrand.id)
        .gte('metric_date', weekStart.toISOString().split('T')[0]!)
        .lte('metric_date', weekEnd.toISOString().split('T')[0]!)

      const daysPosted = (existingMetrics ?? []).filter((m) => (m as { feed_posts_count: number }).feed_posts_count > 0).length

      await supabase.from('compliance_log').upsert(
        {
          brand_id: selectedBrand.id,
          week_start: weekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          days_posted: daysPosted,
          target_days: 5,
          stories_days: 0,
          status: daysPosted >= 5 ? 'complete' : 'on_track',
          escalated: false,
          escalation_note: null,
        },
        { onConflict: 'brand_id,week_start' }
      )

      setSuccessMsg(`✓ Report submitted for ${selectedBrand.short_name} — ${date}`)
      setStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.')
      setStatus('error')
    }
  }

  // Step labels
  const steps = ['Brand', 'Posting', 'Performance', 'Notes & Submit']

  if (status === 'success') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="font-bold text-xl text-gray-900 mb-2">Report Submitted!</h2>
          <p className="text-gray-600 mb-8">{successMsg}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={resetAll}
              className="px-6 py-2.5 bg-ocg-navy text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
            >
              Submit Another Brand
            </button>
            <a
              href="/"
              className="px-6 py-2.5 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-gray-900">Input Portal</h1>
        <p className="text-gray-500 text-sm mt-1">Submit daily marketing metrics for a brand.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                i + 1 < step
                  ? 'bg-green-500 text-white'
                  : i + 1 === step
                  ? 'bg-ocg-navy text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i + 1 < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs ${i + 1 === step ? 'font-medium text-gray-900' : 'text-gray-400'} hidden sm:block`}>
              {s}
            </span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Step 1: Brand selector */}
        {step === 1 && (
          <div className="p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Select Brand</h2>
            <p className="text-gray-500 text-sm mb-5">Which brand are you reporting for?</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {BRANDS_CONFIG.map((bc) => {
                const brand = brands.find((b) => b.slug === bc.slug)
                const selected = selectedBrand?.slug === bc.slug
                return (
                  <button
                    key={bc.slug}
                    onClick={() =>
                      setSelectedBrand(
                        brand ?? {
                          id: bc.slug,
                          slug: bc.slug,
                          name: bc.label,
                          short_name: bc.short,
                          color_hex: bc.color,
                          is_active: true,
                          created_at: '',
                          instagram_handle: null,
                          instagram_account_id: null,
                          youtube_channel_id: null,
                          tiktok_handle: null,
                          facebook_page_id: null,
                          whatsapp_number: null,
                        }
                      )
                    }
                    className={`p-4 rounded-xl border-2 text-center transition-all ${
                      selected
                        ? 'border-ocg-navy bg-ocg-navy text-white'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: bc.color }}
                    >
                      {bc.short.charAt(0)}
                    </div>
                    <p className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-700'}`}>
                      {bc.short}
                    </p>
                  </button>
                )
              })}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ocg-navy"
              />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!selectedBrand}
                className="flex items-center gap-2 px-6 py-2.5 bg-ocg-navy text-white rounded-lg font-medium hover:bg-slate-800 transition-colors disabled:opacity-40"
              >
                Next — Posting <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Posting */}
        {step === 2 && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBrand?.color_hex ?? '#1a1a2e' }} />
              <h2 className="font-semibold text-gray-900">{selectedBrand?.name} — {date}</h2>
            </div>
            <h3 className="font-medium text-gray-700 mb-4">Step 2: Posting Activity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput
                label="Feed Posts Published"
                value={form.feed_posts_count}
                onChange={(v) => updateForm('feed_posts_count', v)}
                max={50}
              />
              <NumberInput
                label="Stories Published"
                value={form.stories_count}
                onChange={(v) => updateForm('stories_count', v)}
                max={50}
              />
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
              <button onClick={() => setStep(3)} className="flex items-center gap-2 px-6 py-2.5 bg-ocg-navy text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
                Next — Performance <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Performance */}
        {step === 3 && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBrand?.color_hex ?? '#1a1a2e' }} />
              <h2 className="font-semibold text-gray-900">{selectedBrand?.name} — {date}</h2>
            </div>
            <h3 className="font-medium text-gray-700 mb-4">Step 3: Performance Metrics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput label="Reach" value={form.reach} onChange={(v) => updateForm('reach', v)} />
              <NumberInput label="Impressions (optional)" value={form.impressions} onChange={(v) => updateForm('impressions', v)} />
              <NumberInput label="Engagement (total)" value={form.engagement} onChange={(v) => updateForm('engagement', v)} />
              <NumberInput label="Likes" value={form.likes} onChange={(v) => updateForm('likes', v)} />
              <NumberInput label="Comments" value={form.comments} onChange={(v) => updateForm('comments', v)} />
              <NumberInput label="Follower Count (current)" value={form.follower_count} onChange={(v) => updateForm('follower_count', v)} />
              <NumberInput label="Follower Change (+ or -)" value={form.follower_change} onChange={(v) => updateForm('follower_change', v)} min={-9999} />
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
              <button onClick={() => setStep(4)} className="flex items-center gap-2 px-6 py-2.5 bg-ocg-navy text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
                Next — Notes <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Notes + Submit */}
        {step === 4 && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedBrand?.color_hex ?? '#1a1a2e' }} />
              <h2 className="font-semibold text-gray-900">{selectedBrand?.name} — {date}</h2>
            </div>
            <h3 className="font-medium text-gray-700 mb-4">Step 4: Inquiries & Notes</h3>
            <div className="space-y-4">
              <NumberInput
                label="DM Inquiries received"
                value={form.dm_inquiries}
                onChange={(v) => updateForm('dm_inquiries', v)}
                hint="Potential leads or booking requests via DM"
              />
              <TextareaInput
                label="Team Notes"
                value={form.team_notes}
                onChange={(v) => updateForm('team_notes', v)}
                placeholder="What went well today? Any wins to highlight?"
              />
              <TextareaInput
                label="Challenges Today"
                value={form.challenges}
                onChange={(v) => updateForm('challenges', v)}
                placeholder="Any content blocks, platform issues, or client feedback?"
              />
              <TextareaInput
                label="Plan for Tomorrow"
                value={form.plan_tomorrow}
                onChange={(v) => updateForm('plan_tomorrow', v)}
                placeholder="What are you publishing tomorrow?"
              />
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep(3)} className="flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                <ChevronLeft size={16} /> Back
              </button>
              <button
                onClick={submit}
                disabled={status === 'loading'}
                className="flex items-center gap-2 px-8 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {status === 'loading' ? 'Saving...' : '✓ Submit Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
