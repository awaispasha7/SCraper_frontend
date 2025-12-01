const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Load environment variables (try both .env.local and .env)
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Supabase configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials!')
  console.error('   Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local or .env')
  console.error('')
  console.error('   Current values:')
  console.error(`   NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET'}`)
  console.error(`   SUPABASE_URL: ${process.env.SUPABASE_URL || 'NOT SET'}`)
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (hidden)' : 'NOT SET'}`)
  console.error(`   SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? 'SET (hidden)' : 'NOT SET'}`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Paths
const CSV_PATH = path.join(__dirname, '../public/addresses.csv')

// Parse CSV content
function parseCSV(content) {
  const lines = content.trim().split('\n')
  if (lines.length === 0) {
    return { headers: [], data: [] }
  }

  // Parse header
  const headers = parseCSVLine(lines[0])
  
  // Parse data rows
  const data = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseCSVLine(lines[i])
    if (values.length === headers.length) {
      const row = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      data.push(row)
    }
  }
  
  return { headers, data }
}

// Parse a single CSV line handling quoted fields
function parseCSVLine(line) {
  const fields = []
  let currentField = ''
  let insideQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentField += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator
      fields.push(currentField.trim())
      currentField = ''
    } else {
      currentField += char
    }
  }
  
  fields.push(currentField.trim()) // Last field
  return fields
}

// Clean value (convert empty strings and "null" to null)
function cleanValue(value) {
  if (!value || value === '' || value === 'null' || value === '""') {
    return null
  }
  return value.trim()
}

// Upload addresses to Supabase
async function uploadToSupabase(addresses) {
  console.log('📤 Uploading to Supabase addresses table...')
  console.log(`   Total addresses: ${addresses.length}`)
  console.log('')

  let successCount = 0
  let errorCount = 0
  let skippedCount = 0

  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i]
    
    if (!addr.address || !addr.city || !addr.state || !addr.zip) {
      console.log(`⏭️  [${i + 1}/${addresses.length}] Skipping: Missing required fields`)
      skippedCount++
      continue
    }

    const addressData = {
      address: addr.address.trim(),
      city: addr.city.trim(),
      state: addr.state.trim(),
      zip: addr.zip.trim(),
      owner_name: cleanValue(addr.owner_name),
      mailing_address: cleanValue(addr.mailing_address),
      emails: cleanValue(addr.emails),
      phones: cleanValue(addr.phones)
    }

    try {
      // Check if address already exists
      const { data: existing, error: checkError } = await supabase
        .from('addresses')
        .select('id, address')
        .eq('address', addressData.address)
        .eq('city', addressData.city)
        .eq('state', addressData.state)
        .eq('zip', addressData.zip)
        .maybeSingle()

      if (checkError && !checkError.message.includes('does not exist')) {
        throw checkError
      }

      if (existing) {
        // Update existing address
        const { error: updateError } = await supabase
          .from('addresses')
          .update({
            ...addressData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (updateError) {
          throw updateError
        }

        console.log(`   ✅ [${i + 1}/${addresses.length}] Updated: ${addressData.address.substring(0, 50)}...`)
        successCount++
      } else {
        // Insert new address
        const { error: insertError } = await supabase
          .from('addresses')
          .insert(addressData)

        if (insertError) {
          // If table doesn't exist, provide helpful error
          if (insertError.message.includes('relation "addresses" does not exist')) {
            console.error(`\n❌ Table 'addresses' does not exist in Supabase`)
            console.error(`   Please run the create_addresses_table.sql script first in your Supabase SQL Editor`)
            process.exit(1)
          }
          throw insertError
        }

        console.log(`   ✅ [${i + 1}/${addresses.length}] Inserted: ${addressData.address.substring(0, 50)}...`)
        successCount++
      }
    } catch (error) {
      console.error(`   ❌ [${i + 1}/${addresses.length}] Error: ${addressData.address.substring(0, 50)}...`)
      console.error(`      ${error.message}`)
      errorCount++
    }
  }

  console.log('')
  console.log('📊 Upload Summary:')
  console.log(`   ✅ Success: ${successCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log(`   ⏭️  Skipped: ${skippedCount}`)
  console.log(`   📦 Total: ${addresses.length}`)
}

// Main function
async function main() {
  console.log('🚀 Starting Addresses CSV upload to Supabase...')
  console.log(`📁 CSV file: ${CSV_PATH}`)
  console.log(`🌐 Supabase URL: ${SUPABASE_URL}`)
  console.log('')

  // Check if CSV file exists
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV file not found: ${CSV_PATH}`)
    process.exit(1)
  }

  // Read and parse CSV
  console.log('📖 Reading CSV file...')
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8')
  const { headers, data } = parseCSV(csvContent)

  console.log(`✅ Found ${data.length} addresses`)
  console.log(`📋 Columns: ${headers.join(', ')}`)
  console.log('')

  // Upload to Supabase
  await uploadToSupabase(data)

  console.log('')
  console.log('✅ Upload complete!')
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

