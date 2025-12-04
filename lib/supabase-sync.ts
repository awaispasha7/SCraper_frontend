/**
 * Supabase Sync Service
 * Handles syncing listings with Supabase database
 * Tracks active/removed status and preserves history
 */

import { supabaseAdmin } from './supabase'

interface Listing {
  address: string | null
  price: string | null
  beds: string | null
  baths: string | null
  square_feet: string | null
  listing_link: string
  time_of_post: string | null
}

interface SyncStats {
  scraped: number
  added: number
  updated: number
  removed: number
  unchanged: number
  timestamp: string
  duration: number
}

/**
 * Check if listing is in Chicago (exclude suburbs)
 */
function isChicagoListing(listing: Listing): boolean {
  const address = (listing.address || '').toLowerCase()
  
  // Exclude known suburbs
  const suburbs = [
    'harwood heights',
    'norridge',
    'merrionette park',
    'alsip',
    'riverdale',
    'rosemont',
    'park ridge'
  ]
  
  if (suburbs.some(suburb => address.includes(suburb))) {
    return false
  }
  
  // Must contain 'chicago'
  return address.includes('chicago')
}

/**
 * Normalize listing link for comparison
 */
function normalizeLink(link: string | null): string {
  if (!link) return ''
  const match = link.match(/\/listing\/([^\/]+)/)
  if (match) {
    return match[1].toLowerCase().trim()
  }
  return link.toLowerCase().trim()
}

/**
 * Sync scraped listings with Supabase
 */
export async function syncListingsWithSupabase(
  scrapedListings: Listing[]
): Promise<SyncStats> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not initialized. Check SUPABASE_SERVICE_ROLE_KEY in .env')
  }

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

  // Filter to Chicago-only listings
  const chicagoListings = scrapedListings.filter(isChicagoListing)

  // Step 1: Get all existing listings from Supabase
  const { data: existingListings, error: fetchError } = await supabaseAdmin
    .from('listings')
    .select('*')

  if (fetchError) {
    throw new Error(`Failed to fetch existing listings: ${fetchError.message}`)
  }

  const existing = existingListings || []

  // Step 2: Create maps for quick lookup
  const existingByLink = new Map<string, any>()
  for (const listing of existing) {
    const link = normalizeLink(listing.listing_link)
    if (link) {
      existingByLink.set(link, listing)
    }
  }

  // Step 3: Process scraped listings (add/update)
  const scrapedLinks = new Set<string>()
  const processedLinks = new Set<string>()

  for (const listing of chicagoListings) {
    const link = normalizeLink(listing.listing_link)
    if (!link || processedLinks.has(link)) {
      continue // Skip duplicates
    }
    processedLinks.add(link)
    scrapedLinks.add(link)

    const existingListing = existingByLink.get(link)

    if (existingListing) {
      // Check if data changed
      const hasChanged = 
        existingListing.address !== listing.address ||
        existingListing.price !== listing.price ||
        existingListing.beds !== listing.beds ||
        existingListing.baths !== listing.baths ||
        existingListing.square_feet !== listing.square_feet ||
        existingListing.time_of_post !== listing.time_of_post

      if (hasChanged) {
        // Update existing listing
        const { error: updateError } = await supabaseAdmin
          .from('listings')
          .update({
            address: listing.address,
            price: listing.price,
            beds: listing.beds,
            baths: listing.baths,
            square_feet: listing.square_feet,
            time_of_post: listing.time_of_post,
            is_active: true,
            is_chicago: true,
            removed_at: null,
            scrape_timestamp: stats.timestamp,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingListing.id)

        if (updateError) {
          console.error(`❌ Error updating listing ${link}:`, updateError.message)
        } else {
          stats.updated++
        }
      } else {
        // Ensure it's marked as active
        if (!existingListing.is_active) {
          await supabaseAdmin
            .from('listings')
            .update({
              is_active: true,
              removed_at: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingListing.id)
        }
        stats.unchanged++
      }
    } else {
      // New listing - insert
      const { error: insertError } = await supabaseAdmin
        .from('listings')
        .insert({
          address: listing.address,
          price: listing.price,
          beds: listing.beds,
          baths: listing.baths,
          square_feet: listing.square_feet,
          listing_link: listing.listing_link,
          time_of_post: listing.time_of_post,
          is_active: true,
          is_chicago: true,
          scrape_timestamp: stats.timestamp,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (insertError) {
        console.error(`❌ Error inserting listing ${link}:`, insertError.message)
      } else {
        stats.added++
      }
    }
  }

  // Step 4: Mark removed listings (in Supabase but not in scraped data)
  for (const existingListing of existing) {
    const link = normalizeLink(existingListing.listing_link)
    
    // Only mark as removed if it was active and is a Chicago listing
    if (existingListing.is_active && existingListing.is_chicago && link) {
      if (!scrapedLinks.has(link)) {
        // Listing no longer on website - mark as removed
        const { error: updateError } = await supabaseAdmin
          .from('listings')
          .update({
            is_active: false,
            removed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingListing.id)

        if (updateError) {
          console.error(`❌ Error marking listing as removed ${link}:`, updateError.message)
        } else {
          stats.removed++
        }
      }
    }
  }

  // Step 5: Save sync metadata
  const { error: metadataError } = await supabaseAdmin
    .from('scrape_metadata')
    .upsert({
      scrape_timestamp: stats.timestamp,
      total_listings: chicagoListings.length,
      scraped: stats.scraped,
      added: stats.added,
      updated: stats.updated,
      removed: stats.removed,
      unchanged: stats.unchanged,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
      last_updated: new Date().toISOString()
    }, {
      onConflict: 'scrape_timestamp'
    })

  if (metadataError) {
    console.warn('⚠️ Could not save metadata:', metadataError.message)
  }

  stats.duration = Math.round((Date.now() - startTime) / 1000)

  console.log(`✅ Sync complete: ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed, ${stats.unchanged} unchanged (${stats.duration}s)`)

  return stats
}

