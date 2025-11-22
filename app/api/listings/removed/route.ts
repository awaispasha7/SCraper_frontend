import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Check if Supabase client is initialized
    if (!supabase) {
      return NextResponse.json(
        { 
          error: 'Database not configured',
          details: 'Supabase client not initialized. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env'
        },
        { status: 500 }
      )
    }

    // Fetch removed listings from Supabase
    const { data: listings, error } = await supabase
      .from('listings')
      .select('*')
      .eq('is_active', false)
      .eq('is_chicago', true)
      .order('removed_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch removed listings: ${error.message}`)
    }

    return NextResponse.json({
      total_removed: listings?.length || 0,
      listings: listings || []
    })
  } catch (error: any) {
    console.error('Error reading removed listings:', error)
    return NextResponse.json(
      { error: 'Failed to read removed listings', details: error.message },
      { status: 500 }
    )
  }
}

