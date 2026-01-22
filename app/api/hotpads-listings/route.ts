import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// API route to serve Hotpads listings from Supabase
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Hotpads listings from Supabase
        console.log('📥 Fetching Hotpads listings from Supabase...')
        
        // Fetch all listings using pagination (Supabase default limit is 1000, so we need to paginate)
        let allListings: any[] = []
        let page = 0
        const pageSize = 1000 // Supabase max per request
        let hasMore = true
        let queryError: any = null
        
        while (hasMore) {
          const from = page * pageSize
          const to = from + pageSize - 1
          
          const { data: pageListings, error: pageError } = await dbClient
            .from('hotpads_listings')
            .select('*')
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

        if (listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} total Hotpads listings in Supabase`)

          // Get unique address_hashes for batch lookup (de-duplicated to reduce parameters)
          const uniqueHashes = Array.from(new Set(listings.map((l: any) => l.address_hash).filter(Boolean))) as string[]

          // Fetch enrichment states AND owner details for these hashes
          let enrichmentStates: Record<string, any> = {}
          let ownerDetails: Record<string, any> = {}

          if (uniqueHashes.length > 0) {
            // Function to fetch in chunks to avoid Supabase URL/parameter limits
            const CHUNK_SIZE = 200
            const stateResults: any[] = []
            const ownerResults: any[] = []

            for (let i = 0; i < uniqueHashes.length; i += CHUNK_SIZE) {
              const chunk = uniqueHashes.slice(i, i + CHUNK_SIZE)
              const [stateRes, ownerRes] = await Promise.all([
                dbClient
                  .from('property_owner_enrichment_state')
                  .select('address_hash, status, locked')
                  .in('address_hash', chunk),
                dbClient
                  .from('property_owners')
                  .select('address_hash, owner_name, owner_email, owner_phone, mailing_address, source')
                  .in('address_hash', chunk)
              ])

              if (stateRes.data) stateResults.push(...stateRes.data)
              if (ownerRes.data) ownerResults.push(...ownerRes.data)

              if (stateRes.error) console.error(`❌ Error fetching state chunk [${i}]:`, stateRes.error)
              if (ownerRes.error) console.error(`❌ Error fetching owner chunk [${i}]:`, ownerRes.error)
            }

            // Map results to records for easy lookup
            enrichmentStates = stateResults.reduce((acc: any, item: any) => {
              acc[item.address_hash] = item
              return acc
            }, {})

            ownerDetails = ownerResults.reduce((acc: any, item: any) => {
              acc[item.address_hash] = item
              return acc
            }, {})
          }

          // Transform Supabase data to match frontend format
          const transformedListings = listings.map((listing: any) => {
            const convertToString = (val: any): string => {
              return val !== null && val !== undefined ? String(val) : ''
            }

            // Get enrichment state and owner data using address_hash
            const state = listing.address_hash ? enrichmentStates[listing.address_hash] : null
            const owner = listing.address_hash ? ownerDetails[listing.address_hash] : null

            // Smart status determination: if owner data exists, status is "enriched"
            const hasOwnerData = owner?.owner_name || owner?.owner_email || owner?.owner_phone
            const enrichmentStatus = hasOwnerData ? 'enriched' : (state?.status || 'never_checked')

            return {
              id: listing.id,
              address: listing.address || 'Address Not Available',
              price: convertToString(listing.price),
              beds: convertToString(listing.bedrooms),
              baths: convertToString(listing.bathrooms),
              square_feet: convertToString(listing.square_feet),
              listing_link: listing.url || '',
              property_type: listing.property_type || 'Rental',
              property_name: listing.property_name || null,
              contact_name: owner?.owner_name || listing.contact_name || null,
              listing_date: listing.listing_date || null,
              email: owner?.owner_email || listing.email || null,
              phone_number: owner?.owner_phone || listing.phone_number || null,
              owner_name: owner?.owner_name || listing.owner_name || null,
              mailing_address: owner?.mailing_address || listing.mailing_address || null,
              enrichment_status: enrichmentStatus,
              enrichment_locked: state?.locked || false,
              enrichment_source: owner?.source || null,
              address_hash: listing.address_hash || null,
              created_at: listing.created_at || null
            }
          })

          return NextResponse.json(
            {
              total_listings: transformedListings.length,
              scrape_date: new Date().toISOString(),
              listings: transformedListings
            },
            {
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              }
            }
          )
        } else {
          if (error) {
            console.error('❌ Supabase query error:', JSON.stringify(error, null, 2))
            console.error('Error details:', error.message, error.details, error.hint)
          } else {
            console.warn('⚠️ No Hotpads listings found in Supabase (table is empty)')
          }
        }
      } catch (supabaseError: any) {
        console.error('❌ Supabase error:', JSON.stringify(supabaseError, null, 2))
        console.error('Error message:', supabaseError.message)
      }
    } else {
      console.warn('⚠️ Supabase client not initialized')
    }

    // Return empty result if no data found
    return NextResponse.json(
      {
        total_listings: 0,
        scrape_date: new Date().toISOString(),
        listings: []
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      }
    )
  } catch (error: any) {
    console.error('Error reading Hotpads listings:', error)
    return NextResponse.json(
      {
        error: 'Failed to read Hotpads listings',
        details: error.message,
        total_listings: 0,
        listings: []
      },
      { status: 500 }
    )
  }
}

