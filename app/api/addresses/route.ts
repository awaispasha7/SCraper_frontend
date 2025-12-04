import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

// API route to serve addresses from Supabase
export async function GET() {
  try {
    // Use admin client if available for faster queries
    const dbClient = supabaseAdmin || supabase
    
    // Check if Supabase client is initialized
    if (!dbClient) {
      return NextResponse.json(
        { 
          error: 'Database not configured',
          details: 'Supabase client not initialized. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env'
        },
        { status: 500 }
      )
    }

    // Fetch addresses from Supabase
    console.log('📥 Fetching addresses from Supabase...')
    let { data: addresses, error } = await dbClient
      .from('addresses')
      .select('id, address, city, state, zip, owner_name, mailing_address, emails, phones, created_at, updated_at')
      .order('id', { ascending: true })

    // Handle errors gracefully
    if (error) {
      console.warn('Supabase query error:', error.message)
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return NextResponse.json({
          total_addresses: 0,
          addresses: [],
          error: 'Addresses table does not exist. Please run create_addresses_table.sql in Supabase SQL Editor first.'
        })
      }
      return NextResponse.json({
        total_addresses: 0,
        addresses: [],
        error: error.message
      })
    }

    // Format addresses for frontend
    const formattedAddresses = (addresses || []).map((addr: any) => ({
      id: addr.id,
      address: addr.address || '',
      city: addr.city || '',
      state: addr.state || '',
      zip: addr.zip || '',
      ownerName: addr.owner_name || null,
      mailingAddress: addr.mailing_address || null,
      emails: addr.emails || null,
      phones: addr.phones || null,
      createdAt: addr.created_at,
      updatedAt: addr.updated_at
    }))

    console.log(`✅ Found ${formattedAddresses.length} addresses in Supabase`)

    // Prevent caching - always return fresh data
    return NextResponse.json({
      total_addresses: formattedAddresses.length,
      addresses: formattedAddresses
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      }
    })
  } catch (error: any) {
    console.error('Error fetching addresses:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch addresses',
        details: error.message 
      },
      { status: 500 }
    )
  }
}



