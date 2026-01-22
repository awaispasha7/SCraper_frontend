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

    // Fetch listings from Supabase with pagination to get ALL listings
    console.log('📥 Fetching all listings from Supabase...')
    
    // Fetch all listings using pagination (Supabase default limit is 1000, so we need to paginate)
    let allListings: any[] = []
    let page = 0
    const pageSize = 1000 // Supabase max per request
    let hasMore = true
    let queryError = null
    
    while (hasMore) {
      const from = page * pageSize
      const to = from + pageSize - 1
      
      const { data: pageListings, error: pageError } = await dbClient
        .from('listings')
        .select('id, address, price, beds, baths, square_feet, listing_link, time_of_post, owner_emails, owner_phones, owner_name, mailing_address, address_hash')
        .order('id', { ascending: true })
        .range(from, to)
      
      if (pageError) {
        console.error(`❌ Error fetching page ${page}:`, pageError)
        queryError = pageError
        break
      }
      
      if (pageListings && pageListings.length > 0) {
        allListings = allListings.concat(pageListings)
        console.log(`📄 Fetched page ${page + 1}: ${pageListings.length} listings (total: ${allListings.length})`)
        
        // If we got fewer than pageSize, we've reached the end
        if (pageListings.length < pageSize) {
          hasMore = false
        } else {
          page++
          // Safety limit: don't fetch more than 10,000 listings (10 pages)
          if (page >= 10) {
            console.warn('⚠️ Reached safety limit of 10,000 listings. If you have more, increase the limit.')
            hasMore = false
          }
        }
      } else {
        hasMore = false
      }
    }
    
    const listings = allListings
    const error = queryError

    // Handle errors gracefully
    if (error) {
      console.warn('Supabase query error:', error.message)
      return NextResponse.json({
        scrape_timestamp: new Date().toISOString(),
        total_listings: 0,
        listings: []
      })
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({
        scrape_timestamp: new Date().toISOString(),
        total_listings: 0,
        listings: []
      })
    }
    
    console.log(`✅ Found ${listings.length} total listings in Supabase`)

    // Get all address_hashes for batch lookup
    const addressHashes = listings.map((l: any) => l.address_hash).filter(Boolean)

    // Fetch enrichment states and owner details in parallel
    let enrichmentStates: Record<string, any> = {}
    let ownerDetails: Record<string, any> = {}

    if (addressHashes.length > 0) {
      const [stateRes, ownerRes] = await Promise.all([
        dbClient.from('property_owner_enrichment_state').select('address_hash, status, locked').in('address_hash', addressHashes),
        dbClient.from('property_owners').select('address_hash, owner_name, owner_email, owner_phone, mailing_address, source').in('address_hash', addressHashes)
      ])

      if (stateRes.data) {
        enrichmentStates = stateRes.data.reduce((acc: any, item: any) => {
          acc[item.address_hash] = item
          return acc
        }, {})
      }

      if (ownerRes.data) {
        ownerDetails = ownerRes.data.reduce((acc: any, item: any) => {
          acc[item.address_hash] = item
          return acc
        }, {})
      }
    }

    // Transform and Merge data
    const enrichedListings = listings.map((listing: any) => {
      const state = listing.address_hash ? enrichmentStates[listing.address_hash] : null
      const owner = listing.address_hash ? ownerDetails[listing.address_hash] : null

      // Parse owner_emails from Supabase (handle JSONB format)
      let emails: string[] = []
      if (listing.owner_emails) {
        if (Array.isArray(listing.owner_emails)) {
          emails = listing.owner_emails
        } else if (typeof listing.owner_emails === 'string' && listing.owner_emails.trim()) {
          try { emails = JSON.parse(listing.owner_emails) } catch { emails = [listing.owner_emails] }
        }
      }

      // Parse owner_phones
      let phones: string[] = []
      if (listing.owner_phones) {
        if (Array.isArray(listing.owner_phones)) {
          phones = listing.owner_phones
        } else if (typeof listing.owner_phones === 'string' && listing.owner_phones.trim()) {
          try { phones = JSON.parse(listing.owner_phones) } catch { phones = [listing.owner_phones] }
        }
      }

      // Merge enriched data
      if (owner?.owner_email && !emails.includes(owner.owner_email)) emails.push(owner.owner_email)
      if (owner?.owner_phone && !phones.includes(owner.owner_phone)) phones.push(owner.owner_phone)

      return {
        ...listing,
        price: listing.price !== null && listing.price !== undefined ? String(listing.price) : listing.price,
        beds: listing.beds !== null && listing.beds !== undefined ? String(listing.beds) : listing.beds,
        baths: listing.baths !== null && listing.baths !== undefined ? String(listing.baths) : listing.baths,
        square_feet: listing.square_feet !== null && listing.square_feet !== undefined ? String(listing.square_feet) : listing.square_feet,
        owner_emails: emails,
        owner_phones: phones,
        owner_name: owner?.owner_name || listing.owner_name || null,
        mailing_address: owner?.mailing_address || listing.mailing_address || null,
        enrichment_status: state?.status || 'never_checked',
        enrichment_locked: state?.locked || false,
        enrichment_source: owner?.source || null
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

