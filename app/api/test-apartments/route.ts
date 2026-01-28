import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Diagnostic API route to test apartments table access
export async function GET() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    checks: []
  }

  try {
    // Check 1: Environment variables
    diagnostics.checks.push({
      name: 'Environment Variables',
      supabaseUrl: !!process.env.SUPABASE_URL || !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: !!process.env.SUPABASE_ANON_KEY || !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })

    // Check 2: Client initialization
    diagnostics.checks.push({
      name: 'Client Initialization',
      regularClient: !!supabase,
      adminClient: !!supabaseAdmin
    })

    const dbClient = supabaseAdmin || supabase

    if (!dbClient) {
      diagnostics.error = 'No Supabase client available'
      return NextResponse.json(diagnostics)
    }

    // Check 3: Simple count query
    try {
      const { count, error } = await dbClient
        .from('apartments_frbo')
        .select('*', { count: 'exact', head: true })

      diagnostics.checks.push({
        name: 'Table Count',
        success: !error,
        count: count,
        error: error?.message
      })
    } catch (err: any) {
      diagnostics.checks.push({
        name: 'Table Count',
        success: false,
        error: err.message
      })
    }

    // Check 4: Fetch 5 sample records
    try {
      const { data, error } = await dbClient
        .from('apartments_frbo')
        .select('id, listing_url, full_address, address_hash')
        .limit(5)

      diagnostics.checks.push({
        name: 'Sample Records',
        success: !error,
        recordsFound: data?.length || 0,
        sampleIds: data?.map((d: any) => d.id) || [],
        error: error?.message
      })
    } catch (err: any) {
      diagnostics.checks.push({
        name: 'Sample Records',
        success: false,
        error: err.message
      })
    }

    return NextResponse.json(diagnostics)
  } catch (error: any) {
    diagnostics.error = error.message
    return NextResponse.json(diagnostics, { status: 500 })
  }
}
