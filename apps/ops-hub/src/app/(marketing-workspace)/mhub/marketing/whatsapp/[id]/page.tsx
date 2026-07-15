'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import FlowEditor from '@/components/marketing/FlowEditor'

export default function FlowDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  return (
    <div className="space-y-6">
      <Link href="/mhub/marketing/whatsapp" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to flows
      </Link>
      {id ? <FlowEditor flowId={id} /> : <p className="text-sm text-gray-400">Loading…</p>}
    </div>
  )
}
