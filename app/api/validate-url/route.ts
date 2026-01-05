import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:8080'

export const dynamic = 'force-dynamic'

/**
 * Validate URL and detect platform
 * This endpoint validates URLs using the backend URL detector
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, expected_platform } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Validate URL format
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'URL must start with http:// or https://' },
        { status: 400 }
      )
    }

    // Call backend validation endpoint
    try {
      const response = await fetch(`${BACKEND_URL}/api/validate-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, expected_platform: expected_platform }),
      })

      if (response.ok) {
        const data = await response.json()
        return NextResponse.json(data)
      } else {
        const errorData = await response.json().catch(() => ({}))
        return NextResponse.json(errorData, { status: response.status })
      }
    } catch (error: any) {
      // Fallback to simple client-side detection if backend is unavailable
      console.warn('Backend validation failed, using client-side detection:', error.message)
      
      const urlLower = url.toLowerCase()
      let platform: string | null = null
      let table: string | null = null
      
      if (urlLower.includes('apartments.com')) {
        platform = 'apartments.com'
        table = 'apartments_frbo'
      } else if (urlLower.includes('hotpads.com')) {
        platform = 'hotpads'
        table = 'hotpads_listings'
      } else if (urlLower.includes('redfin.com')) {
        platform = 'redfin'
        table = 'redfin_listings'
      } else if (urlLower.includes('trulia.com')) {
        platform = 'trulia'
        table = 'trulia_listings'
      } else if (urlLower.includes('zillow.com')) {
        if (urlLower.includes('for-sale') || urlLower.includes('for_sale') || urlLower.includes('fsbo')) {
          platform = 'zillow_fsbo'
          table = 'zillow_fsbo_listings'
        } else if (urlLower.includes('for-rent') || urlLower.includes('for_rent') || urlLower.includes('frbo')) {
          platform = 'zillow_frbo'
          table = 'zillow_frbo_listings'
        } else {
          platform = 'zillow_fsbo'
          table = 'zillow_fsbo_listings'
        }
      } else if (urlLower.includes('forsalebyowner.com')) {
        platform = 'fsbo'
        table = 'listings'
      }

      // Validate against expected platform if provided
      if (expected_platform && platform !== expected_platform) {
        return NextResponse.json({
          platform,
          table,
          location: { city: null, state: null },
          isValid: false,
          error: `URL is for ${platform || 'unknown platform'}, but expected ${expected_platform}`
        }, { status: 400 })
      }

      return NextResponse.json({
        platform,
        table,
        location: { city: null, state: null },
        isValid: platform !== null,
        error: platform === null ? 'Unknown or unsupported platform' : undefined
      })
    }
  } catch (error: any) {
    console.error('Error validating URL:', error)
    return NextResponse.json(
      { error: 'Failed to validate URL', details: error.message },
      { status: 500 }
    )
  }
}
