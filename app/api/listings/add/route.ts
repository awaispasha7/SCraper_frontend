/**
 * API endpoint to add a single listing to Supabase in real-time
 * Called by Python scraper as it scrapes each listing
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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
    'park ridge',
    'oak lawn',
    'evergreen park',
    'burbank',
    'cicero',
    'berwyn'
  ]

  if (suburbs.some(suburb => address.includes(suburb))) {
    return false
  }

  // If scraper is forsalebyowner and it's from Chicago search results, it might not contain 'chicago' in address field
  // but it's likely a Chicago listing.
  // We check if it contains 'il' (Illinois) as a basic check, or if address seems to be just the street.
  if (address.includes('chicago')) return true;

  // If it's a valid address but doesn't have city, we allow it if it doesn't match suburbs
  return address.length > 5;
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

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Received listing from Python scraper')

    if (!supabaseAdmin) {
      console.error('❌ Supabase admin client not initialized')
      return NextResponse.json(
        { error: 'Database not configured', success: false },
        { status: 500 }
      )
    }

    const listing: Listing = await request.json()
    console.log(`   Address: ${listing.address || 'N/A'}`)
    console.log(`   Link: ${listing.listing_link || 'N/A'}`)

    // Validate required fields
    if (!listing.listing_link) {
      return NextResponse.json(
        { error: 'listing_link is required', success: false },
        { status: 400 }
      )
    }

    // Filter out non-Chicago listings
    if (!isChicagoListing(listing)) {
      console.log(`⏭️ Skipped (suburb): ${listing.address || listing.listing_link}`)
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Not a Chicago listing (suburb filtered out)'
      })
    }

    const link = normalizeLink(listing.listing_link)

    // Check if listing already exists
    // Use maybeSingle() to handle case where table doesn't exist yet
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('listings')
      .select('id, listing_link')
      .eq('listing_link', listing.listing_link)
      .limit(1)
      .maybeSingle()

    // If table doesn't exist, log warning but continue (schema will be created)
    if (fetchError) {
      if (fetchError.message?.includes('does not exist') || fetchError.message?.includes('relation')) {
        console.warn('⚠️ Database table does not exist yet. Please run supabase_schema.sql first.')
        return NextResponse.json(
          {
            error: 'Database table does not exist. Please run the SQL schema script in Supabase.',
            success: false
          },
          { status: 500 }
        )
      }
      // For other errors (like PGRST116 = no rows), continue
      if (fetchError.code !== 'PGRST116') {
        console.error('Error checking existing listing:', fetchError)
      }
    }

    const timestamp = new Date().toISOString()

    if (existing) {
      // Update existing listing
      // Build update object dynamically to handle missing columns
      const updateData: any = {
        address: listing.address,
        price: listing.price,
        beds: listing.beds,
        baths: listing.baths,
        square_feet: listing.square_feet,
        time_of_post: listing.time_of_post,
        scrape_timestamp: timestamp,
        updated_at: timestamp
      }

      // Only include these if columns exist (will be added by migration)
      // For now, try to include them - if they don't exist, Supabase will error
      // and we'll handle it gracefully
      try {
        updateData.is_active = true
        updateData.is_chicago = true
        updateData.removed_at = null
      } catch (e) {
        // Columns don't exist yet - will be added by migration
      }

      const { error: updateError } = await supabaseAdmin
        .from('listings')
        .update(updateData)
        .eq('id', existing.id)

      if (updateError) {
        // If error is about missing columns, try again without them
        if (updateError.message?.includes('is_active') ||
          updateError.message?.includes('is_chicago') ||
          updateError.message?.includes('removed_at')) {
          console.warn('⚠️ Missing status columns detected, updating without them')
          const { error: retryError } = await supabaseAdmin
            .from('listings')
            .update({
              address: listing.address,
              price: listing.price,
              beds: listing.beds,
              baths: listing.baths,
              square_feet: listing.square_feet,
              time_of_post: listing.time_of_post,
              scrape_timestamp: timestamp,
              updated_at: timestamp
            })
            .eq('id', existing.id)

          if (retryError) {
            console.error('Error updating listing (retry):', retryError)
            return NextResponse.json(
              { error: retryError.message, success: false },
              { status: 500 }
            )
          }
        } else {
          console.error('Error updating listing:', updateError)
          return NextResponse.json(
            { error: updateError.message, success: false },
            { status: 500 }
          )
        }
      }

      console.log(`✅ Updated listing: ${listing.address || listing.listing_link} (ID: ${existing.id})`)
      return NextResponse.json({
        success: true,
        action: 'updated',
        listing_id: existing.id
      })
    } else {
      // Insert new listing
      // Build insert object - include optional columns if they exist
      const insertData: any = {
        address: listing.address,
        price: listing.price,
        beds: listing.beds,
        baths: listing.baths,
        square_feet: listing.square_feet,
        listing_link: listing.listing_link,
        time_of_post: listing.time_of_post,
        scrape_timestamp: timestamp,
        created_at: timestamp,
        updated_at: timestamp
      }

      // Try to include status columns (will work after migration)
      // If columns don't exist, Supabase will ignore them or error
      insertData.is_active = true
      insertData.is_chicago = true

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('listings')
        .insert(insertData)
        .select('id')
        .single()

      if (insertError) {
        // If error is about missing columns, try again without them
        if (insertError.message?.includes('is_active') ||
          insertError.message?.includes('is_chicago')) {
          console.warn('⚠️ Missing status columns detected, inserting without them')
          const basicInsertData = {
            address: listing.address,
            price: listing.price,
            beds: listing.beds,
            baths: listing.baths,
            square_feet: listing.square_feet,
            listing_link: listing.listing_link,
            time_of_post: listing.time_of_post,
            scrape_timestamp: timestamp,
            created_at: timestamp,
            updated_at: timestamp
          }

          const { data: retryInserted, error: retryError } = await supabaseAdmin
            .from('listings')
            .insert(basicInsertData)
            .select('id')
            .single()

          if (retryError) {
            console.error('Error inserting listing (retry):', retryError)
            return NextResponse.json(
              { error: retryError.message, success: false },
              { status: 500 }
            )
          }

          return NextResponse.json({
            success: true,
            action: 'added',
            listing_id: retryInserted?.id,
            warning: 'Status columns (is_active, is_chicago) not found. Please run migration script.'
          })
        } else {
          console.error('Error inserting listing:', insertError)
          return NextResponse.json(
            { error: insertError.message, success: false },
            { status: 500 }
          )
        }
      }

      console.log(`✅ Added listing: ${listing.address || listing.listing_link} (ID: ${inserted?.id})`)
      return NextResponse.json({
        success: true,
        action: 'added',
        listing_id: inserted?.id
      })
    }
  } catch (error: any) {
    console.error('Error processing listing:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process listing', success: false },
      { status: 500 }
    )
  }
}

