import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getForumPost } from '@/lib/chat'
import { requireActor } from '@/lib/server-auth'
import { ForumReplyForm } from '@/components/forum/ForumForms'

export const dynamic = 'force-dynamic'

export default async function ForumPostPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  await requireActor()
  const { postId } = await params
  const result = await getForumPost(postId)
  if (!result) notFound()
  const { post, replies } = result

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={15} /> All posts
      </Link>

      <article className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">{post.category}</span>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">{post.title}</h1>
        <p className="mt-1 text-xs text-gray-400">
          {post.author_name || post.author_email} · {new Date(post.created_at).toLocaleString('en-KE')}
        </p>
        {post.body && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{post.body}</p>}
      </article>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">{replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</h2>
        {replies.map((reply) => (
          <div key={reply.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-700">
              {reply.author_name || reply.author_email}
              <span className="ml-2 font-normal text-gray-400">{new Date(reply.created_at).toLocaleString('en-KE')}</span>
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{reply.body}</p>
          </div>
        ))}
        <ForumReplyForm postId={post.id} />
      </section>
    </div>
  )
}
