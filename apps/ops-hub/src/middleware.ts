import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * Hard authentication gate. Every dashboard/page route below the matcher is
 * blocked unless the request carries a valid Supabase session cookie. This is
 * what stops the (force-dynamic, service-role) server pages from rendering
 * sensitive data for anonymous requests — the redirect happens BEFORE the page
 * renders. Section-level permission and per-user task scoping are enforced
 * further in, by `lib/server-auth.ts` (pages/layouts) and the API routes.
 *
 * Excluded from the matcher: /login, /auth/*, /complete (public completion
 * link), /api/* (routes authenticate themselves via Bearer / agent key /
 * completion token), Next internals, and static assets.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']
  if (!url || !anon) return response

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!login|auth|complete|api|_next|.*\\..*).*)'],
}
