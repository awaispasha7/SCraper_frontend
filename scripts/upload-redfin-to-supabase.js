/**
 * Script to upload enriched Redfin listings CSV to Supabase
 * 
 * This script reads redfin_listings_enriched.csv and uploads it to Supabase redfin_listings table
 * 
 * Usage: node scripts/upload-redfin-to-supabase.js
 */

const fs = require('fs')
const path = require('path')
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

// Configuration
const INPUT_CSV = path.join(__dirname, '..', 'redfin_listings_enriched.csv')

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
      console.warn(`   This might indicate a parsing issue with multi-line values.`)
      console.warn(`   Row preview: ${lines[i].substring(0, 100)}...`)
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

// Parse emails string (can be comma-separated or newline-separated)
function parseEmails(emailsStr) {
  if (!emailsStr || emailsStr.trim() === '') return []
  
  // Split by comma or newline, then clean up
  const emails = emailsStr
    .split(/[,\n]/)
    .map(email => email.trim())
    .filter(email => email && email.includes('@'))
  
  return emails
}

// Parse phones string (can be comma-separated or newline-separated)
function parsePhones(phonesStr) {
  if (!phonesStr || phonesStr.trim() === '') return []
  
  // Remove "Landline:" prefix and split by comma or newline
  const cleaned = phonesStr.replace(/Landline:\s*/gi, '').trim()
  
  // Split by comma or newline, then clean up
  const phones = cleaned
    .split(/[,\n]/)
    .map(phone => phone.trim())
    .filter(phone => phone && /[\d-]/.test(phone))
    .map(phone => phone.replace(/\D/g, '')) // Remove non-digits
    .filter(phone => phone.length >= 10) // Valid phone numbers
  
  return phones
}

// Upload listings to Supabase
async function uploadToSupabase(listings) {
  console.log('📤 Uploading to Supabase redfin_listings table...')
  console.log('   📧 Including emails and phones from CSV...')
  console.log('')
  
  const timestamp = new Date().toISOString()
  let successCount = 0
  let errorCount = 0
  let updatedCount = 0
  let insertedCount = 0
  
  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i]
    
    try {
      // Prepare listing data for Supabase - include ALL CSV columns as-is
      const listingData = {
        address: listing.address || null,
        price: listing.price ? parseFloat(listing.price) : null,
        beds: listing.beds ? parseFloat(listing.beds) : null,
        baths: listing.baths ? parseFloat(listing.baths) : null,
        square_feet: listing.square_feet ? parseFloat(listing.square_feet) : null,
        listing_link: listing.listing_link || null,
        property_type: listing.property_type || null,
        county: listing.county || null,
        lot_acres: listing.lot_acres && listing.lot_acres.trim() !== '' ? parseFloat(listing.lot_acres) : null,
        owner_name: listing.owner_name || null,
        mailing_address: listing.mailing_address || null,
        scrape_date: listing.scrape_date || null,
        emails: listing.emails || null,  // Store emails as text from CSV (already formatted)
        phones: listing.phones || null,  // Store phones as text from CSV (already formatted)
        // Note: created_at and updated_at are optional - will be added if columns exist
      }
      
      // Try to add timestamp fields if they exist in the table
      // We'll handle errors gracefully if they don't exist
      
      // Check if listing exists (by listing_link)
      const { data: existing, error: fetchError } = await supabase
        .from('redfin_listings')
        .select('id, listing_link')
        .eq('listing_link', listingData.listing_link)
        .maybeSingle()
      
      if (fetchError) {
        // Ignore schema cache errors about created_at - we'll handle them during insert/update
        if (fetchError.message.includes('schema cache') && fetchError.message.includes('created_at')) {
          // Continue as if no existing record found - will try to insert
          console.warn(`   ⚠️  Schema cache warning (created_at), continuing...`)
        } else if (!fetchError.message.includes('relation "redfin_listings" does not exist')) {
          throw fetchError
        }
      }
      
      if (existing) {
        // Update existing listing - only update fields that exist
        let updateData = { ...listingData }
        
        // Try to add updated_at if column exists (will fail gracefully if it doesn't)
        const { error: updateError } = await supabase
          .from('redfin_listings')
          .update(updateData)
          .eq('id', existing.id)
        
        if (updateError) {
          // Check if error is about missing created_at/updated_at columns (including schema cache errors)
          if (updateError.message.includes('created_at') || updateError.message.includes('updated_at') || 
              updateError.message.includes('schema cache')) {
            // Remove timestamp fields and try again
            const { created_at, updated_at, ...dataWithoutTimestamps } = updateData
            const { error: retryError } = await supabase
              .from('redfin_listings')
              .update(dataWithoutTimestamps)
              .eq('id', existing.id)
            
            if (retryError) {
              // Check if error is about missing emails/phones columns
              if (retryError.message.includes('emails') || retryError.message.includes('phones')) {
                console.warn(`   ⚠️  Warning: 'emails' or 'phones' columns not found in table. Attempting without them...`)
                const { emails, phones, ...dataWithoutContacts } = dataWithoutTimestamps
                const { error: finalError } = await supabase
                  .from('redfin_listings')
                  .update(dataWithoutContacts)
                  .eq('id', existing.id)
                
                if (finalError) {
                  console.error(`   ❌ Failed to update: ${finalError.message}`)
                  throw finalError
                }
                console.warn(`   ⚠️  Updated without emails/phones (columns don't exist in table)`)
              } else {
                throw retryError
              }
            }
          } else if (updateError.message.includes('emails') || updateError.message.includes('phones')) {
            console.warn(`   ⚠️  Warning: 'emails' or 'phones' columns not found in table. Attempting without them...`)
            const { emails, phones, ...dataWithoutContacts } = updateData
            const { error: retryError } = await supabase
              .from('redfin_listings')
              .update(dataWithoutContacts)
              .eq('id', existing.id)
            
            if (retryError) {
              console.error(`   ❌ Failed to update even without emails/phones: ${retryError.message}`)
              throw retryError
            }
            console.warn(`   ⚠️  Updated without emails/phones (columns don't exist in table)`)
          } else {
            throw updateError
          }
        }
        updatedCount++
        successCount++
        console.log(`   ✅ Updated: ${listing.address?.substring(0, 50) || 'N/A'}...`)
      } else {
        // Insert new listing
        let insertError = null
        const { error: error1 } = await supabase
          .from('redfin_listings')
          .insert(listingData)
        
        if (error1) {
          // If error is about created_at/updated_at (including schema cache errors), remove them and try again
          if (error1.message.includes('created_at') || error1.message.includes('updated_at') || 
              error1.message.includes('schema cache')) {
            const { created_at, updated_at, ...dataWithoutTimestamps } = listingData
            const { error: error2 } = await supabase
              .from('redfin_listings')
              .insert(dataWithoutTimestamps)
            
            if (error2) {
              // If column doesn't exist, try without emails/phones
              if (error2.message.includes('emails') || error2.message.includes('phones')) {
                console.warn(`   ⚠️  Warning: 'emails' or 'phones' columns not found in table. Attempting without them...`)
                const { emails, phones, ...dataWithoutContacts } = dataWithoutTimestamps
                const { error: error3 } = await supabase
                  .from('redfin_listings')
                  .insert(dataWithoutContacts)
                
                if (error3) {
                  insertError = error3
                } else {
                  console.warn(`   ⚠️  Inserted without emails/phones (columns don't exist in table)`)
                }
              } else {
                insertError = error2
              }
            }
          } else if (error1.message.includes('emails') || error1.message.includes('phones')) {
            console.warn(`   ⚠️  Warning: 'emails' or 'phones' columns not found in table. Attempting without them...`)
            const { emails, phones, ...dataWithoutContacts } = listingData
            const { error: error2 } = await supabase
              .from('redfin_listings')
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
          if (insertError.message.includes('relation "redfin_listings" does not exist')) {
            console.error(`\n❌ Table 'redfin_listings' does not exist in Supabase`)
            console.error(`   Please create the table first. Expected columns:`)
            console.error(`   - address (text), price (numeric), beds (numeric), baths (numeric)`)
            console.error(`   - square_feet (numeric), listing_link (text)`)
            console.error(`   - property_type (text), county (text), lot_acres (numeric)`)
            console.error(`   - owner_name (text), mailing_address (text), scrape_date (text)`)
            console.error(`   - emails (text), phones (text)  <-- IMPORTANT: Include these for email/phone data`)
            console.error(`   - created_at (timestamp), updated_at (timestamp)`)
            process.exit(1)
          }
          throw insertError
        }
        insertedCount++
        successCount++
        console.log(`   ✅ Inserted: ${listing.address?.substring(0, 50) || 'N/A'}...`)
      }
      
      // Show progress
      if ((i + 1) % 5 === 0 || i === listings.length - 1) {
        console.log(`   Progress: ${i + 1}/${listings.length} listings processed...`)
      }
    } catch (error) {
      console.error(`   ❌ Error processing listing ${i + 1}:`, error.message)
      console.error(`      Address: ${listing.address || 'N/A'}`)
      errorCount++
    }
  }
  
  console.log(`\n✅ Upload complete!`)
  console.log(`   Total listings in CSV: ${listings.length}`)
  console.log(`   Successfully uploaded: ${successCount}`)
  console.log(`   - Inserted: ${insertedCount}`)
  console.log(`   - Updated: ${updatedCount}`)
  console.log(`   Errors: ${errorCount}`)
  
  // Final validation
  if (listings.length !== 8) {
    console.warn(`\n⚠️  WARNING: CSV should have 8 listings but found ${listings.length}`)
    console.warn(`   Please check the CSV file for parsing issues.`)
  }
}

// Main function
async function main() {
  console.log('🚀 Starting Redfin CSV upload to Supabase...')
  console.log(`📁 Input file: ${INPUT_CSV}`)
  console.log(`🔗 Supabase URL: ${supabaseUrl}`)
  console.log('')
  
  // Check if input file exists
  if (!fs.existsSync(INPUT_CSV)) {
    console.error(`❌ Input file not found: ${INPUT_CSV}`)
    process.exit(1)
  }
  
  // Read and parse CSV
  console.log('📖 Reading CSV file...')
  const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8')
  const { headers, data } = parseCSV(csvContent)
  
  console.log(`✅ Found ${data.length} listings`)
  console.log(`📋 Columns: ${headers.join(', ')}`)
  
  // Debug: Show first few addresses to verify parsing
  if (data.length > 0) {
    console.log('\n📝 Sample listings (first 3):')
    data.slice(0, 3).forEach((listing, i) => {
      console.log(`   ${i + 1}. ${listing.address?.substring(0, 60) || 'N/A'}...`)
    })
  }
  
  // Validate that we have the expected number of listings
  if (data.length !== 8) {
    console.warn(`\n⚠️  WARNING: Expected 8 listings but found ${data.length}`)
    console.warn(`   This might indicate a CSV parsing issue with multi-line values.`)
  }
  
  // Check for duplicate listing_links
  const listingLinks = data.map(l => l.listing_link).filter(Boolean)
  const uniqueLinks = new Set(listingLinks)
  if (listingLinks.length !== uniqueLinks.size) {
    console.warn(`\n⚠️  WARNING: Found ${listingLinks.length - uniqueLinks.size} duplicate listing_links`)
    const duplicates = listingLinks.filter((link, index) => listingLinks.indexOf(link) !== index)
    console.warn(`   Duplicate links: ${duplicates.join(', ')}`)
  }
  
  // Show all addresses for verification
  console.log('\n📋 All listings found:')
  data.forEach((listing, i) => {
    console.log(`   ${i + 1}. ${listing.address || 'NO ADDRESS'} (${listing.listing_link ? 'has link' : 'NO LINK'})`)
  })
  
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

module.exports = { parseCSV, uploadToSupabase, parseEmails, parsePhones }

