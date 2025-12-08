import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

// API route to serve Hotpads listings from Supabase
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Hotpads listings from Supabase
        console.log('📥 Fetching Hotpads listings from Supabase...')
        const { data: listings, error } = await dbClient
          .from('hotpads_listings')
          .select('*')
          .order('id', { ascending: true })

        if (!error && listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Hotpads listings in Supabase`)

          // Transform Supabase data to match frontend format
          const transformedListings = listings.map((listing: any) => {
            const convertToString = (val: any): string => {
              return val !== null && val !== undefined ? String(val) : ''
            }
            
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
              contact_name: listing.contact_name || null,
              listing_date: listing.listing_date || null,
              email: listing.email || null,
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

