import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// API route to serve Trulia listings from Supabase (with JSON fallback)
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Trulia listings from Supabase - Optimized query
        console.log('📥 Fetching Trulia listings from Supabase...')
        const { data: listings, error } = await dbClient
          .from('trulia_listings')
          .select('id, address, price, beds, baths, square_feet, listing_link, property_type, lot_size, description, owner_name, mailing_address, emails, phones')
          .order('id', { ascending: true })

        if (!error && listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Trulia listings in Supabase`)

          // Transform Supabase data to match frontend format - optimized
          const transformedListings = listings.map((listing: any) => {
            // Optimize string conversion - only convert if needed
            const convertToString = (val: any): string => {
              return val !== null && val !== undefined ? String(val) : ''
            }

            return {
              id: listing.id,
              address: listing.address || 'Address Not Available',
              price: convertToString(listing.price),
              beds: convertToString(listing.beds),
              baths: convertToString(listing.baths),
              square_feet: convertToString(listing.square_feet),
              listing_link: listing.listing_link || '',
              property_type: listing.property_type || '',
              lot_size: convertToString(listing.lot_size),
              description: listing.description || '',
              owner_name: listing.owner_name || null,
              mailing_address: listing.mailing_address || null,
              emails: listing.emails || null,  // Include emails from Supabase
              phones: listing.phones || null,   // Include phones from Supabase
              is_active_for_sale: true,
              is_off_market: false,
              is_recently_sold: false,
              is_foreclosure: false
            }
          })

          return NextResponse.json(
            {
              total_listings: transformedListings.length,
              scrape_date: '2025-11-20',
              listings: transformedListings
            },
            {
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              }
            }
          )
        } else {
          console.warn('⚠️ No Trulia listings found in Supabase, falling back to JSON file')
        }
      } catch (supabaseError: any) {
        console.warn('⚠️ Supabase error, falling back to JSON file:', supabaseError.message)
      }
    } else {
      console.warn('⚠️ Supabase client not initialized, falling back to JSON file')
    }

    // Fallback to JSON/CSV file
    console.log('📥 Fetching Trulia listings from JSON/CSV file...')
    const possiblePaths = [
      // Current directory (scraper frontend root)
      path.join(process.cwd(), 'trulia_listings.csv'),
      path.join(process.cwd(), 'dataset_trulia-scraper_2025-11-20_17-37-49-670.json'),
      // From frontend/app/api/trulia-listings to root
      path.join(process.cwd(), '..', '..', 'trulia_listings.csv'),
      path.join(process.cwd(), '..', 'dataset_trulia-scraper_2025-11-20_17-37-49-670.json'),
      // Absolute path
      'C:\\Users\\Admin\\Desktop\\Test Trestle\\dataset_trulia-scraper_2025-11-20_17-37-49-670.json',
    ]

    let jsonData = null
    let filePath = null

    for (const filePathAttempt of possiblePaths) {
      try {
        if (fs.existsSync(filePathAttempt)) {
          const fileContent = fs.readFileSync(filePathAttempt, 'utf-8')

          if (filePathAttempt.endsWith('.csv')) {
            // Parse CSV
            jsonData = parseCSV(fileContent)
          } else {
            // Parse JSON
            jsonData = JSON.parse(fileContent)
          }

          filePath = filePathAttempt
          console.log(`✅ Found Trulia data file at: ${filePath}`)
          break
        }
      } catch (error) {
        continue
      }
    }

    if (!jsonData) {
      console.error('❌ Trulia JSON file not found. Searched paths:', possiblePaths)
      return NextResponse.json(
        {
          error: 'Trulia listings not available',
          details: 'Neither Supabase database nor JSON file found',
          searchedPaths: possiblePaths.map(p => p.replace(process.cwd(), '[cwd]'))
        },
        { status: 404 }
      )
    }

    // Transform JSON data to match frontend format
    const listings = Array.isArray(jsonData) ? jsonData : (jsonData.listings || [])

    const transformedListings = listings.map((listing: any, index: number) => {
      const address = listing['location.homeFormattedAddress'] || listing.address || listing.title?.split('|')[0]?.trim() || 'Address Not Available'
      const cleanAddress = address.replace(/\s*\|\s*Trulia\s*$/i, '').trim()

      return {
        id: index + 1,
        address: cleanAddress,
        price: listing.price || listing.Price || '',
        beds: listing.bedrooms || listing.Bedrooms || listing.beds || '',
        baths: listing.bathrooms || listing.Bathrooms || listing.baths || '',
        square_feet: listing.floorSpace || listing.FloorSpace || listing.square_feet || '',
        listing_link: listing.url || listing.URL || listing.listing_url || listing.listing_link || '',
        property_type: listing.propertyType || listing.PropertyType || listing.property_type || '',
        lot_size: listing.lotSize || listing.LotSize || listing.lot_size || '',
        description: listing.metaDescription || listing.MetaDescription || listing.description || '',
        owner_name: listing.owner_name || null,
        mailing_address: listing.mailing_address || null,
        emails: listing.emails || null,  // Include emails from data
        phones: listing.phones || null,   // Include phones from data
        is_active_for_sale: listing.isActiveForSale || listing.IsActiveForSale || true,
        is_off_market: listing.isOffMarket || listing.IsOffMarket || false,
        is_recently_sold: listing.isRecentlySold || listing.IsRecentlySold || false,
        is_foreclosure: listing.isForeclosure || listing.IsForeclosure || false,
        title: listing.title || listing.Title || ''
      }
    })

    return NextResponse.json(
      {
        total_listings: transformedListings.length,
        scrape_date: '2025-11-20',
        listings: transformedListings
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      }
    )
  } catch (error: any) {
    console.error('Error reading Trulia listings:', error)
    return NextResponse.json(
      {
        error: 'Failed to read Trulia listings',
        details: error.message
      },
      { status: 500 }
    )
  }
}

// Helper function to parse CSV
function parseCSV(csvContent: string): any[] {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  // Parse header
  const headers: string[] = []
  let currentHeader = ''
  let inQuotes = false

  for (let i = 0; i < lines[0].length; i++) {
    const char = lines[0][i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      headers.push(currentHeader.trim().replace(/^"|"$/g, ''))
      currentHeader = ''
    } else {
      currentHeader += char
    }
  }
  headers.push(currentHeader.trim().replace(/^"|"$/g, ''))

  // Parse data rows
  const data: any[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue

    const values: string[] = []
    let currentValue = ''
    inQuotes = false

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
        currentValue = ''
      } else {
        currentValue += char
      }
    }
    values.push(currentValue.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))

    // Create object from headers and values
    const row: any = {}
    headers.forEach((header, index) => {
      const value = values[index] || ''
      // Try to parse numbers
      if (header.includes('price') || header.includes('beds') || header.includes('baths') || header.includes('sqft') || header.includes('acres') || header.includes('square_feet')) {
        const numValue = parseFloat(value)
        row[header] = isNaN(numValue) ? value : numValue
      } else {
        row[header] = value
      }
    })
    data.push(row)
  }

  return data
}

