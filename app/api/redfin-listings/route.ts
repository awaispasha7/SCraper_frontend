import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// API route to serve Redfin listings from Supabase (with CSV/JSON fallback)
export async function GET() {
  try {
    // Try Supabase first
    const dbClient = supabaseAdmin || supabase

    if (dbClient) {
      try {
        // Fetch Redfin listings from Supabase
        console.log('📥 Fetching Redfin listings from Supabase...')
        const { data: listings, error } = await dbClient
          .from('redfin_listings')
          .select('id, address, price, beds, baths, square_feet, listing_link, property_type, county, lot_acres, owner_name, mailing_address, emails, phones, scrape_date')
          .order('id', { ascending: true })

        if (!error && listings && listings.length > 0) {
          console.log(`✅ Found ${listings.length} Redfin listings in Supabase`)

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
              county: listing.county || 'DuPage County',
              lot_acres: convertToString(listing.lot_acres),
              owner_name: listing.owner_name || null,
              mailing_address: listing.mailing_address || null,
              emails: listing.emails || null,
              phones: listing.phones || null,
              source: 'Redfin',
              scrape_date: listing.scrape_date || '2025-11-20'
            }
          })

          return NextResponse.json(
            {
              total_listings: transformedListings.length,
              scrape_date: '2025-11-20',
              source: 'Redfin',
              listings: transformedListings
            },
            {
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              }
            }
          )
        } else {
          console.warn('⚠️ No Redfin listings found in Supabase, falling back to CSV file')
        }
      } catch (supabaseError: any) {
        console.warn('⚠️ Supabase error, falling back to CSV file:', supabaseError.message)
      }
    } else {
      console.warn('⚠️ Supabase client not initialized, falling back to CSV file')
    }

    // Fallback to CSV/JSON file
    console.log('📥 Fetching Redfin listings from CSV/JSON file...')
    const possiblePaths = [
      // Enriched CSV (priority)
      path.join(process.cwd(), 'redfin_listings_enriched.csv'),
      path.join(process.cwd(), '..', '..', 'redfin_listings_enriched.csv'),
      // Regular CSV
      path.join(process.cwd(), 'redfin_listings.csv'),
      path.join(process.cwd(), 'redfin_dupage_fsbo_8_listings.json'),
      path.join(process.cwd(), 'redfin_dupage_fsbo_8_listings.csv'),
      // From frontend/app/api/redfin-listings to root
      path.join(process.cwd(), '..', '..', 'redfin_listings.csv'),
      path.join(process.cwd(), '..', '..', '..', '..', '..', 'redfin_dupage_fsbo_8_listings.json'),
      path.join(process.cwd(), '..', '..', '..', '..', '..', 'redfin_dupage_fsbo_8_listings.csv'),
      // From frontend to root
      path.join(process.cwd(), '..', '..', 'redfin_dupage_fsbo_8_listings.json'),
      path.join(process.cwd(), '..', '..', 'redfin_dupage_fsbo_8_listings.csv'),
      // Absolute path
      'C:\\Users\\Admin\\Desktop\\Test Trestle\\redfin_dupage_fsbo_8_listings.json',
      'C:\\Users\\Admin\\Desktop\\Test Trestle\\redfin_dupage_fsbo_8_listings.csv',
    ]

    let jsonData = null
    let filePath = null

    // Try to find and read the file
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
          console.log(`✅ Found Redfin data file at: ${filePath}`)
          break
        }
      } catch (error) {
        continue
      }
    }

    if (!jsonData) {
      console.error('❌ Redfin data file not found. Searched paths:', possiblePaths)
      return NextResponse.json(
        {
          error: 'Redfin listings file not found',
          details: 'Please ensure the redfin_dupage_fsbo_8_listings.json or .csv file is accessible',
          searchedPaths: possiblePaths.map(p => p.replace(process.cwd(), '[cwd]'))
        },
        { status: 404 }
      )
    }

    // Transform Redfin data to match frontend format
    const listings = Array.isArray(jsonData) ? jsonData : (jsonData.listings || [])

    const transformedListings = listings.map((listing: any, index: number) => {
      // Build full address from components
      const addressParts = [
        listing.address || listing.Address || '',
        listing.city || listing.City || '',
        listing.state || listing.State || 'IL',
        listing.zip || listing.Zip || listing.ZIP || ''
      ].filter(Boolean)

      const fullAddress = addressParts.join(', ')

      // Extract price (handle both number and string)
      let price = listing.price_usd || listing.price || listing.Price || listing.priceUSD || ''
      if (typeof price === 'number') {
        price = price.toString()
      }

      // Extract beds
      const beds = listing.beds || listing.Beds || listing.bedrooms || listing.Bedrooms || ''
      const bedsStr = beds !== null && beds !== undefined ? String(beds) : ''

      // Extract baths
      const baths = listing.baths || listing.Baths || listing.bathrooms || listing.Bathrooms || ''
      const bathsStr = baths !== null && baths !== undefined ? String(baths) : ''

      // Extract square feet
      const sqft = listing.sqft || listing.Sqft || listing.square_feet || listing.Square_Feet || listing.squareFeet || ''
      const sqftStr = sqft !== null && sqft !== undefined ? String(sqft) : ''

      // Extract listing link
      const listingLink = listing.listing_url || listing.listingUrl || listing.listing_link || listing.url || listing.URL || ''

      // Extract property type
      const propertyType = listing.property_type || listing.Property_Type || listing.propertyType || listing.type || ''

      return {
        id: index + 1,
        address: fullAddress || listing.address || `Listing ${index + 1}`,
        price: price,
        beds: bedsStr,
        baths: bathsStr,
        square_feet: sqftStr,
        listing_link: listingLink || listing.listing_link || '',
        property_type: propertyType,
        county: listing.county || listing.County || 'DuPage County',
        lot_acres: listing.lot_acres || listing.lotAcres || '',
        owner_name: listing.owner_name ? String(listing.owner_name) : null,
        mailing_address: listing.mailing_address ? String(listing.mailing_address) : null,
        emails: listing.emails ? String(listing.emails) : null,
        phones: listing.phones ? String(listing.phones) : null,
        source: 'Redfin',
        scrape_date: listing.scrape_date ? String(listing.scrape_date) : '2025-11-20'
      }
    })

    return NextResponse.json(
      {
        total_listings: transformedListings.length,
        scrape_date: '2025-11-20',
        source: 'Redfin',
        listings: transformedListings
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        }
      }
    )
  } catch (error: any) {
    console.error('Error reading Redfin listings:', error)
    return NextResponse.json(
      {
        error: 'Failed to read Redfin listings',
        details: error.message
      },
      { status: 500 }
    )
  }
}

// Helper function to parse CSV - handles multi-line quoted values
function parseCSV(csvContent: string): any[] {
  // First pass: Split by lines but preserve quoted multi-line values
  const lines: string[] = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i]
    const nextChar = csvContent[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentLine += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
        currentLine += char
      }
    } else if (char === '\n' && !inQuotes) {
      // End of line (not in quotes)
      if (currentLine.trim()) {
        lines.push(currentLine)
      }
      currentLine = ''
    } else {
      currentLine += char
    }
  }

  // Add last line if exists
  if (currentLine.trim()) {
    lines.push(currentLine)
  }

  if (lines.length < 2) return []

  // Parse header
  const headers: string[] = []
  let currentHeader = ''
  inQuotes = false

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
      const nextChar = lines[i][j + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentValue += '"'
          j++ // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
        currentValue = ''
      } else {
        currentValue += char
      }
    }
    values.push(currentValue.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))

    // Validate that we have the correct number of columns
    if (values.length !== headers.length) {
      console.warn(`⚠️  Row ${i + 1} has ${values.length} values but expected ${headers.length} columns`)
      // Pad with empty values if needed
      while (values.length < headers.length) {
        values.push('')
      }
    }

    // Create object from headers and values
    const row: any = {}
    headers.forEach((header, index) => {
      const value = values[index] || ''
      // Try to parse numbers
      if (header.includes('price') || header.includes('beds') || header.includes('baths') || header.includes('sqft') || header.includes('acres')) {
        const numValue = parseFloat(value)
        row[header] = isNaN(numValue) ? value : numValue
      } else {
        row[header] = value
      }
    })
    data.push(row)
  }

  console.log(`✅ Parsed ${data.length} listings from CSV`)
  return data
}

