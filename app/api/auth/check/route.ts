import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session_token')?.value

    if (!sessionToken) {
      return NextResponse.json({ authenticated: false })
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ authenticated: false })
    }

    // Check session in Supabase
    const { data: session, error } = await supabaseAdmin
      .from('user_sessions')
      .select('user_id, expires_at, users(id, email)')
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !session) {
      return NextResponse.json({ authenticated: false })
    }

    // Handle users relation - it can be an object or array
    const userData = Array.isArray(session.users) ? session.users[0] : session.users

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user_id,
        email: userData?.email || null,
      },
    })
  } catch (error) {
    return NextResponse.json({ authenticated: false })
  }
}

