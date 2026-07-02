import Link from 'next/link'
import { MessageCircle, Pin } from 'lucide-react'
import { listForumPosts } from '@/lib/chat'
import { requireActor } from '@/lib/server-auth'
import { NewForumPostButton } from '@/components/forum/ForumForms'

export const dynamic = 'force-dynamic'

const CATEGORY_STYLES: Record<string, string> = {
  announcements: 'bg-amber-50 text-amber-700',
  ideas: 'bg-purple-50 text-purple-700',
  questions: 'bg-blue-50 text-blue-700',
  general: 'bg-gray-100 text-gray-500',
}

// The company forum — open to every signed-in portal user.
export default async function ForumPage() {
  await requireActor()
  const posts = await listForumPosts()

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ocg-gold">Team communication</p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">Company forum</h1>
          <p className="mt-1 text-sm text-gray-500">Announcements, ideas, and open discussion — visible to the whole One Core team.</p>
        </div>
        <NewForumPostButton />
      </div>

      {posts.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Nothing posted yet. Be the first — share an announcement or an idea.
        </p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link key={post.id} href={`/forum/${post.id}`}
              className="block rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-ocg-gold/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {post.pinned && <Pin size={13} className="shrink-0 text-ocg-gold" />}
                    <p className="truncate font-medium text-gray-900">{post.title}</p>
                  </div>
                  {post.body && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.body}</p>}
                  <p className="mt-2 text-xs text-gray-400">
                    {post.author_name || post.author_email} · {new Date(post.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_STYLES[post.category] ?? CATEGORY_STYLES.general}`}>
                    {post.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                    <MessageCircle size={13} /> {post.replyCount}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
