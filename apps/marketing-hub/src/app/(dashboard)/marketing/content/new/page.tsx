'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ContentEditor from '@/components/marketing/ContentEditor'

function NewContentInner() {
  const params = useSearchParams()
  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900">New content</h1>
      <ContentEditor
        defaultDate={params.get('date')}
        defaultPlatformId={params.get('platform')}
      />
    </div>
  )
}

export default function NewContentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-400">Loading…</p>}>
      <NewContentInner />
    </Suspense>
  )
}
