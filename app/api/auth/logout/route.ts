import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session_token')?.value

    if (sessionToken && supabaseAdmin) {
      // Delete session from Supabase
      await supabaseAdmin
        .from('user_sessions')
        .delete()
        .eq('session_token', sessionToken)
    }

    // Clear cookie
    cookieStore.delete('session_token')

    return NextResponse.json({ success: true })
  } catch (error) {
    // Still return success even if there's an error
    const cookieStore = await cookies()
    cookieStore.delete('session_token')
    return NextResponse.json({ success: true })
  }
}

