'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ContentEditor from '@/components/marketing/ContentEditor'
import SendToTaskAgent from '@/components/marketing/SendToTaskAgent'
import MediaUpload from '@/components/marketing/MediaUpload'

export default function EditContentPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id
  return (
    <div className="space-y-6">
      <Link href="/mhub/marketing/content" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={15} /> Back to content
      </Link>
      {id ? (
        <>
          <ContentEditor contentId={id} />
          <MediaUpload contentId={id} />
          <SendToTaskAgent contentId={id} />
        </>
      ) : (
        <p className="text-sm text-gray-400">Loading…</p>
      )}
    </div>
  )
}
