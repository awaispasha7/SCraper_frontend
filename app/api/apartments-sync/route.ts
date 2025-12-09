import { NextResponse } from 'next/server'
import { refreshApartmentsListings } from '@/lib/apartments-scraper-sync'
import path from 'path'
import fs from 'fs'

export async function POST() {
  try {
    console.log('🔄 Manual apartments sync triggered via API')
    
    // Check if backend URL is configured
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL
    
    if (backendUrl) {
      // Use backend API if configured
      console.log('🌐 Using backend API:', backendUrl)
      console.log('📋 Process: Trigger Backend Scraper → Backend stores in Database')
      
      try {
        const response = await fetch(`${backendUrl}/api/trigger-apartments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Backend API returned ${response.status}: ${errorText}`)
        }
        
        const result = await response.json()
        console.log('✅ Backend apartments scraper triggered:', result)
        
        // Get current count from Supabase to return in stats
        let totalCount = 0
        try {
          const { supabase } = await import('@/lib/supabase')
          if (supabase) {
            const { count, error: countError } = await supabase
              .from('apartments_frbo_chicago')
              .select('*', { count: 'exact', head: true })
            
            totalCount = countError ? 0 : (count || 0)
          }
        } catch (supabaseError: any) {
          console.warn('⚠️ Error getting count from Supabase:', supabaseError.message)
        }
        
        return NextResponse.json({
          success: true,
          message: 'Backend apartments scraper triggered successfully. Scraper is running in the background.',
          backendResponse: result,
          timestamp: new Date().toISOString(),
          stats: {
            scraped: 0, // Scraper is running, count will update as it progresses
            added: 0,
            updated: 0,
            removed: 0,
            unchanged: totalCount,
            total: totalCount,
            duration_seconds: 0
          }
        })
      } catch (backendError: any) {
        console.error('❌ Backend API failed:', backendError.message)
        console.warn('⚠️ Falling back to local scraper (if available)')
        // Fall through to run local scraper or return error
      }
    } else {
      console.warn('⚠️ NEXT_PUBLIC_BACKEND_URL not configured. Cannot use backend API.')
      console.warn('💡 Set NEXT_PUBLIC_BACKEND_URL environment variable to use backend scraper.')
    }
    
    // Run the scraper locally
    console.log('📋 Process: Running local scraper → Upload to Supabase')
    
    try {
      const result = await refreshApartmentsListings()
      
      return NextResponse.json({
        success: true,
        message: 'Apartments scraper completed and data uploaded to Supabase',
        timestamp: result.timestamp,
        stats: {
          scraped: result.scraped,
          added: result.uploaded,
          updated: 0,
          removed: 0,
          unchanged: 0,
          total: result.uploaded,
          duration_seconds: 0
        }
      })
    } catch (scraperError: any) {
      console.error('❌ Local scraper failed:', scraperError.message)
      
      // Fallback: Check Supabase for existing listings
      try {
        const { supabase } = await import('@/lib/supabase')
        if (supabase) {
          const { count, error: countError } = await supabase
            .from('apartments_frbo_chicago')
            .select('*', { count: 'exact', head: true })
          
          const totalCount = countError ? 0 : (count || 0)
          
          console.log(`⚠️ Scraper failed, but found ${totalCount} existing listings in Supabase`)
          
          // Provide helpful error message
          let errorMessage = scraperError.message
          if (scraperError.message.includes('Scraper directory not found')) {
            errorMessage = 'Local scraper not available in deployment. Please configure NEXT_PUBLIC_BACKEND_URL to use backend scraper.'
          }
          
          return NextResponse.json({
            success: true,
            message: 'Scraper failed, but listings are available in Supabase',
            timestamp: new Date().toISOString(),
            stats: {
              scraped: totalCount,
              added: 0,
              updated: 0,
              removed: 0,
              unchanged: totalCount,
              total: totalCount,
              duration_seconds: 0
            },
            warning: errorMessage
          })
        }
      } catch (supabaseError: any) {
        console.warn('⚠️ Error checking Supabase:', supabaseError.message)
      }
      
      // Return error if both scraper and Supabase check failed
      let errorMessage = scraperError.message
      if (scraperError.message.includes('Scraper directory not found')) {
        errorMessage = 'Local scraper not available. Please configure NEXT_PUBLIC_BACKEND_URL environment variable to use the backend scraper.'
      }
      
      return NextResponse.json(
        { 
          error: 'Failed to sync apartments listings',
          details: errorMessage 
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('❌ Error syncing apartments listings:', error)
    return NextResponse.json(
      { 
        error: 'Failed to sync apartments listings',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Return status of last sync
  try {
    // Get the workspace root (one level up from SCraper_frontend-main)
    const workspaceRoot = path.resolve(process.cwd(), '..')
    const csvPath = path.join(workspaceRoot, 'apartments', 'apartments', 'output', 'apartments_frbo_chicago-il.csv')
    
    if (fs.existsSync(csvPath)) {
      const stats = fs.statSync(csvPath)
      
      return NextResponse.json({
        lastSync: stats.mtime.toISOString(),
        fileExists: true,
        listingsCount: 0 // Would need to read CSV to get count
      })
    } else {
      return NextResponse.json({
        lastSync: null,
        fileExists: false,
        listingsCount: 0
      })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to get sync status', details: error.message },
      { status: 500 }
    )
  }
}

