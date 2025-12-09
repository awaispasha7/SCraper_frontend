/**
 * Script to enrich Trulia listings CSV with owner information from Atom API
 * 
 * This script reads trulia_listings.csv and for each listing:
 * 1. Calls the /api/owner-info endpoint to fetch owner_name and mailing_address from Atom API
 * 2. Updates the CSV with the fetched data
 * 3. Writes a new enriched CSV file
 * 
 * Usage: node scripts/enrich-trulia-csv.js
 */

const fs = require('fs')
const path = require('path')

// Use node-fetch if available, otherwise use built-in fetch (Node 18+)
let fetch
try {
  fetch = require('node-fetch')
} catch (e) {
  // Use global fetch if available (Node 18+)
  if (typeof globalThis.fetch === 'function') {
    fetch = globalThis.fetch
  } else {
    console.error('❌ fetch is not available. Please install node-fetch: npm install node-fetch')
    process.exit(1)
  }
}

// Configuration
const INPUT_CSV = path.join(__dirname, '..', 'trulia_listings.csv')
const OUTPUT_CSV = path.join(__dirname, '..', 'trulia_listings_enriched.csv')
const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// Parse CSV
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []
  
  // Parse header
  const headers = []
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
  const data = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    
    const values = []
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
    const row = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    data.push(row)
  }
  
  return { headers, data }
}

// Format CSV value (escape quotes and wrap in quotes if needed)
function formatCSVValue(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Write CSV
function writeCSV(headers, data, filePath) {
  const lines = []
  
  // Header row
  lines.push(headers.map(h => formatCSVValue(h)).join(','))
  
  // Data rows
  data.forEach(row => {
    const values = headers.map(header => formatCSVValue(row[header] || ''))
    lines.push(values.join(','))
  })
  
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
  console.log(`✅ Written ${data.length} rows to ${filePath}`)
}

// Fetch owner info from API
async function fetchOwnerInfo(address, listingLink) {
  try {
    const params = new URLSearchParams({
      address: address,
      source: 'trulia'
    })
    
    if (listingLink) {
      params.append('listing_link', listingLink)
    }
    
    const url = `${API_BASE_URL}/api/owner-info?${params.toString()}`
    
    console.log(`   Fetching owner info for: ${address.substring(0, 50)}...`)
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log(`   ⚠️ API returned ${response.status}: ${errorText.substring(0, 100)}`)
      return { owner_name: '', mailing_address: '' }
    }
    
    const data = await response.json()
    
    return {
      owner_name: data.ownerName || '',
      mailing_address: data.mailingAddress || ''
    }
  } catch (error) {
    console.log(`   ❌ Error fetching owner info: ${error.message}`)
    return { owner_name: '', mailing_address: '' }
  }
}

// Main function
async function main() {
  console.log('🚀 Starting Trulia CSV enrichment...')
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
  
  console.log(`✅ Found ${data.length} listings`)
  console.log('')
  
  // Process each listing
  let processed = 0
  let updated = 0
  
  for (let i = 0; i < data.length; i++) {
    const listing = data[i]
    const address = listing.address || ''
    
    if (!address) {
      console.log(`⏭️  Skipping row ${i + 1}: No address`)
      continue
    }
    
    // Check if already has owner info
    const hasOwnerName = listing.owner_name && listing.owner_name.trim() !== ''
    const hasMailingAddress = listing.mailing_address && listing.mailing_address.trim() !== ''
    
    if (hasOwnerName && hasMailingAddress) {
      console.log(`✓ Row ${i + 1}/${data.length}: Already has owner info, skipping`)
      processed++
      continue
    }
    
    console.log(`\n[${i + 1}/${data.length}] Processing: ${address.substring(0, 60)}...`)
    
    // Fetch owner info from API
    const ownerInfo = await fetchOwnerInfo(address, listing.listing_link)
    
    // Update listing data
    if (ownerInfo.owner_name) {
      listing.owner_name = ownerInfo.owner_name
      updated++
    }
    if (ownerInfo.mailing_address) {
      listing.mailing_address = ownerInfo.mailing_address
      updated++
    }
    
    processed++
    
    // Add delay to avoid rate limiting (1 second between requests)
    if (i < data.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
  
  console.log('\n')
  console.log('📊 Summary:')
  console.log(`   Total listings: ${data.length}`)
  console.log(`   Processed: ${processed}`)
  console.log(`   Updated: ${updated}`)
  console.log('')
  
  // Write enriched CSV
  console.log('💾 Writing enriched CSV...')
  writeCSV(headers, data, OUTPUT_CSV)
  
  console.log('')
  console.log('✅ Done!')
  console.log(`📁 Enriched CSV saved to: ${OUTPUT_CSV}`)
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error)
    process.exit(1)
  })
}

module.exports = { parseCSV, writeCSV, fetchOwnerInfo }

