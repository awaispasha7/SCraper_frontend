import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

// API route to serve Zillow FRBO listings from Supabase
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Zillow FRBO listings from Supabase
        console.log('📥 Fetching Zillow FRBO listings from Supabase...')
        const { data: listings, error } = await dbClient
          .from('zillow_frbo_listings')
          .select('*')
          // Removed strict filter to allow all scraped data to show
          // .or('address.ilike.%, IL%,address.ilike.% Illinois%,address.ilike.%Chicago%')
          .order('id', { ascending: true })

        if (!error && listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Zillow FRBO listings in Supabase`)

          // Transform Supabase data to match frontend format
          const transformedListings = listings.map((listing: any) => {
            const convertToString = (val: any): string => {
              return val !== null && val !== undefined ? String(val) : ''
            }

            // Parse "2 Beds 1 Baths" format into separate fields
            const bedMatch = listing.beds_baths?.match(/(\d+)\s*Bed/i)
            const bathMatch = listing.beds_baths?.match(/(\d+\.?\d*)\s*Bath/i)

            return {
              id: listing.id,
              address: listing.address || 'Address Not Available',
              price: convertToString(listing.asking_price),
              beds: bedMatch ? bedMatch[1] : '',
              baths: bathMatch ? bathMatch[1] : '',
              square_feet: '', // Not available in FRBO
              listing_link: listing.url || '',
              property_type: 'Rental',
              year_built: listing.year_built || null,
              phone_number: listing.phone_number || null,
              owner_name: listing?.owner_name || null,
              mailing_address: listing?.mailing_address || null,
              emails: listing?.emails || null,
              phones: listing?.phones || null,
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
            console.warn('⚠️ No Zillow FRBO listings found in Supabase (table is empty)')
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
    console.error('Error reading Zillow FRBO listings:', error)
    return NextResponse.json(
      {
        error: 'Failed to read Zillow FRBO listings',
        details: error.message,
        total_listings: 0,
        listings: []
      },
      { status: 500 }
    )
  }
}

