const fs = require('fs')
const path = require('path')

// Paths
const INPUT_CSV = path.join(__dirname, '../public/addresses.csv')
const OUTPUT_CSV = path.join(__dirname, '../public/addresses.csv')
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

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

// Format CSV value (escape quotes and wrap in quotes if needed)
// Excel-friendly format: empty values are empty strings, not "null"
function formatCSVValue(value) {
  if (value === null || value === undefined || value === '' || value === 'null') {
    return '' // Empty string for Excel compatibility
  }
  
  // Convert to string
  const str = String(value).trim()
  
  if (str === '') {
    return ''
  }
  
  // Always wrap in quotes for Excel compatibility (like Redfin CSV)
  // Escape quotes by doubling them
  return `"${str.replace(/"/g, '""')}"`
}

// Write CSV file with retry logic for locked files
async function writeCSV(headers, data, filePath, maxRetries = 5) {
  const lines = []
  
  // Write header
  lines.push(headers.map(h => formatCSVValue(h)).join(','))
  
  // Write data rows (ensure all fields are properly formatted)
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header]
      return formatCSVValue(value === undefined || value === null || value === 'null' ? '' : value)
    })
    lines.push(values.join(','))
  })
  
  const content = lines.join('\n') + '\n'
  
  // Try to write with retry logic
  let retries = 0
  while (retries < maxRetries) {
    try {
      // Try writing to a temporary file first, then rename (atomic operation)
      const tempPath = filePath + '.tmp'
      fs.writeFileSync(tempPath, content, 'utf-8')
      
      // Try to replace the original file
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      } catch (err) {
        // File might be locked, that's okay - we'll try rename
      }
      
      fs.renameSync(tempPath, filePath)
      return // Success!
    } catch (error) {
      retries++
      if (retries >= maxRetries) {
        throw new Error(`Failed to write CSV after ${maxRetries} attempts. Please close the CSV file if it's open in Excel or another program. Error: ${error.message}`)
      }
      console.log(`  ⚠️  File is locked, retrying in 2 seconds... (attempt ${retries}/${maxRetries})`)
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }
}

// Fetch owner information from API
async function fetchOwnerInfo(address, city, state, zip) {
  try {
    const fullAddress = `${address}, ${city}, ${state} ${zip}`
    const url = `${API_BASE_URL}/api/owner-info?address=${encodeURIComponent(fullAddress)}&source=addresses`
    
    console.log(`  Fetching owner info for: ${fullAddress.substring(0, 60)}...`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.log(`  ⚠️  API returned status ${response.status}`)
      return {
        owner_name: '',
        mailing_address: '',
        emails: '',
        phones: ''
      }
    }
    
    const data = await response.json()
    
    // Extract owner information (use empty string instead of null)
    const ownerName = data.ownerName || ''
    const mailingAddress = data.mailingAddress || ''
    
    // Extract emails and phones (format like Redfin CSV with commas)
    const emails = data.emails && Array.isArray(data.emails) && data.emails.length > 0
      ? data.emails.join(', ')
      : ''
    const phones = data.phones && Array.isArray(data.phones) && data.phones.length > 0
      ? data.phones.join(', ')
      : ''
    
    return {
      owner_name: ownerName,
      mailing_address: mailingAddress,
      emails: emails,
      phones: phones
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`)
    return {
      owner_name: '',
      mailing_address: '',
      emails: '',
      phones: ''
    }
  }
}

// Main function
async function main() {
  console.log('🚀 Starting Addresses CSV enrichment...')
  console.log(`📁 Input file: ${INPUT_CSV}`)
  console.log(`📁 Output file: ${OUTPUT_CSV}`)
  console.log(`🌐 API URL: ${API_BASE_URL}`)
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
  
  console.log(`✅ Found ${data.length} addresses`)
  console.log('')
  
  // Add new columns if they don't exist
  const newHeaders = [...headers]
  if (!newHeaders.includes('owner_name')) {
    newHeaders.push('owner_name')
  }
  if (!newHeaders.includes('mailing_address')) {
    newHeaders.push('mailing_address')
  }
  if (!newHeaders.includes('emails')) {
    newHeaders.push('emails')
  }
  if (!newHeaders.includes('phones')) {
    newHeaders.push('phones')
  }
  
  // Initialize new columns for existing data (use empty string instead of null for Excel)
  data.forEach(row => {
    if (!row.owner_name || row.owner_name === 'null') row.owner_name = ''
    if (!row.mailing_address || row.mailing_address === 'null') row.mailing_address = ''
    if (!row.emails || row.emails === 'null') row.emails = ''
    if (!row.phones || row.phones === 'null') row.phones = ''
  })
  
  // Process each address
  let processed = 0
  let updated = 0
  
  for (let i = 0; i < data.length; i++) {
    const address = data[i]
    const addr = address.address || ''
    const city = address.city || ''
    const state = address.state || ''
    const zip = address.zip || ''
    
    if (!addr) {
      console.log(`⏭️  Skipping row ${i + 1}: No address`)
      processed++
      continue
    }
    
    // Check if already has owner info (check for empty strings too)
    const hasOwnerName = address.owner_name && address.owner_name !== 'null' && address.owner_name !== '' && address.owner_name.trim() !== ''
    const hasMailingAddress = address.mailing_address && address.mailing_address !== 'null' && address.mailing_address !== '' && address.mailing_address.trim() !== ''
    const hasEmails = address.emails && address.emails !== 'null' && address.emails !== '' && address.emails.trim() !== ''
    const hasPhones = address.phones && address.phones !== 'null' && address.phones !== '' && address.phones.trim() !== ''
    
    if (hasOwnerName && hasMailingAddress && hasEmails && hasPhones) {
      console.log(`✓ Row ${i + 1}/${data.length}: Already has owner info, skipping`)
      processed++
      continue
    }
    
    console.log(`\n[${i + 1}/${data.length}] Processing: ${addr.substring(0, 60)}...`)
    
    // Fetch owner info from API
    const ownerInfo = await fetchOwnerInfo(addr, city, state, zip)
    
    // Update address data (use empty string instead of null for Excel compatibility)
    let rowUpdated = false
    if (ownerInfo.owner_name) {
      address.owner_name = ownerInfo.owner_name
      rowUpdated = true
    } else if (!hasOwnerName) {
      address.owner_name = ''
    }
    
    if (ownerInfo.mailing_address) {
      address.mailing_address = ownerInfo.mailing_address
      rowUpdated = true
    } else if (!hasMailingAddress) {
      address.mailing_address = ''
    }
    
    if (ownerInfo.emails) {
      address.emails = ownerInfo.emails
      rowUpdated = true
    } else if (!hasEmails) {
      address.emails = ''
    }
    
    if (ownerInfo.phones) {
      address.phones = ownerInfo.phones
      rowUpdated = true
    } else if (!hasPhones) {
      address.phones = ''
    }
    
    if (rowUpdated) {
      updated++
    }
    
    processed++
    
    // Add delay to avoid rate limiting (1 second between requests)
    if (i < data.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  console.log('\n')
  console.log('💾 Saving updated CSV file...')
  try {
    await writeCSV(newHeaders, data, OUTPUT_CSV)
    console.log('✅ CSV file saved successfully!')
  } catch (error) {
    console.error('\n❌ Error saving CSV file:')
    console.error(`   ${error.message}`)
    console.error('\n💡 Tip: Close the CSV file if it\'s open in Excel or another program, then run the script again.')
    process.exit(1)
  }
  
  console.log('')
  console.log('✅ Enrichment complete!')
  console.log(`   Processed: ${processed} addresses`)
  console.log(`   Updated: ${updated} addresses`)
  console.log(`   Output file: ${OUTPUT_CSV}`)
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

