import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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

        if (error) {
          console.error('❌ Supabase query error:', JSON.stringify(error, null, 2))
          console.error('Error details:', error.message, error.details, error.hint)
          // Continue to return empty result
        } else if (listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Apartments listings in Supabase`)

          // Get all address_hashes for batch lookup
          const addressHashes = listings.map((l: any) => l.address_hash).filter(Boolean)

          // Fetch enrichment states for these hashes
          let enrichmentStates: Record<string, any> = {}
          if (addressHashes.length > 0) {
            const { data: stateData } = await dbClient
              .from('property_owner_enrichment_state')
              .select('address_hash, status, locked')
              .in('address_hash', addressHashes)

            if (stateData) {
              enrichmentStates = stateData.reduce((acc: any, item: any) => {
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

            // Map CSV columns to frontend format
            const address = listing.full_address || listing.title || 'Address Not Available'

            // Parse owner_email - handle JSONB array or string format
            let emails: string[] = []
            if (listing.owner_email) {
              if (Array.isArray(listing.owner_email)) {
                emails = listing.owner_email
              } else if (typeof listing.owner_email === 'string' && listing.owner_email.trim()) {
                try {
                  emails = JSON.parse(listing.owner_email)
                } catch (e) {
                  emails = listing.owner_email.split(/[,\n]/).map((e: string) => e.trim()).filter((e: string) => e && e.includes('@'))
                }
              }
            }

            // Parse phone_numbers - handle JSONB array, comma-separated string, or single string
            let phones: string[] = []
            if (listing.phone_numbers) {
              if (Array.isArray(listing.phone_numbers)) {
                phones = listing.phone_numbers
              } else if (typeof listing.phone_numbers === 'string' && listing.phone_numbers.trim()) {
                try {
                  phones = JSON.parse(listing.phone_numbers)
                } catch (e) {
                  phones = listing.phone_numbers.split(/[,\n]/).map((p: string) => p.trim()).filter((p: string) => p && /[\d-]/.test(p))
                }
              }
            }

            // Get enrichment state using address_hash
            const state = listing.address_hash ? enrichmentStates[listing.address_hash] : null

            return {
              id: listing.id,
              address: address,
              price: convertToString(listing.price),
              beds: convertToString(listing.beds),
              baths: convertToString(listing.baths || listing.bath),
              square_feet: convertToString(listing.sqft),
              listing_link: listing.listing_url || listing.listing_link || '',
              property_type: 'Apartment',
              description: listing.description || null,
              neighborhood: listing.neighborhood || null,
              city: listing.city || null,
              state: listing.state || null,
              zip_code: listing.zip_code || null,
              street: listing.street || null,
              owner_name: listing.owner_name || null,
              owner_email: listing.owner_email || null,
              phone_numbers: listing.phone_numbers || null,
              emails: emails.length > 0 ? emails : null,
              phones: phones.length > 0 ? phones : null,
              enrichment_status: state?.status || 'never_checked',
              enrichment_locked: state?.locked || false,
              address_hash: listing.address_hash || null,
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
          console.warn('⚠️ No Apartments listings found in Supabase (table is empty or query returned no results)')
          if (listings && listings.length === 0) {
            console.warn('   Query succeeded but returned 0 listings')
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

