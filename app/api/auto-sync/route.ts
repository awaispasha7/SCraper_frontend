import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { refreshListingsAutomatically } from '@/lib/scraper-sync'
import { syncListingsWithSupabase } from '@/lib/supabase-sync'

export async function POST() {
  try {
    console.log('🔄 Manual sync triggered via API')
    console.log('📋 Process: Scrape → Store in Database (Real-time)')
    console.log('💡 Listings will be stored in Supabase as they are scraped')
    
    // Step 1: Run scraper (with real-time storage enabled)
    // The Python scraper will send each listing to /api/listings/add as it scrapes
    console.log('🌐 Starting scraper with real-time storage...')
    console.log('   → Each listing will be stored in Supabase immediately')
    
    const scrapedListings = await refreshListingsAutomatically()
    console.log(`✅ Scraping complete: ${scrapedListings.length} listings processed`)
    console.log('💾 All listings have been stored in Supabase in real-time')
    
    // Step 2: Final sync to handle any edge cases (removed listings, metadata)
    // This ensures removed listings are marked and metadata is updated
    console.log('🔄 Running final sync to update metadata and mark removed listings...')
    const stats = await syncListingsWithSupabase(scrapedListings)
    console.log(`✅ Final sync complete: ${stats.added + stats.updated} listings in database`)
    
    return NextResponse.json({
      success: true,
      message: 'Listings scraped and stored successfully (real-time)',
      timestamp: stats.timestamp,
      stats: {
        scraped: stats.scraped,
        added: stats.added,
        updated: stats.updated,
        removed: stats.removed,
        unchanged: stats.unchanged,
        total: stats.scraped,
        duration_seconds: stats.duration
      }
    })
  } catch (error: any) {
    console.error('❌ Error syncing listings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to sync listings',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Return status of last sync
  try {
    const jsonPath = path.join(process.cwd(), '..', 'forsalebyowner_listings.json')
    
    if (fs.existsSync(jsonPath)) {
      const stats = fs.statSync(jsonPath)
      const fileContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
      
      return NextResponse.json({
        lastSync: fileContent.scrape_timestamp || stats.mtime.toISOString(),
        fileExists: true,
        listingsCount: fileContent.listings?.length || fileContent.total_listings || 0,
        syncStats: fileContent.sync_stats || null
      })
    } else {
      return NextResponse.json({
        lastSync: null,
        fileExists: false,
        listingsCount: 0,
        syncStats: null
      })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get sync status', details: error.message },
      { status: 500 }
    )
  }
}


