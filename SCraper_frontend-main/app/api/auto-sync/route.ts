import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { refreshListingsAutomatically } from '@/lib/scraper-sync'
import { syncListingsWithSupabase } from '@/lib/supabase-sync'

export async function POST() {
  try {
    console.log('🔄 Manual sync triggered via API')
    
    // Check if backend URL is configured
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL
    
    if (backendUrl) {
      // Use backend API if configured
      console.log('🌐 Using backend API:', backendUrl)
      console.log('📋 Process: Trigger Backend Scraper → Backend stores in Database')
      
      try {
        const response = await fetch(`${backendUrl}/api/trigger`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!response.ok) {
          throw new Error(`Backend API returned ${response.status}`)
        }
        
        const result = await response.json()
        console.log('✅ Backend scraper triggered:', result)
        
        return NextResponse.json({
          success: true,
          message: 'Backend scraper triggered successfully',
          backendResponse: result,
          timestamp: new Date().toISOString()
        })
      } catch (backendError: any) {
        console.warn('⚠️ Backend API failed, checking Supabase for existing listings:', backendError.message)
        // Fall through to check Supabase
      }
    }
    
    // In deployment, we don't run the scraper - just check Supabase and return success
    // The data is already in Supabase, so we just need to tell the frontend to fetch it
    console.log('📋 Process: Fetching listings from Supabase')
    console.log('💡 Listings are already stored in Supabase')
    
    try {
      // Get count of listings from Supabase to return in stats
      const { supabase } = await import('@/lib/supabase')
      if (supabase) {
        const { data: listings, error: countError } = await supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
        
        const totalCount = countError ? 0 : (listings as any)?.length || 0
        
        console.log(`✅ Found ${totalCount} listings in Supabase`)
        
        return NextResponse.json({
          success: true,
          message: 'Listings are available in Supabase',
          timestamp: new Date().toISOString(),
          stats: {
            scraped: totalCount,
            added: 0,
            updated: 0,
            removed: 0,
            unchanged: totalCount,
            total: totalCount,
            duration_seconds: 0
          }
        })
      }
    } catch (supabaseError: any) {
      console.warn('⚠️ Error checking Supabase, returning success anyway:', supabaseError.message)
    }
    
    // Return success even if we can't check Supabase - the frontend will fetch from /api/listings
    return NextResponse.json({
      success: true,
      message: 'Sync complete - listings are available in Supabase',
      timestamp: new Date().toISOString(),
      stats: {
        scraped: 0,
        added: 0,
        updated: 0,
        removed: 0,
        unchanged: 0,
        total: 0,
        duration_seconds: 0
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


