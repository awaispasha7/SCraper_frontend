/**
 * Script to enrich Trulia listings CSV with owner information directly from Atom API
 * 
 * This script reads trulia_listings.csv and for each listing:
 * 1. Calls Atom API directly to fetch owner_name and mailing_address
 * 2. Updates the CSV with the fetched data
 * 3. Writes a new enriched CSV file
 * 
 * Usage: node scripts/enrich-trulia-direct-atom.js
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

// Atom API Configuration
const ATOM_API_KEY = process.env.ATTOM_API_KEY || '00088313f4a127201256b9bf19a2963b'
const ATOM_API_BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0'

// Configuration
const INPUT_CSV = path.join(__dirname, '..', 'trulia_listings.csv')
const OUTPUT_CSV = path.join(__dirname, '..', 'trulia_listings_enriched.csv')

// Parse address for Atom API (same logic as owner-info route)
function parseAddress(address) {
  if (!address) return { address1: '', address2: '' }
  
  // Remove common suffixes
  let cleanAddress = address
    .replace(/\s*\|.*$/i, '') // Remove "| Trulia" suffix
    .trim()
  
  let address1 = cleanAddress
  let address2 = ''
  
  // Normalize address - remove extra spaces
  address1 = address1.replace(/\s+/g, ' ')
  
  // Check if address is comma-separated (common in Redfin/Trulia CSV format)
  if (address.includes(',')) {
    const commaParts = address.split(',').map(part => part.trim()).filter(part => part)
    
    if (commaParts.length >= 3) {
      // Extract street address (first part)
      address1 = commaParts[0]
      
      // Extract city (second part)
      const city = commaParts[1]
      
      // Extract state and ZIP (third part and beyond)
      let state = ''
      let zip = ''
      
      if (commaParts.length >= 4) {
        // Format: "Street, City, State, ZIP"
        state = commaParts[2].toUpperCase()
        zip = commaParts[3]
      } else if (commaParts.length === 3) {
        // Format: "Street, City, State ZIP" or "Street, City, State"
        const stateZipPart = commaParts[2]
        const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*(\d{5})?$/)
        if (stateZipMatch) {
          state = stateZipMatch[1].toUpperCase()
          zip = stateZipMatch[2] || ''
        } else {
          // Try to extract state and zip separately
          const parts = stateZipPart.split(/\s+/)
          if (parts.length >= 2) {
            state = parts[0].toUpperCase()
            zip = parts[1]
          } else {
            state = stateZipPart.toUpperCase()
          }
        }
      }
      
      // Format address2 as "City, State ZIP"
      if (zip) {
        address2 = `${city}, ${state} ${zip}`.trim()
      } else {
        address2 = `${city}, ${state}`.trim()
      }
    }
  }
  
  // If comma-separated parsing didn't work, try space-separated parsing
  if (!address2 || address1 === address) {
    const addressParts = address1.split(/\s+/)
    
    // Find ZIP code (5 digits) - it's usually the last part
    let zipIndex = -1
    for (let i = addressParts.length - 1; i >= 0; i--) {
      if (/^\d{5}$/.test(addressParts[i])) {
        zipIndex = i
        break
      }
    }
    
    if (zipIndex >= 2) {
      const zip = addressParts[zipIndex]
      const state = addressParts[zipIndex - 1]
      const cityIndex = zipIndex - 2
      
      if (cityIndex >= 0) {
        address1 = addressParts.slice(0, cityIndex).join(' ')
        const city = addressParts[cityIndex]
        const normalizedState = state.toUpperCase()
        address2 = `${city}, ${normalizedState} ${zip}`
      }
    }
  }
  
  // Final validation and cleanup
  if (!address1 || address1.length < 5) {
    address1 = address
  }
  
  // Only use default if we absolutely cannot determine city/state
  if (!address2 || address2.trim() === '') {
    const lastAttempt = address.match(/([^,]+),\s*([^,]+),\s*([A-Z]{2})(?:,\s*(\d{5}))?/i)
    if (lastAttempt) {
      address1 = lastAttempt[1].trim()
      const city = lastAttempt[2].trim()
      const state = lastAttempt[3].toUpperCase()
      const zip = lastAttempt[4] || ''
      address2 = zip ? `${city}, ${state} ${zip}` : `${city}, ${state}`
    } else {
      // Only as absolute last resort
      address2 = 'Chicago, IL'
    }
  }
  
  return { address1, address2 }
}

// Extract owner name from Atom API response
function extractOwnerName(property) {
  if (!property) return null
  
  const paths = [
    property?.assessment?.owner?.owner1?.fullName,
    property?.assessment?.owner?.owner1?.name,
    property?.assessment?.owner?.owner1?.firstNameAndMi && property?.assessment?.owner?.owner1?.lastName
      ? `${property.assessment.owner.owner1.firstNameAndMi} ${property.assessment.owner.owner1.lastName}`.trim()
      : null,
    property?.owner?.name,
    property?.owner?.owner1?.name,
    property?.owner?.owner1?.fullName,
    property?.owner1?.name,
    property?.owner1?.fullName,
    property?.owner?.fullName,
    property?.owner?.firstName && property?.owner?.lastName 
      ? `${property.owner.firstName} ${property.owner.lastName}`.trim()
      : null,
    property?.owner1?.firstName && property?.owner1?.lastName 
      ? `${property.owner1.firstName} ${property.owner1.lastName}`.trim()
      : null,
  ]
  
  for (const name of paths) {
    if (name && typeof name === 'string' && name.trim() && 
        name !== 'null' && name !== 'None' && 
        !name.includes('NOT AVAILABLE') && 
        !name.includes('AVAILABLE FROM DATA SOURCE')) {
      return name.trim()
    }
  }
  return null
}

// Extract mailing address from Atom API response
function extractMailingAddress(property) {
  if (!property) return null
  
  const paths = [
    property?.assessment?.owner?.mailingAddressOneLine,
    property?.assessment?.owner?.mailingAddress?.oneLine,
    property?.assessment?.owner?.mailingAddress?.line1 && property?.assessment?.owner?.mailingAddress?.line2
      ? `${property.assessment.owner.mailingAddress.line1}, ${property.assessment.owner.mailingAddress.line2}`.trim()
      : null,
    property?.owner?.mailingAddressOneLine,
    property?.owner?.mailingAddress?.oneLine,
    property?.owner?.mailingAddress?.line1 && property?.owner?.mailingAddress?.line2
      ? `${property.owner.mailingAddress.line1}, ${property.owner.mailingAddress.line2}`.trim()
      : null,
    property?.mailingAddressOneLine,
    property?.mailingAddress?.oneLine,
  ]
  
  // Also try constructing from parts
  if (!paths.find(p => p)) {
    const mailAddr = property?.assessment?.owner?.mailingAddress || property?.owner?.mailingAddress || property?.mailingAddress
    if (mailAddr) {
      const parts = [
        mailAddr.addressOne,
        mailAddr.line1,
        mailAddr.street,
        mailAddr.city,
        mailAddr.locality,
        mailAddr.state,
        mailAddr.zip,
        mailAddr.zipCode,
        mailAddr.postalCode,
      ].filter(Boolean)
      
      if (parts.length > 0) {
        return parts.join(', ')
      }
    }
  }
  
  for (const addr of paths) {
    if (addr && typeof addr === 'string' && addr.trim() && 
        addr !== 'null' && addr !== 'None' && 
        !addr.includes('NOT AVAILABLE') && 
        !addr.includes('AVAILABLE FROM DATA SOURCE')) {
      return addr.trim()
    }
  }
  return null
}

// Fetch owner info from Atom API
async function fetchOwnerInfoFromAtom(address) {
  try {
    const { address1, address2 } = parseAddress(address)
    
    if (!address1 || !address2) {
      console.warn(`   ⚠️ Could not parse address: ${address}`)
      return { ownerName: null, mailingAddress: null }
    }
    
    console.log(`   📍 Parsed: address1="${address1}", address2="${address2}"`)
    
    // Atom Data API endpoint
    const apiUrl = `${ATOM_API_BASE_URL}/property/expandedprofile`
    const addressParams = new URLSearchParams({
      address1: address1,
      address2: address2,
    })
    const fullUrl = `${apiUrl}?${addressParams.toString()}`
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'apikey': ATOM_API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.warn(`   ⚠️ Atom API returned ${response.status}: ${errorText.substring(0, 100)}`)
      return { ownerName: null, mailingAddress: null }
    }
    
    const data = await response.json()
    
    // Check if API returned "SuccessWithoutResult" (property not found)
    if (data.status && data.status.msg === 'SuccessWithoutResult' && data.status.total === 0) {
      console.warn(`   ⚠️ Property not found in Atom API database`)
      return { ownerName: null, mailingAddress: null }
    }
    
    // Extract property from response
    let property = null
    if (data.property && Array.isArray(data.property) && data.property.length > 0) {
      property = data.property[0]
    } else if (data.property && typeof data.property === 'object') {
      property = data.property
    } else if (data.properties && Array.isArray(data.properties) && data.properties.length > 0) {
      property = data.properties[0]
    } else if (data.data && data.data.property) {
      property = Array.isArray(data.data.property) ? data.data.property[0] : data.data.property
    }
    
    if (!property) {
      console.warn(`   ⚠️ No property data found in Atom API response`)
      return { ownerName: null, mailingAddress: null }
    }
    
    const ownerName = extractOwnerName(property)
    const mailingAddress = extractMailingAddress(property)
    
    return { ownerName, mailingAddress }
  } catch (error) {
    console.error(`   ❌ Error fetching owner info: ${error.message}`)
    return { ownerName: null, mailingAddress: null }
  }
}

// Parse CSV
function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length < 2) return { headers: [], data: [] }
  
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

// Main function
async function main() {
  console.log('🚀 Starting Trulia CSV enrichment with Atom API...')
  console.log(`📁 Input file: ${INPUT_CSV}`)
  console.log(`📁 Output file: ${OUTPUT_CSV}`)
  console.log(`🔑 Using Atom API Key: ${ATOM_API_KEY.substring(0, 10)}...`)
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
  let successCount = 0
  
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
    
    // Fetch owner info from Atom API
    const ownerInfo = await fetchOwnerInfoFromAtom(address)
    
    // Update listing data
    if (ownerInfo.ownerName) {
      listing.owner_name = ownerInfo.ownerName
      updated++
    }
    if (ownerInfo.mailingAddress) {
      listing.mailing_address = ownerInfo.mailingAddress
      updated++
    }
    
    if (ownerInfo.ownerName || ownerInfo.mailingAddress) {
      successCount++
      console.log(`   ✅ Owner Name: ${ownerInfo.ownerName || 'N/A'}`)
      console.log(`   ✅ Mailing Address: ${ownerInfo.mailingAddress || 'N/A'}`)
    } else {
      console.log(`   ⚠️  No owner info found`)
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
  console.log(`   Successfully fetched: ${successCount}`)
  console.log(`   Updated fields: ${updated}`)
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

module.exports = { parseCSV, writeCSV, fetchOwnerInfoFromAtom, parseAddress, extractOwnerName, extractMailingAddress }

