'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import FlowEditor from '@/components/marketing/FlowEditor'

export default function NewFlowPage() {
  return (
    <div className="space-y-6">
      <Link href="/marketing/whatsapp" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to flows
      </Link>
      <h1 className="font-bold text-2xl text-gray-900">New WhatsApp flow</h1>
      <FlowEditor />
    </div>
  )
}
