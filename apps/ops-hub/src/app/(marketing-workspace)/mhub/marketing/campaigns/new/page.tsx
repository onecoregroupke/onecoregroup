'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CampaignEditor from '@/components/marketing/CampaignEditor'

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <Link href="/mhub/marketing/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to campaigns
      </Link>
      <h1 className="font-bold text-2xl text-gray-900">New campaign</h1>
      <CampaignEditor />
    </div>
  )
}
