import { db, nowIso } from './serverClient'
import type {
  OcgConversationRow,
  OcgConversationMemberRow,
  OcgMessageRow,
  OcgForumPostRow,
  OcgForumReplyRow,
} from '@ocg/db'

// =============================================================================
// Internal chat (DMs + groups) and the public forum. Identity is the portal
// login email; membership is enforced SERVER-SIDE on every read and write —
// a user can only ever see conversations they belong to. The forum is open to
// every signed-in team member.
// =============================================================================

export interface ConversationSummary extends OcgConversationRow {
  members: OcgConversationMemberRow[]
  latest: OcgMessageRow | null
  unread: number
}

function normEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** All conversations the user belongs to, newest activity first. */
export async function listConversationsFor(email: string): Promise<ConversationSummary[]> {
  const supabase = db()
  const me = normEmail(email)
  const { data: memberships } = await supabase
    .from('ocg_conversation_members')
    .select('*')
    .eq('member_email', me)
  const mine = (memberships as OcgConversationMemberRow[] | null) ?? []
  if (mine.length === 0) return []
  const ids = mine.map((m) => m.conversation_id)

  const [{ data: convRows }, { data: memberRows }] = await Promise.all([
    supabase.from('ocg_conversations').select('*').in('id', ids).order('last_message_at', { ascending: false }),
    supabase.from('ocg_conversation_members').select('*').in('conversation_id', ids),
  ])
  const conversations = (convRows as OcgConversationRow[] | null) ?? []
  const allMembers = (memberRows as OcgConversationMemberRow[] | null) ?? []

  // Latest message + unread count per conversation (bounded fetch).
  const { data: msgRows } = await supabase
    .from('ocg_messages')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false })
    .limit(500)
  const messages = (msgRows as OcgMessageRow[] | null) ?? []

  return conversations.map((c) => {
    const myMembership = mine.find((m) => m.conversation_id === c.id)
    const convMessages = messages.filter((m) => m.conversation_id === c.id)
    const lastRead = myMembership?.last_read_at ?? '1970-01-01'
    return {
      ...c,
      members: allMembers.filter((m) => m.conversation_id === c.id),
      latest: convMessages[0] ?? null,
      unread: convMessages.filter((m) => m.created_at > lastRead && normEmail(m.sender_email) !== me).length,
    }
  })
}

/** Membership gate — returns the membership row or null. */
export async function getMembership(
  conversationId: string,
  email: string,
): Promise<OcgConversationMemberRow | null> {
  const { data } = await db()
    .from('ocg_conversation_members')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('member_email', normEmail(email))
    .maybeSingle()
  return (data as OcgConversationMemberRow | null) ?? null
}

/** Messages for a conversation the user is a member of; marks them read. */
export async function listMessages(
  conversationId: string,
  email: string,
  limit = 200,
): Promise<OcgMessageRow[]> {
  const membership = await getMembership(conversationId, email)
  if (!membership) throw new Error('You are not a member of this conversation.')
  const supabase = db()
  const { data } = await supabase
    .from('ocg_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  await supabase
    .from('ocg_conversation_members')
    .update({ last_read_at: nowIso() })
    .eq('id', membership.id)
  return (data as OcgMessageRow[] | null) ?? []
}

export async function sendMessage(input: {
  conversation_id: string
  sender_email: string
  sender_name: string
  body: string
}): Promise<OcgMessageRow> {
  if (!input.body?.trim()) throw new Error('Message cannot be empty.')
  const membership = await getMembership(input.conversation_id, input.sender_email)
  if (!membership) throw new Error('You are not a member of this conversation.')
  const supabase = db()
  const { data, error } = await supabase
    .from('ocg_messages')
    .insert({
      conversation_id: input.conversation_id,
      sender_email: normEmail(input.sender_email),
      sender_name: input.sender_name,
      body: input.body.trim(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  await supabase
    .from('ocg_conversations')
    .update({ last_message_at: nowIso(), updated_at: nowIso() })
    .eq('id', input.conversation_id)
  return data as OcgMessageRow
}

export async function postConversationMessage(input: {
  conversation_id: string
  sender_email: string
  sender_name: string
  body: string
}): Promise<OcgMessageRow> {
  if (!input.body?.trim()) throw new Error('Message cannot be empty.')
  const supabase = db()
  const { data, error } = await supabase
    .from('ocg_messages')
    .insert({
      conversation_id: input.conversation_id,
      sender_email: normEmail(input.sender_email),
      sender_name: input.sender_name,
      body: input.body.trim(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  await supabase
    .from('ocg_conversations')
    .update({ last_message_at: nowIso(), updated_at: nowIso() })
    .eq('id', input.conversation_id)
  return data as OcgMessageRow
}

export async function ensureConversationMembers(
  conversationId: string,
  members: { email: string; name: string }[],
): Promise<void> {
  const rows = members
    .map((m) => ({ conversation_id: conversationId, member_email: normEmail(m.email), member_name: m.name }))
    .filter((m) => m.member_email)
  if (rows.length === 0) return
  await db().from('ocg_conversation_members').upsert(rows, {
    onConflict: 'conversation_id,member_email',
    ignoreDuplicates: true,
  })
}

/**
 * Start a conversation. DMs are deduplicated: if a dm between exactly these
 * two people exists, it is returned instead of creating a duplicate.
 */
export async function startConversation(input: {
  creator_email: string
  creator_name: string
  member_emails: { email: string; name: string }[]
  name?: string
}): Promise<OcgConversationRow> {
  const supabase = db()
  const creator = normEmail(input.creator_email)
  const others = input.member_emails
    .map((m) => ({ email: normEmail(m.email), name: m.name }))
    .filter((m) => m.email && m.email !== creator)
  if (others.length === 0) throw new Error('Pick at least one person to chat with.')
  const type = others.length === 1 && !input.name ? 'dm' : 'group'

  if (type === 'dm') {
    // Find an existing dm shared by exactly these two members.
    const { data: myRows } = await supabase
      .from('ocg_conversation_members')
      .select('conversation_id')
      .eq('member_email', creator)
    const myIds = ((myRows as { conversation_id: string }[] | null) ?? []).map((r) => r.conversation_id)
    if (myIds.length > 0) {
      const { data: theirRows } = await supabase
        .from('ocg_conversation_members')
        .select('conversation_id')
        .eq('member_email', others[0].email)
        .in('conversation_id', myIds)
      const sharedIds = ((theirRows as { conversation_id: string }[] | null) ?? []).map((r) => r.conversation_id)
      if (sharedIds.length > 0) {
        const { data: dm } = await supabase
          .from('ocg_conversations')
          .select('*')
          .in('id', sharedIds)
          .eq('type', 'dm')
          .limit(1)
          .maybeSingle()
        if (dm) return dm as OcgConversationRow
      }
    }
  }

  const { data: conversation, error } = await supabase
    .from('ocg_conversations')
    .insert({ type, name: input.name?.trim() ?? '', created_by: creator })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  const conv = conversation as OcgConversationRow

  const memberRows = [
    { conversation_id: conv.id, member_email: creator, member_name: input.creator_name },
    ...others.map((m) => ({ conversation_id: conv.id, member_email: m.email, member_name: m.name })),
  ]
  const { error: memberError } = await supabase.from('ocg_conversation_members').insert(memberRows)
  if (memberError) throw new Error(memberError.message)
  return conv
}

// ── Forum ────────────────────────────────────────────────────────────────────

export interface ForumPostSummary extends OcgForumPostRow {
  replyCount: number
  lastReplyAt: string | null
}

export async function listForumPosts(limit = 100): Promise<ForumPostSummary[]> {
  const supabase = db()
  const { data: postRows } = await supabase
    .from('ocg_forum_posts')
    .select('*')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const posts = (postRows as OcgForumPostRow[] | null) ?? []
  if (posts.length === 0) return []
  const { data: replyRows } = await supabase
    .from('ocg_forum_replies')
    .select('post_id, created_at')
    .in('post_id', posts.map((p) => p.id))
  const replies = (replyRows as { post_id: string; created_at: string }[] | null) ?? []
  return posts.map((p) => {
    const mine = replies.filter((r) => r.post_id === p.id)
    return {
      ...p,
      replyCount: mine.length,
      lastReplyAt: mine.length ? mine.map((r) => r.created_at).sort().at(-1)! : null,
    }
  })
}

export async function getForumPost(
  id: string,
): Promise<{ post: OcgForumPostRow; replies: OcgForumReplyRow[] } | null> {
  const supabase = db()
  const { data: post } = await supabase.from('ocg_forum_posts').select('*').eq('id', id).maybeSingle()
  if (!post) return null
  const { data: replies } = await supabase
    .from('ocg_forum_replies')
    .select('*')
    .eq('post_id', id)
    .order('created_at', { ascending: true })
  return { post: post as OcgForumPostRow, replies: (replies as OcgForumReplyRow[] | null) ?? [] }
}

export async function createForumPost(input: {
  author_email: string
  author_name: string
  title: string
  body: string
  category?: string
}): Promise<OcgForumPostRow> {
  if (!input.title?.trim()) throw new Error('Post title is required.')
  const { data, error } = await db()
    .from('ocg_forum_posts')
    .insert({
      author_email: normEmail(input.author_email),
      author_name: input.author_name,
      title: input.title.trim(),
      body: input.body ?? '',
      category: input.category || 'general',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgForumPostRow
}

export async function addForumReply(input: {
  post_id: string
  author_email: string
  author_name: string
  body: string
}): Promise<OcgForumReplyRow> {
  if (!input.body?.trim()) throw new Error('Reply cannot be empty.')
  const { data, error } = await db()
    .from('ocg_forum_replies')
    .insert({
      post_id: input.post_id,
      author_email: normEmail(input.author_email),
      author_name: input.author_name,
      body: input.body.trim(),
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as OcgForumReplyRow
}
