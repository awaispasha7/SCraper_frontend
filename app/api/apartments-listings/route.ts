import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

// API route to serve Apartments listings from Supabase
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Apartments listings from Supabase
        console.log('📥 Fetching Apartments listings from Supabase...')
        const { data: listings, error } = await dbClient
          .from('apartments_frbo_chicago')
          .select('*')
          .order('id', { ascending: true })

        if (!error && listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Apartments listings in Supabase`)

          // Transform Supabase data to match frontend format
          const transformedListings = listings.map((listing: any) => {
            const convertToString = (val: any): string => {
              return val !== null && val !== undefined ? String(val) : ''
            }
            
            // Map CSV columns to frontend format
            // listing_url -> listing_link
            // title or full_address -> address
            // price, beds, baths, sqft -> direct mapping
            // owner_name, owner_email, phone_numbers -> owner_name, emails, phones
            const address = listing.full_address || listing.title || listing.address || 'Address Not Available'
            
            // Handle phone_numbers - could be comma-separated string or array
            let phones = null
            if (listing.phone_numbers) {
              if (Array.isArray(listing.phone_numbers)) {
                phones = listing.phone_numbers.join(', ')
              } else {
                phones = String(listing.phone_numbers)
              }
            }
            
            // Handle owner_email - map to emails field
            let emails = null
            if (listing.owner_email) {
              emails = String(listing.owner_email)
            }
            
            return {
              id: listing.id,
              address: address,
              price: convertToString(listing.price),
              beds: convertToString(listing.beds),
              baths: convertToString(listing.bath || listing.baths), // Handle both 'bath' and 'baths'
              square_feet: convertToString(listing.sqft || listing.square_feet),
              listing_link: listing.listing_url || listing.listing_link || '',
              property_type: 'Apartment',
              description: listing.description || null,
              neighborhood: listing.neighborhood || null,
              city: listing.city || null,
              state: listing.state || null,
              zip_code: listing.zip_code || listing.zip || null,
              street: listing.street || null,
              owner_name: listing.owner_name || null,
              owner_email: listing.owner_email || null,
              phone_numbers: listing.phone_numbers || null,
              emails: emails,
              phones: phones,
              title: listing.title || null,
              full_address: listing.full_address || null,
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
            console.warn('⚠️ No Apartments listings found in Supabase (table is empty)')
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
    console.error('Error reading Apartments listings:', error)
    return NextResponse.json(
      {
        error: 'Failed to read Apartments listings',
        details: error.message,
        total_listings: 0,
        listings: []
      },
      { status: 500 }
    )
  }
}

