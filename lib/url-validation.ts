/**
 * URL Validation Utilities
 * Validates URLs and detects platforms for scraper routing
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

export interface PlatformDetectionResult {
  platform: string | null
  table: string | null
  location: {
    city: string | null
    state: string | null
  }
  isValid: boolean
  error?: string
}

/**
 * Validate URL format
 */
export function validateUrlFormat(url: string): { isValid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { isValid: false, error: 'URL is required' }
  }

  const trimmedUrl = url.trim()

  if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
    return { isValid: false, error: 'URL must start with http:// or https://' }
  }

  try {
    new URL(trimmedUrl)
    return { isValid: true }
  } catch (e) {
    return { isValid: false, error: 'Invalid URL format' }
  }
}

/**
 * Detect platform from URL (client-side basic detection)
 * For full validation, use the backend API
 */
export function detectPlatformClientSide(url: string): string | null {
  const urlLower = url.toLowerCase()
  
  if (urlLower.includes('apartments.com')) return 'apartments.com'
  if (urlLower.includes('hotpads.com')) return 'hotpads'
  if (urlLower.includes('redfin.com')) return 'redfin'
  if (urlLower.includes('trulia.com')) return 'trulia'
  if (urlLower.includes('zillow.com')) {
    if (urlLower.includes('for-sale') || urlLower.includes('for_sale') || urlLower.includes('fsbo')) {
      return 'zillow_fsbo'
    }
    if (urlLower.includes('for-rent') || urlLower.includes('for_rent') || urlLower.includes('frbo')) {
      return 'zillow_frbo'
    }
    return 'zillow_fsbo' // Default to FSBO
  }
  if (urlLower.includes('forsalebyowner.com')) return 'fsbo'
  
  return null
}

/**
 * Validate URL against backend and detect platform
 */
export async function validateAndDetectPlatform(
  url: string,
  expectedPlatform?: string
): Promise<PlatformDetectionResult> {
  // First validate URL format
  const formatValidation = validateUrlFormat(url)
  if (!formatValidation.isValid) {
    return {
      platform: null,
      table: null,
      location: { city: null, state: null },
      isValid: false,
      error: formatValidation.error
    }
  }

  try {
    // Call backend to detect platform
    const response = await fetch(`${BACKEND_URL}/api/validate-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, expected_platform: expectedPlatform }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        platform: null,
        table: null,
        location: { city: null, state: null },
        isValid: false,
        error: errorData.error || 'Failed to validate URL'
      }
    }

    const data = await response.json()
    
    // If expected platform was provided, validate it matches
    if (expectedPlatform && data.platform !== expectedPlatform) {
      return {
        platform: data.platform,
        table: data.table,
        location: data.location || { city: null, state: null },
        isValid: false,
        error: `URL is for ${data.platform || 'unknown platform'}, but this page is for ${expectedPlatform}. Please use the correct page or paste the URL on the main page.`
      }
    }

    return {
      platform: data.platform || null,
      table: data.table || null,
      location: data.location || { city: null, state: null },
      isValid: data.platform !== null,
      error: data.platform === null ? 'Unknown or unsupported platform' : undefined
    }
  } catch (error: any) {
    return {
      platform: null,
      table: null,
      location: { city: null, state: null },
      isValid: false,
      error: error.message || 'Failed to connect to backend'
    }
  }
}

/**
 * Get default URL for a platform (for display purposes)
 */
export function getDefaultUrlForPlatform(platform: string): string {
  const defaults: Record<string, string> = {
    'apartments.com': 'https://www.apartments.com/chicago-il/for-rent-by-owner/',
    'hotpads': 'https://hotpads.com/chicago-il/apartments-for-rent',
    'redfin': 'https://www.redfin.com/county/733/IL/DuPage-County/for-sale-by-owner',
    'trulia': 'https://www.trulia.com/for_rent/Chicago,IL/',
    'zillow_fsbo': 'https://www.zillow.com/homes/for_sale/',
    'zillow_frbo': 'https://www.zillow.com/homes/for_rent/',
    'fsbo': 'https://www.forsalebyowner.com/search/list/chicago-illinois',
  }
  return defaults[platform] || ''
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: string | null): string {
  if (!platform) return 'Unknown'
  
  const names: Record<string, string> = {
    'apartments.com': 'Apartments.com',
    'hotpads': 'Hotpads',
    'redfin': 'Redfin',
    'trulia': 'Trulia',
    'zillow_fsbo': 'Zillow FSBO',
    'zillow_frbo': 'Zillow FRBO',
    'fsbo': 'ForSaleByOwner.com',
  }
  return names[platform] || platform
}

