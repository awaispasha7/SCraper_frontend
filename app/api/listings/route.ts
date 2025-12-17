import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Only fetch email and phone from Supabase database - no other sources

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

    // Fetch listings from Supabase - Optimized query
    // Only select necessary columns for faster loading
    // Fetch ALL listings (133 total) - don't filter to show all available listings
    let { data: listings, error } = await dbClient
      .from('listings')
      .select('id, address, price, beds, baths, square_feet, listing_link, time_of_post, owner_emails, owner_phones, owner_name, mailing_address')
      .order('id', { ascending: true })

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

    // Enrich listings with email/phone data from Supabase only
    // Optimize parsing - only parse if needed
    const enrichedListings = (listings || []).map((listing: any) => {
      // Parse owner_emails from Supabase (handle JSONB format) - optimized
      let emails: string[] = []
      if (listing.owner_emails) {
        if (Array.isArray(listing.owner_emails)) {
          emails = listing.owner_emails
        } else if (typeof listing.owner_emails === 'string' && listing.owner_emails.trim()) {
          try {
            emails = JSON.parse(listing.owner_emails)
          } catch (e) {
            // If not valid JSON, treat as single email
            emails = [listing.owner_emails]
          }
        }
      }

      // Parse owner_phones from Supabase (handle JSONB format) - optimized
      let phones: string[] = []
      if (listing.owner_phones) {
        if (Array.isArray(listing.owner_phones)) {
          phones = listing.owner_phones
        } else if (typeof listing.owner_phones === 'string' && listing.owner_phones.trim()) {
          try {
            phones = JSON.parse(listing.owner_phones)
          } catch (e) {
            // If not valid JSON, treat as single phone
            phones = [listing.owner_phones]
          }
        }
      }

      // Return listing with email/phone from Supabase (or empty arrays if not found)
      // Also ensure owner_name and mailing_address are properly passed through
      // Ensure all numeric fields are properly converted to strings for display
      return {
        ...listing,
        price: listing.price !== null && listing.price !== undefined ? String(listing.price) : listing.price,
        beds: listing.beds !== null && listing.beds !== undefined ? String(listing.beds) : listing.beds,
        baths: listing.baths !== null && listing.baths !== undefined ? String(listing.baths) : listing.baths,
        square_feet: listing.square_feet !== null && listing.square_feet !== undefined ? String(listing.square_feet) : listing.square_feet,
        owner_emails: emails,
        owner_phones: phones,
        owner_name: listing.owner_name || null,
        mailing_address: listing.mailing_address || null
      }
    })

    // Prevent caching - always return fresh data
    return NextResponse.json({
      scrape_timestamp: new Date().toISOString(),
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

