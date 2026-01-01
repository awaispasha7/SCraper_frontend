import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// API route to serve Zillow FSBO listings from Supabase
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Zillow FSBO listings from Supabase
        console.log('📥 Fetching Zillow FSBO listings from Supabase...')
        const { data: listings, error } = await dbClient
          .from('zillow_fsbo_listings')
          .select('*')
          .order('id', { ascending: true })

        if (!error && listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Zillow FSBO listings in Supabase`)

          // Get all address_hashes for batch lookup
          const addressHashes = listings.map((l: any) => l.address_hash).filter(Boolean)

          // Fetch enrichment states AND owner details for these hashes
          let enrichmentStates: Record<string, any> = {}
          let ownerDetails: Record<string, any> = {}

          if (addressHashes.length > 0) {
            const [stateRes, ownerRes] = await Promise.all([
              dbClient
                .from('property_owner_enrichment_state')
                .select('address_hash, status, locked')
                .in('address_hash', addressHashes),
              dbClient
                .from('property_owners')
                .select('address_hash, owner_name, owner_email, owner_phone, mailing_address, source')
                .in('address_hash', addressHashes)
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
              square_feet: '', // Not available in FSBO
              listing_link: listing.detail_url || '',
              property_type: listing.home_type || '',
              year_build: listing.year_build || null,
              hoa: listing.hoa || null,
              days_on_zillow: listing.days_on_zillow || null,
              page_view_count: listing.page_view_count || null,
              favorite_count: listing.favorite_count || null,
              phone_number: owner?.owner_phone || listing.phone_numbers || listing.phone_number || null,
              owner_name: owner?.owner_name || listing.owner_name || null,
              owner_email: owner?.owner_email || null,
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
            console.warn('⚠️ No Zillow FSBO listings found in Supabase (table is empty)')
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
    console.error('Error reading Zillow FSBO listings:', error)
    return NextResponse.json(
      {
        error: 'Failed to read Zillow FSBO listings',
        details: error.message,
        total_listings: 0,
        listings: []
      },
      { status: 500 }
    )
  }
}

