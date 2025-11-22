import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Only fetch email and phone from Supabase database - no other sources

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

    // Fetch listings from Supabase - Optimized query
    // Only select necessary columns for faster loading
    let { data: listings, error } = await supabase
      .from('listings')
      .select('id, address, price, beds, baths, square_feet, listing_link, time_of_post, owner_emails, owner_phones, owner_name, mailing_address')
      .order('id', { ascending: true })
      .limit(1000) // Add limit for performance

    // Handle errors gracefully
    if (error) {
      console.warn('Supabase query error:', error.message)
      if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return NextResponse.json({
          scrape_timestamp: new Date().toISOString(),
          total_listings: 0,
          listings: []
        })
      }
      return NextResponse.json({
        scrape_timestamp: new Date().toISOString(),
        total_listings: 0,
        listings: []
      })
    }

    // Get latest scrape metadata (use maybeSingle() to handle empty results)
    const { data: metadata, error: metadataError } = await supabase
      .from('scrape_metadata')
      .select('*')
      .order('scrape_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Log metadata error but don't fail the request
    if (metadataError) {
      console.warn('Could not fetch scrape metadata:', metadataError.message)
    }

    // Enrich listings with email/phone data from Supabase only
    const enrichedListings = (listings || []).map((listing: any) => {
      const address = listing.address || listing.Property_Address || ''
      
      // Parse owner_emails from Supabase (handle JSONB format)
      let emails: string[] = []
      let phones: string[] = []
      
      if (listing.owner_emails !== null && listing.owner_emails !== undefined) {
        try {
          if (typeof listing.owner_emails === 'string') {
            emails = JSON.parse(listing.owner_emails)
          } else if (Array.isArray(listing.owner_emails)) {
            emails = listing.owner_emails
          }
        } catch (e) {
          console.warn(`⚠️ Failed to parse owner_emails for "${address}":`, e)
        }
      }
      
      // Parse owner_phones from Supabase (handle JSONB format)
      if (listing.owner_phones !== null && listing.owner_phones !== undefined) {
        try {
          if (typeof listing.owner_phones === 'string') {
            phones = JSON.parse(listing.owner_phones)
          } else if (Array.isArray(listing.owner_phones)) {
            phones = listing.owner_phones
          }
        } catch (e) {
          console.warn(`⚠️ Failed to parse owner_phones for "${address}":`, e)
        }
      }
      
      // Return listing with email/phone from Supabase (or empty arrays if not found)
      // Also ensure owner_name and mailing_address are properly passed through
      return {
        ...listing,
        owner_emails: emails,
        owner_phones: phones,
        owner_name: listing.owner_name || null,
        mailing_address: listing.mailing_address || null
      }
    })

    // Prevent caching - always return fresh data
    return NextResponse.json({
      scrape_timestamp: metadata?.scrape_timestamp || new Date().toISOString(),
      total_listings: enrichedListings.length,
      listings: enrichedListings
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      }
    })
  } catch (error: any) {
    console.error('Error reading listings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch listings',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

