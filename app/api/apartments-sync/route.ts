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
          throw new Error(`Backend API returned ${response.status}`)
        }
        
        const result = await response.json()
        console.log('✅ Backend apartments scraper triggered:', result)
        
        return NextResponse.json({
          success: true,
          message: 'Backend apartments scraper triggered successfully',
          backendResponse: result,
          timestamp: new Date().toISOString()
        })
      } catch (backendError: any) {
        console.warn('⚠️ Backend API failed, running local scraper:', backendError.message)
        // Fall through to run local scraper
      }
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
          const { data: listings, error: countError } = await supabase
            .from('apartments_frbo_chicago')
            .select('id', { count: 'exact', head: true })
          
          const totalCount = countError ? 0 : (listings as any)?.length || 0
          
          console.log(`⚠️ Scraper failed, but found ${totalCount} existing listings in Supabase`)
          
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
            warning: scraperError.message
          })
        }
      } catch (supabaseError: any) {
        console.warn('⚠️ Error checking Supabase:', supabaseError.message)
      }
      
      // Return error if both scraper and Supabase check failed
      return NextResponse.json(
        { 
          error: 'Failed to sync apartments listings',
          details: scraperError.message 
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

