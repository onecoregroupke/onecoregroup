'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import CampaignEditor from '@/components/marketing/CampaignEditor'

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  return (
    <div className="space-y-6">
      <Link href="/marketing/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to campaigns
      </Link>
      {id ? <CampaignEditor campaignId={id} /> : <p className="text-sm text-gray-400">Loading…</p>}
    </div>
  )
}
