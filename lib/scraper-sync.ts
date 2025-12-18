/**
 * Scraper Sync Service
 * Handles automatic syncing of listings with the live website
 * Runs every 12 hours to keep database in sync
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

interface SyncStats {
  scraped: number
  added: number
  updated: number
  removed: number
  unchanged: number
  timestamp: string
  duration: number
}

interface Listing {
  address: string | null
  price: string | null
  beds: string | null
  baths: string | null
  square_feet: string | null
  listing_link: string
  time_of_post: string | null
}

/**
 * Normalize address for comparison
 * Removes extra spaces, converts to lowercase, removes special chars
 */
function normalizeAddress(address: string | null): string {
  if (!address) return ''
  return address
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|wy|court|ct|place|pl)\b/gi, '')
    .trim()
}

/**
 * Normalize listing link for comparison
 */
function normalizeLink(link: string | null): string {
  if (!link) return ''
  // Extract the listing ID part from URL
  // Format: https://www.forsalebyowner.com/listing/4557-South-Calumet-Avenue-Chicago-IL-60653/...
  const match = link.match(/\/listing\/([^\/]+)/)
  if (match) {
    return match[1].toLowerCase().trim()
  }
  return link.toLowerCase().trim()
}

/**
 * Check if two listings are the same
 * Uses listing_link as primary key, address as fallback
 */
function areListingsSame(listing1: Listing, listing2: Listing): boolean {
  // Primary: Compare normalized listing links
  const link1 = normalizeLink(listing1.listing_link)
  const link2 = normalizeLink(listing2.listing_link)

  if (link1 && link2 && link1 === link2) {
    return true
  }

  // Fallback: Compare normalized addresses
  const addr1 = normalizeAddress(listing1.address)
  const addr2 = normalizeAddress(listing2.address)

  if (addr1 && addr2 && addr1 === addr2) {
    return true
  }

  return false
}

/**
 * Check if listing data has changed
 */
function hasListingChanged(oldListing: Listing, newListing: Listing): boolean {
  const fields: (keyof Listing)[] = ['address', 'price', 'beds', 'baths', 'square_feet', 'time_of_post']

  for (const field of fields) {
    const oldValue = String(oldListing[field] || '').trim()
    const newValue = String(newListing[field] || '').trim()

    if (oldValue !== newValue) {
      return true
    }
  }

  return false
}

/**
 * Run the Python scraper and get fresh data
 */
async function runScraper(): Promise<Listing[]> {
  const scraperPath = path.join(process.cwd(), '..', 'Scraper_backend', 'FSBO_Scraper', 'forsalebyowner_selenium_scraper.py')

  if (!fs.existsSync(scraperPath)) {
    throw new Error(`Scraper file not found: ${scraperPath}`)
  }

  const startTime = Date.now()

  try {
    // Ensure we use Anaconda Python by prepending it to PATH
    const env = { ...process.env }
    const anacondaPath = 'C:\\Users\\Admin\\anaconda3'
    const anacondaScripts = `${anacondaPath};${anacondaPath}\\Scripts;${anacondaPath}\\Library\\bin`
    env.PATH = `${anacondaScripts};${env.PATH || ''}`

    const { stdout, stderr } = await execAsync(`python "${scraperPath}"`, {
      cwd: path.dirname(scraperPath),
      env: env,
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large outputs
    })

    const duration = Math.round((Date.now() - startTime) / 1000)

    // Log only errors from scraper output
    if (stdout) {
      const lines = stdout.split('\n')
      const errorLines = lines.filter(line =>
        line.includes('ERROR') ||
        line.includes('Error') ||
        line.includes('❌') ||
        line.includes('Failed') ||
        line.includes('Exception')
      )

      if (errorLines.length > 0) {
        console.error('❌ Scraper errors:')
        errorLines.forEach(msg => {
          if (msg.trim()) {
            console.error(`   ${msg.trim()}`)
          }
        })
      }
    }

    if (stderr) {
      console.warn('⚠️ Scraper stderr:', stderr.substring(0, 1000))
      // Check for API connection errors
      if (stderr.includes('Cannot connect') || stderr.includes('ConnectionError')) {
        console.error('❌ Python scraper cannot connect to API')
        console.error('   Make sure Next.js server is running on http://localhost:3000')
      }
      // Check for database schema errors
      if (stderr.includes('does not exist') || stderr.includes('table')) {
        console.error('❌ DATABASE SCHEMA ERROR')
        console.error('   Please run supabase_schema.sql in your Supabase SQL Editor')
        console.error('   See SETUP_DATABASE.md for instructions')
      }
    }

    // Read the scraped data
    const jsonPath = path.join(process.cwd(), '..', 'Scraper_backend', 'FSBO_Scraper', 'forsalebyowner_listings.json')

    if (!fs.existsSync(jsonPath)) {
      throw new Error('Scraper did not generate output file')
    }

    const fileContent = fs.readFileSync(jsonPath, 'utf-8')
    const data = JSON.parse(fileContent)

    // Handle both old format (list) and new format (with metadata)
    const listings: Listing[] = data.listings || data

    return listings

  } catch (error: any) {
    console.error('❌ Scraper execution failed:', error.message)
    throw error
  }
}

/**
 * Load existing listings from database
 */
function loadExistingListings(): Listing[] {
  const jsonPath = path.join(process.cwd(), '..', 'forsalebyowner_listings.json')

  if (!fs.existsSync(jsonPath)) {
    console.log('📝 No existing database found, will create new one')
    return []
  }

  try {
    const fileContent = fs.readFileSync(jsonPath, 'utf-8')
    const data = JSON.parse(fileContent)

    // Handle both old format (list) and new format (with metadata)
    const listings: Listing[] = data.listings || data

    return listings

  } catch (error: any) {
    console.error('❌ Error loading existing listings:', error.message)
    return []
  }
}

/**
 * Sync scraped data with existing database
 * Returns statistics about the sync operation
 */
function syncListings(scrapedListings: Listing[], existingListings: Listing[]): {
  syncedListings: Listing[]
  stats: SyncStats
} {
  const startTime = Date.now()
  const stats: SyncStats = {
    scraped: scrapedListings.length,
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    timestamp: new Date().toISOString(),
    duration: 0
  }

  // Create maps for quick lookup
  const existingByLink = new Map<string, Listing>()
  const existingByAddress = new Map<string, Listing>()

  for (const listing of existingListings) {
    const link = normalizeLink(listing.listing_link)
    const address = normalizeAddress(listing.address)

    if (link) {
      existingByLink.set(link, listing)
    }
    if (address) {
      existingByAddress.set(address, listing)
    }
  }

  // Process scraped listings
  const syncedListings: Listing[] = []
  const processedLinks = new Set<string>()
  const processedAddresses = new Set<string>()

  for (const scrapedListing of scrapedListings) {
    const link = normalizeLink(scrapedListing.listing_link)
    const address = normalizeAddress(scrapedListing.address)

    // Skip duplicates within scraped data
    if (link && processedLinks.has(link)) {
      continue
    }
    if (address && processedAddresses.has(address)) {
      continue
    }

    let found = false
    let existingListing: Listing | undefined

    // Try to find existing listing by link
    if (link && existingByLink.has(link)) {
      existingListing = existingByLink.get(link)!
      found = true
    }
    // Try to find by address if link didn't match
    else if (address && existingByAddress.has(address)) {
      existingListing = existingByAddress.get(address)!
      found = true
    }

    if (found && existingListing) {
      // Check if data changed
      if (hasListingChanged(existingListing, scrapedListing)) {
        // Update with new data
        syncedListings.push(scrapedListing)
        stats.updated++
      } else {
        // Keep existing data (unchanged)
        syncedListings.push(existingListing)
        stats.unchanged++
      }
    } else {
      // New listing
      syncedListings.push(scrapedListing)
      stats.added++
    }

    if (link) processedLinks.add(link)
    if (address) processedAddresses.add(address)
  }

  // Find removed listings (in existing but not in scraped)
  const scrapedLinks = new Set(scrapedListings.map(l => normalizeLink(l.listing_link)).filter(Boolean))
  const scrapedAddresses = new Set(scrapedListings.map(l => normalizeAddress(l.address)).filter(Boolean))

  for (const existingListing of existingListings) {
    const link = normalizeLink(existingListing.listing_link)
    const address = normalizeAddress(existingListing.address)

    const linkExists = link && scrapedLinks.has(link)
    const addressExists = address && scrapedAddresses.has(address)

    if (!linkExists && !addressExists) {
      stats.removed++
    }
  }

  stats.duration = Math.round((Date.now() - startTime) / 1000)

  return { syncedListings, stats }
}

/**
 * Save synced listings to database
 */
function saveSyncedListings(listings: Listing[], stats: SyncStats): void {
  const jsonPath = path.join(process.cwd(), '..', 'forsalebyowner_listings.json')

  const outputData = {
    scrape_timestamp: stats.timestamp,
    total_listings: listings.length,
    sync_stats: {
      scraped: stats.scraped,
      added: stats.added,
      updated: stats.updated,
      removed: stats.removed,
      unchanged: stats.unchanged,
      duration_seconds: stats.duration
    },
    listings: listings
  }

  fs.writeFileSync(jsonPath, JSON.stringify(outputData, null, 2), 'utf-8')
}

/**
 * Main sync function - refreshes listings automatically
 * Returns the scraped listings array for Supabase sync
 */
export async function refreshListingsAutomatically(): Promise<Listing[]> {
  console.log('🔄 Starting scraper...')

  try {
    // Run scraper to get fresh data from website
    const scrapedListings = await runScraper()

    console.log(`✅ Scraper complete: ${scrapedListings.length} listings scraped`)

    return scrapedListings

  } catch (error: any) {
    console.error('❌ Scraper failed:', error.message)
    throw error
  }
}


