/**
 * Script to upload enriched Trulia listings CSV/Excel file to Supabase
 * 
 * This script reads trulia_listings_enriched.csv (preferred) or .xlsx and uploads it to Supabase trulia_listings table
 * 
 * Usage: node scripts/upload-trulia-to-supabase.js
 */

const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  console.error('   Required: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
  console.error('   Please set these in .env.local or .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Configuration - try CSV first, then Excel
const POSSIBLE_CSV_PATHS = [
  path.join(__dirname, '..', 'trulia_listings_enriched.csv'),
  path.join(__dirname, '..', '..', 'trulia_listings_enriched.csv'),
  path.join(process.cwd(), 'trulia_listings_enriched.csv'),
]

const POSSIBLE_EXCEL_PATHS = [
  path.join(__dirname, '..', 'trulia_listings_enriched.xlsx'),
  path.join(__dirname, '..', '..', 'trulia_listings_enriched.xlsx'),
  path.join(process.cwd(), 'trulia_listings_enriched.xlsx'),
]

let INPUT_FILE = null
let FILE_TYPE = null

// Check for CSV first
for (const filePath of POSSIBLE_CSV_PATHS) {
  if (fs.existsSync(filePath)) {
    INPUT_FILE = filePath
    FILE_TYPE = 'csv'
    break
  }
}

// If no CSV, check for Excel
if (!INPUT_FILE) {
  for (const filePath of POSSIBLE_EXCEL_PATHS) {
    if (fs.existsSync(filePath)) {
      INPUT_FILE = filePath
      FILE_TYPE = 'excel'
      break
    }
  }
}

if (!INPUT_FILE) {
  console.error('❌ File not found. Tried:')
  POSSIBLE_CSV_PATHS.forEach(p => console.error(`   - ${p}`))
  POSSIBLE_EXCEL_PATHS.forEach(p => console.error(`   - ${p}`))
  console.error('   Please ensure trulia_listings_enriched.csv or trulia_listings_enriched.xlsx is in the project root')
  process.exit(1)
}

// Parse CSV - improved to handle multi-line values
function parseCSV(csvContent) {
  // Split by lines but preserve quoted multi-line values
  const lines = []
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
  
  if (lines.length < 2) return { headers: [], data: [] }
  
  // Parse header
  const headers = []
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
  const data = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    
    const values = []
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
      // Still add the row but pad with empty values if needed
      while (values.length < headers.length) {
        values.push('')
      }
    }
    
    // Create object from headers and values
    const row = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    data.push(row)
  }
  
  return { headers, data }
}

// Parse Excel file
function parseExcel(filePath) {
  console.log(`📖 Reading Excel file: ${filePath}`)
  
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames[0] // Get first sheet
  const worksheet = workbook.Sheets[sheetName]
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet, { defval: null })
  
  if (data.length === 0) {
    console.warn('⚠️  No data found in Excel file')
    return { headers: [], data: [] }
  }
  
  // Get headers from first row
  const headers = Object.keys(data[0])
  
  console.log(`✅ Found ${data.length} listings`)
  console.log(`📋 Columns: ${headers.join(', ')}`)
  
  return { headers, data }
}

// Upload listings to Supabase
async function uploadToSupabase(listings) {
  console.log('📤 Uploading to Supabase trulia_listings table...')
  console.log('   📧 Including emails and phones from file...')
  console.log('')
  
  const timestamp = new Date().toISOString()
  let successCount = 0
  let errorCount = 0
  let updatedCount = 0
  let insertedCount = 0
  
  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    
    try {
      // Prepare listing data for Supabase - map Excel columns to database columns
      // Handle various possible column name variations
      const listingData = {
        address: listing.address || listing.Address || listing['Property Address'] || null,
        price: listing.price || listing.Price || listing['Listing Price'] ? 
          (typeof (listing.price || listing.Price || listing['Listing Price']) === 'string' ? 
            parseFloat(String(listing.price || listing.Price || listing['Listing Price']).replace(/[^0-9.]/g, '')) : 
            parseFloat(listing.price || listing.Price || listing['Listing Price'])) : null,
        beds: listing.beds || listing.Beds || listing.bedrooms || listing.Bedrooms || listing['Number of Bedrooms'] ? 
          (typeof (listing.beds || listing.Beds || listing.bedrooms || listing.Bedrooms || listing['Number of Bedrooms']) === 'string' ? 
            parseFloat(String(listing.beds || listing.Beds || listing.bedrooms || listing.Bedrooms || listing['Number of Bedrooms']).replace(/[^0-9.]/g, '')) : 
            parseFloat(listing.beds || listing.Beds || listing.bedrooms || listing.Bedrooms || listing['Number of Bedrooms'])) : null,
        baths: listing.baths || listing.Baths || listing.bathrooms || listing.Bathrooms || listing['Number of Bathrooms'] ? 
          (typeof (listing.baths || listing.Baths || listing.bathrooms || listing.Bathrooms || listing['Number of Bathrooms']) === 'string' ? 
            parseFloat(String(listing.baths || listing.Baths || listing.bathrooms || listing.Bathrooms || listing['Number of Bathrooms']).replace(/[^0-9.]/g, '')) : 
            parseFloat(listing.baths || listing.Baths || listing.bathrooms || listing.Bathrooms || listing['Number of Bathrooms'])) : null,
        square_feet: listing.square_feet || listing['Square Feet'] || listing.sqft || listing.Sqft || listing['Square Footage'] ? 
          (typeof (listing.square_feet || listing['Square Feet'] || listing.sqft || listing.Sqft || listing['Square Footage']) === 'string' ? 
            parseFloat(String(listing.square_feet || listing['Square Feet'] || listing.sqft || listing.Sqft || listing['Square Footage']).replace(/[^0-9.]/g, '')) : 
            parseFloat(listing.square_feet || listing['Square Feet'] || listing.sqft || listing.Sqft || listing['Square Footage'])) : null,
        listing_link: listing.listing_link || listing['Listing Link'] || listing.url || listing.URL || listing['Listing URL'] || null,
        property_type: listing.property_type || listing['Property Type'] || listing.PropertyType || null,
        lot_size: listing.lot_size || listing['Lot Size'] || listing.LotSize || null,
        description: listing.description || listing.Description || null,
        owner_name: listing.owner_name || listing['Owner Name'] || listing.OwnerName || null,
        mailing_address: listing.mailing_address || listing['Mailing Address'] || listing.MailingAddress || null,
        emails: listing.emails || listing['Emails'] || listing.email || listing.Email || null,  // Store emails as text
        phones: listing.phones || listing['Phones'] || listing.phone || listing.Phone || null,  // Store phones as text
        scrape_date: listing.scrape_date || listing['Scrape Date'] || listing.scrapeDate || null,
      }
      
      // Remove null/undefined values that are actually null
      Object.keys(listingData).forEach(key => {
        if (listingData[key] === null || listingData[key] === undefined || listingData[key] === '') {
          listingData[key] = null
        }
      })
      
      // Check if listing exists (by listing_link or address)
      let existing = null
      if (listingData.listing_link) {
        const { data, error: fetchError } = await supabase
          .from('trulia_listings')
          .select('id, listing_link')
          .eq('listing_link', listingData.listing_link)
          .maybeSingle()
        
        if (!fetchError && data) {
          existing = data
        }
      }
      
      // If not found by listing_link, try by address
      if (!existing && listingData.address) {
        const { data, error: fetchError } = await supabase
          .from('trulia_listings')
          .select('id, listing_link')
          .eq('address', listingData.address)
          .maybeSingle()
        
        if (!fetchError && data) {
          existing = data
        }
      }
      
      if (existing) {
        // Update existing listing
        let updateData = { ...listingData }
        
        const { error: updateError } = await supabase
          .from('trulia_listings')
          .update(updateData)
          .eq('id', existing.id)
        
        if (updateError) {
          // Check if error is about missing emails/phones columns
          if (updateError.message.includes('emails') || updateError.message.includes('phones')) {
            console.warn(`   ⚠️  Warning: 'emails' or 'phones' columns not found in table. Attempting without them...`)
            const { emails, phones, ...dataWithoutContacts } = updateData
            const { error: retryError } = await supabase
              .from('trulia_listings')
              .update(dataWithoutContacts)
              .eq('id', existing.id)
            
            if (retryError) {
              console.error(`   ❌ Failed to update: ${retryError.message}`)
              throw retryError
            }
            console.warn(`   ⚠️  Updated without emails/phones (columns don't exist in table)`)
          } else {
            throw updateError
          }
        }
        updatedCount++
        successCount++
        console.log(`   ✅ Updated: ${listingData.address?.substring(0, 50) || 'N/A'}...`)
      } else {
        // Insert new listing
        let insertError = null
        const { error: error1 } = await supabase
          .from('trulia_listings')
          .insert(listingData)
        
        if (error1) {
          // If column doesn't exist, try without emails/phones
          if (error1.message.includes('emails') || error1.message.includes('phones')) {
            console.warn(`   ⚠️  Warning: 'emails' or 'phones' columns not found in table. Attempting without them...`)
            const { emails, phones, ...dataWithoutContacts } = listingData
            const { error: error2 } = await supabase
              .from('trulia_listings')
              .insert(dataWithoutContacts)
            
            if (error2) {
              insertError = error2
            } else {
              console.warn(`   ⚠️  Inserted without emails/phones (columns don't exist in table)`)
            }
          } else {
            insertError = error1
          }
        }
        
        if (insertError) {
          // If table doesn't exist, provide helpful error
          if (insertError.message.includes('relation "trulia_listings" does not exist')) {
            console.error(`\n❌ Table 'trulia_listings' does not exist in Supabase`)
            console.error(`   Please create the table first. Expected columns:`)
            console.error(`   - address (text), price (numeric), beds (numeric), baths (numeric)`)
            console.error(`   - square_feet (numeric), listing_link (text)`)
            console.error(`   - property_type (text), lot_size (text), description (text)`)
            console.error(`   - owner_name (text), mailing_address (text), scrape_date (text)`)
            console.error(`   - emails (text), phones (text)  <-- IMPORTANT: Include these for email/phone data`)
            process.exit(1)
          }
          throw insertError
        }
        insertedCount++
        successCount++
        console.log(`   ✅ Inserted: ${listingData.address?.substring(0, 50) || 'N/A'}...`)
      }
      
      // Show progress
      if ((i + 1) % 5 === 0 || i === listings.length - 1) {
        console.log(`   Progress: ${i + 1}/${listings.length} listings processed...`)
      }
    } catch (error) {
      console.error(`   ❌ Error processing listing ${i + 1}:`, error.message)
      console.error(`      Address: ${listing.address || listing.Address || 'N/A'}`)
      errorCount++
    }
  }
  
  console.log(`\n✅ Upload complete!`)
  console.log(`   Total listings in file: ${listings.length}`)
  console.log(`   Successfully uploaded: ${successCount}`)
  console.log(`   - Inserted: ${insertedCount}`)
  console.log(`   - Updated: ${updatedCount}`)
  console.log(`   Errors: ${errorCount}`)
}

// Main function
async function main() {
  console.log('🚀 Starting Trulia upload to Supabase...')
  console.log(`📁 Input file: ${INPUT_FILE} (${FILE_TYPE.toUpperCase()})`)
  console.log(`🔗 Supabase URL: ${supabaseUrl}`)
  console.log('')
  
  // Read and parse file
  let headers, data
  if (FILE_TYPE === 'csv') {
    console.log('📖 Reading CSV file...')
    const csvContent = fs.readFileSync(INPUT_FILE, 'utf-8')
    const result = parseCSV(csvContent)
    headers = result.headers
    data = result.data
  } else {
    const result = parseExcel(INPUT_FILE)
    headers = result.headers
    data = result.data
  }
  
  if (data.length === 0) {
    console.error('❌ No data found in file')
    process.exit(1)
  }
  
  // Debug: Show first few addresses to verify parsing
  if (data.length > 0) {
    console.log('\n📝 Sample listings (first 3):')
    data.slice(0, 3).forEach((listing, i) => {
      const address = listing.address || listing.Address || listing['Property Address'] || 'N/A'
      console.log(`   ${i + 1}. ${address.substring(0, 60)}...`)
    })
  }
  
  // Check for duplicate listing_links
  const listingLinks = data.map(l => l.listing_link || l['Listing Link'] || l.url || l.URL).filter(Boolean)
  const uniqueLinks = new Set(listingLinks)
  if (listingLinks.length !== uniqueLinks.size) {
    console.warn(`\n⚠️  WARNING: Found ${listingLinks.length - uniqueLinks.size} duplicate listing_links`)
  }
  
  console.log('')
  
  // Upload to Supabase
  await uploadToSupabase(data)
  
  console.log('')
  console.log('✅ Done!')
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
}

module.exports = { parseCSV, parseExcel, uploadToSupabase }

