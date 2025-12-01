import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Debug endpoint to check Supabase connection and user data
// Only use this in development or remove in production
export async function GET(request: NextRequest) {
  try {
    // Check if Supabase is configured
    const supabaseConfigured = !!supabaseAdmin
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseAdmin) {
      return NextResponse.json({
        error: 'Supabase not configured',
        details: {
          supabaseUrl: supabaseUrl ? 'Set' : 'Missing',
          serviceRoleKey: hasServiceKey ? 'Set' : 'Missing',
        }
      }, { status: 500 })
    }

    // Try to query users table
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, email, created_at')
      .limit(10)

    if (error) {
      return NextResponse.json({
        error: 'Database query failed',
        details: error.message,
        supabaseConfigured,
        supabaseUrl: supabaseUrl ? 'Set' : 'Missing',
        serviceRoleKey: hasServiceKey ? 'Set' : 'Missing',
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      supabaseConfigured,
      supabaseUrl: supabaseUrl ? 'Set' : 'Missing',
      serviceRoleKey: hasServiceKey ? 'Set' : 'Missing',
      usersCount: users?.length || 0,
      users: users?.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })) || [],
    })
  } catch (error: any) {
    return NextResponse.json({
      error: 'Debug check failed',
      details: error.message,
    }, { status: 500 })
  }
}


