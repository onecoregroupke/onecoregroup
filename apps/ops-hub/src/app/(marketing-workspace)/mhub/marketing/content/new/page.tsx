'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ContentEditor from '@/components/marketing/ContentEditor'

function NewContentInner() {
  const params = useSearchParams()
  return (
    <div className="space-y-6">
      <h1 className="font-bold text-2xl text-gray-900">New content</h1>
      <p className="-mt-3 text-sm text-gray-500">
        Save the post first — you&apos;ll go straight to its editor where you can{' '}
        <span className="font-medium text-gray-700">upload media</span> and{' '}
        <span className="font-medium text-gray-700">send it to the Task Agent</span> (those attach
        to the saved post&apos;s ID).
      </p>
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
