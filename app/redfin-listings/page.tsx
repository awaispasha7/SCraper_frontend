'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AuthGuard from '@/app/components/AuthGuard'
import EnrichmentBadge from '@/app/components/EnrichmentBadge'
import UrlScraperInput from '@/app/components/UrlScraperInput'
import { getDefaultUrlForPlatform } from '@/lib/url-validation'
import { createClient } from '@/lib/supabase-client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

interface RedfinListing {
  id: number
  address: string
  price: string | number
  beds: string | number
  baths: string | number
  square_feet: string | number
  listing_link: string
  property_type: string
  county: string
  lot_acres: string | number
  owner_name?: string | null
  mailing_address?: string | null
  emails?: string | string[] | null
  phones?: string | string[] | null
  source: string
  scrape_date: string
  enrichment_status?: string | null
}

interface RedfinListingsData {
  total_listings: number
  scrape_date: string
  source: string
  listings: RedfinListing[]
}

function RedfinListingsPageContent() {
  const router = useRouter()
  // Initialize data from sessionStorage if available (for navigation persistence)
  const [data, setData] = useState<RedfinListingsData | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('redfinListingsData')
      if (cached) {
        try {
          return JSON.parse(cached)
        } catch (e) {
          return null
        }
      }
    }
    return null
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isStartingScraper, setIsStartingScraper] = useState(false)
  const [searchQuery, setSearchQuery] = useState('') // Search query for filtering listings
  const [currentPage, setCurrentPage] = useState(1) // Current page number
  const listingsPerPage = 20 // Listings per page

  // Handle starting scraper with default URL
  const handleStartScrapingWithDefault = async () => {
    const defaultUrl = getDefaultUrlForPlatform('redfin')
    if (!defaultUrl) {
      setError('No default URL configured')
      return
    }

    setIsStartingScraper(true)
    try {
      const response = await fetch(`${BACKEND_URL}/api/trigger-from-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: defaultUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start scraper')
      }

      // Success - refresh listings after a delay
      setTimeout(() => fetchListings(), 5000)
    } catch (error: any) {
      setError(error.message || 'Failed to start scraper')
    } finally {
      setIsStartingScraper(false)
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()

      // Set flag to prevent auto-redirect on login page
      localStorage.setItem('justLoggedOut', 'true')

      // Sign out from Supabase
      await supabase.auth.signOut()

      // Clear all auth-related data
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')

      // Wait a moment to ensure session is cleared
      await new Promise(resolve => setTimeout(resolve, 200))

      // Redirect to login page
      window.location.href = '/login'
    } catch (err) {
      // Still redirect even if logout fails
      localStorage.setItem('justLoggedOut', 'true')
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')
      window.location.href = '/login'
    }
  }

  const handleDownload = (listing: RedfinListing) => {
    // Helper to normalize array data (handles arrays, JSON strings, or single values)
    const normalizeArrayData = (value: any): string[] => {
      if (!value || value === 'null' || value === 'None' || value === '') return []

      // Handle arrays
      if (Array.isArray(value)) {
        // Flatten nested arrays and filter out empty values
        const flattened: string[] = []
        const flatten = (arr: any[]): void => {
          for (const item of arr) {
            if (Array.isArray(item)) {
              flatten(item)
            } else if (item !== null && item !== undefined) {
              // Convert to string - handle numbers properly (prevent scientific notation)
              let str = ''
              if (typeof item === 'number') {
                // For phone numbers stored as numbers, convert to string without scientific notation
                // Check if it's a large integer (likely a phone number)
                if (Number.isInteger(item) && item > 0) {
                  // Convert large integers to string without scientific notation
                  // Use BigInt for very large numbers to prevent precision loss
                  if (item > Number.MAX_SAFE_INTEGER) {
                    str = BigInt(item).toString()
                  } else {
                    // For regular integers, convert directly - no scientific notation
                    str = item.toString()
                  }
                } else {
                  str = String(item)
                }
              } else {
                str = String(item)
              }
              const trimmed = str.trim()
              if (trimmed && trimmed !== '' && trimmed !== 'null' && trimmed !== 'None') {
                flattened.push(trimmed)
              }
            }
          }
        }
        flatten(value)
        return flattened
      }

      // Handle strings
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return []

        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) {
            return normalizeArrayData(parsed) // Recursively handle nested arrays
          }
          // If parsed to a single value, return as array
          return [String(parsed).trim()].filter(v => v)
        } catch (e) {
          // Not JSON, check if it's comma-separated
          if (trimmed.includes(',')) {
            return trimmed.split(',').map(v => v.trim()).filter(v => v)
          }
          // Single string value
          return [trimmed]
        }
      }

      // Handle numbers or other types - convert to string array
      const str = String(value).trim()
      return str ? [str] : []
    }

    // Escape CSV values properly for Excel compatibility
    // CRITICAL: Always quote arrays and values with commas to prevent column misalignment
    const escapeCSV = (value: string | string[] | number | null | undefined, isArrayField: boolean = false): string => {
      // Handle null, undefined, or empty values
      if (value === null || value === undefined || value === '' || value === 'null' || value === 'None' || value === 'No email addresses found' || value === 'no email found' || value === 'no data') {
        return '' // Return empty string
      }

      // For array fields (emails/phones), normalize and ALWAYS quote
      if (isArrayField) {
        const normalized = normalizeArrayData(value)
        if (normalized.length === 0) return ''
        // Join with comma separator (,) - user requested comma separation
        // CRITICAL: Must quote the entire result so Excel treats commas as part of the value, not column separators
        const joined = normalized.join(',')
        // Convert to string and handle special characters
        let str = String(joined).trim().replace(/\n/g, ' ').replace(/\r/g, '')
        if (!str) return ''
        // ALWAYS quote array values to prevent Excel from splitting on commas
        // Add a leading tab character to force Excel to treat the cell as text
        // This prevents Excel from trying to calculate or parse numbers (especially phone numbers)
        // The tab character is invisible but forces text mode in Excel
        str = '\t' + str
        return `"${str.replace(/"/g, '""')}"`
      }

      // Handle strings
      const str = String(value).trim()
      if (!str || str === '') return ''

      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Prepare CSV data with all Supabase fields for Redfin
    const headers = ['address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'county', 'lot_acres', 'owner_name', 'mailing_address', 'emails', 'phones', 'scrape_date']
    const rowData = [
      escapeCSV(listing.address),
      escapeCSV(listing.price),
      escapeCSV(listing.beds),
      escapeCSV(listing.baths),
      escapeCSV(listing.square_feet),
      escapeCSV(listing.listing_link),
      escapeCSV(listing.property_type),
      escapeCSV(listing.county),
      escapeCSV(listing.lot_acres),
      escapeCSV(listing.owner_name),
      escapeCSV(listing.mailing_address),
      escapeCSV(listing.emails, true), // Mark as array field
      escapeCSV(listing.phones, true), // Mark as array field
      escapeCSV(listing.scrape_date)
    ]

    const csvData = [headers.join(','), rowData.join(',')].join('\n')

    // Create blob with UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })

    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Generate filename from address
    const addressStr = listing.address ? String(listing.address).replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'listing'
    const filename = `redfin_${addressStr}_${listing.id || Date.now()}.csv`
    link.setAttribute('download', filename)

    // Trigger download
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  useEffect(() => {
    // Disable automatic scroll restoration
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
    }

    // Check if we're returning from owner-info page
    const returningFromOwnerInfo = typeof window !== 'undefined' &&
      (sessionStorage.getItem('returningFromOwnerInfo') || sessionStorage.getItem('preventScrollRestore'))

    // If returning from owner-info AND we have cached data, use it and don't fetch
    if (returningFromOwnerInfo && data && data.listings && data.listings.length > 0) {
      // Use cached data, don't fetch
      setLoading(false)
      return
    }

    // Only fetch if we don't have data OR if we're not returning from owner-info
    if (!data || !data.listings || data.listings.length === 0) {
      fetchListings()
    } else if (!returningFromOwnerInfo) {
      // Have data but not returning from owner-info, fetch fresh data in background
      fetchListings()
    }
  }, [])

  // Restore scroll position after data loads
  useEffect(() => {
    if (!data || !data.listings || data.listings.length === 0) return

    // Restore scroll position when returning from owner-info page
    if (typeof window !== 'undefined') {
      const savedScrollPosition = sessionStorage.getItem('listingScrollPosition')
      const returningFromOwnerInfo = sessionStorage.getItem('returningFromOwnerInfo')
      const preventScrollRestore = sessionStorage.getItem('preventScrollRestore')
      const sourcePage = sessionStorage.getItem('sourcePage')

      // Only restore if we're returning from owner-info and on the correct page
      if (savedScrollPosition && (returningFromOwnerInfo || preventScrollRestore) && sourcePage === 'redfin-listings') {
        const scrollPos = parseInt(savedScrollPosition, 10)

        // Wait for DOM to be ready and content to render
        const restoreScroll = () => {
          window.scrollTo({ top: scrollPos, behavior: 'auto' })
        }

        // Try multiple times to ensure it works
        setTimeout(restoreScroll, 50)
        setTimeout(restoreScroll, 100)
        setTimeout(restoreScroll, 200)
        setTimeout(restoreScroll, 500)

        // Clear the flags after restoring
        setTimeout(() => {
          sessionStorage.removeItem('returningFromOwnerInfo')
          sessionStorage.removeItem('preventScrollRestore')
          sessionStorage.removeItem('listingScrollPosition')
          sessionStorage.removeItem('sourcePage')
        }, 600)
      }
    }
  }, [data])

  const fetchListings = async () => {
    try {
      // Check if we're returning from owner-info - if so, use cached data and don't fetch
      const returningFromOwnerInfo = typeof window !== 'undefined' &&
        (sessionStorage.getItem('returningFromOwnerInfo') || sessionStorage.getItem('preventScrollRestore'))

      if (returningFromOwnerInfo && data && data.listings && data.listings.length > 0) {
        // Use cached data, don't fetch
        setLoading(false)
        return
      }

      // Don't set loading to true if we already have data (prevents clearing during navigation)
      const hasExistingData = data && data.listings && data.listings.length > 0
      if (!hasExistingData) {
        setLoading(true)
      }
      setError(null)

      // Add timeout for fetch request - reduced to 10 seconds for faster feedback
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch('/api/redfin-listings?' + new Date().getTime(), {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
        },
        // Add priority hint for faster loading
        priority: 'high'
      } as RequestInit)

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json()
        // Keep existing data if available
        if (!hasExistingData) {
          throw new Error(errorData.error || 'Failed to fetch listings')
        }
        return
      }

      const result = await response.json()

      // Ensure all numeric fields are strings for consistent display
      const normalizedResult = {
        ...result,
        listings: result.listings.map((listing: any) => ({
          ...listing,
          price: listing.price !== null && listing.price !== undefined ? String(listing.price) : listing.price,
          beds: listing.beds !== null && listing.beds !== undefined ? String(listing.beds) : listing.beds,
          baths: listing.baths !== null && listing.baths !== undefined ? String(listing.baths) : listing.baths,
          square_feet: listing.square_feet !== null && listing.square_feet !== undefined ? String(listing.square_feet) : listing.square_feet,
        }))
      }

      setData(normalizedResult)

      // Cache data in sessionStorage for navigation persistence
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('redfinListingsData', JSON.stringify(normalizedResult))
        } catch (e) {
          // Ignore storage errors
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.')
      } else {
        setError(err.message || 'Failed to load listings')
      }
      console.error('Error fetching Redfin listings:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: string | number | null | undefined): string => {
    // Handle null, undefined, empty string, or string 'null'/'None'
    if (price === null || price === undefined || price === '' || price === 'null' || price === 'None') return 'Price on Request'

    // Handle number 0
    if (typeof price === 'number' && price === 0) return 'Price on Request'

    let cleanPrice = String(price).trim()
    if (!cleanPrice || cleanPrice === '') return 'Price on Request'

    if (/^\$[\d,]+$/.test(cleanPrice)) {
      return cleanPrice
    }

    cleanPrice = cleanPrice.replace(/[^\d,]/g, '')

    if (cleanPrice && /^\d+/.test(cleanPrice)) {
      const numStr = cleanPrice.replace(/,/g, '')
      const num = parseInt(numStr)
      if (!isNaN(num) && num > 0) {
        return `$${num.toLocaleString('en-US')}`
      }
    }

    return 'Price on Request'
  }

  const formatNumber = (value: string | number | null | undefined): string => {
    // Handle null, undefined, empty string, or string 'null'/'None'
    if (value === null || value === undefined || value === '' || value === 'null' || value === 'None') return 'N/A'

    // Handle number 0
    if (typeof value === 'number' && value === 0) return '0'

    const str = String(value).trim()
    if (!str || str === '') return 'N/A'

    if (/^\d+(\.\d+)?$/.test(str)) {
      return str
    }
    if (/^[\d,]+$/.test(str)) {
      return str
    }
    const numMatch = str.match(/[\d.]+/)
    if (numMatch) {
      return numMatch[0]
    }
    return 'N/A'
  }

  const formatSquareFeet = (sqft: string | number | null | undefined): string => {
    if (!sqft || sqft === 'null' || sqft === 'None' || sqft === '') return 'N/A'

    const str = String(sqft).trim()
    const num = parseFloat(str.replace(/,/g, ''))
    if (!isNaN(num) && num > 0) {
      return `${num.toLocaleString('en-US')} sqft`
    }
    return 'N/A'
  }

  // Robust Search Helpers (Ported from all-listings/page.tsx)
  const toSearchableString = (value: any): string => {
    if (value === null || value === undefined || value === '') return ''
    if (Array.isArray(value)) {
      return value.map(v => String(v || '')).filter(v => v).join(' ').toLowerCase()
    }
    const str = String(value).trim()
    if (str === '' || str === 'null' || str === 'undefined') return ''
    return str.replace(/,/g, ' ').toLowerCase()
  }

  const normalizePrice = (value: any): string => {
    if (value === null || value === undefined || value === '') return ''
    return String(value).toLowerCase().replace(/[^0-9]/g, '')
  }

  const matchesExactNumber = (value: any, searchNumber: string): boolean => {
    if (value === null || value === undefined || value === '' || !searchNumber) return false
    const normalizedValue = normalizePrice(value)
    return normalizedValue === searchNumber
  }

  const matchesPrice = (value: any, query: string, normalizedQuery: string): boolean => {
    if (value === null || value === undefined || value === '') return false
    const valueStr = String(value).toLowerCase().trim()
    const normalizedValue = normalizePrice(value)
    if (!normalizedQuery) return valueStr.includes(query)
    if (normalizedValue === normalizedQuery) return true
    if (valueStr.includes(query)) return true
    if (normalizedQuery.length < normalizedValue.length && normalizedValue.startsWith(normalizedQuery)) return true
    return false
  }

  // Filter listings based on search query
  const filteredListings = useMemo(() => {
    if (!data?.listings) return []
    if (!searchQuery.trim()) return data.listings

    const query = searchQuery.toLowerCase().trim()
    const normalizedQuery = normalizePrice(query)
    const searchNumber = query.match(/\d+/) ? query.match(/\d+/)![0] : ''
    const normalizedSearchNumber = normalizePrice(searchNumber)

    return data.listings.filter(listing => {
      return (
        // Address match
        (listing.address && listing.address.toLowerCase().includes(query)) ||
        // Price match
        (listing.price && matchesPrice(listing.price, query, normalizedQuery)) ||
        // Beds/Baths match
        (normalizedSearchNumber && (
          (listing.beds && matchesExactNumber(listing.beds, normalizedSearchNumber)) ||
          (listing.baths && matchesExactNumber(listing.baths, normalizedSearchNumber))
        )) ||
        // Square feet
        (listing.square_feet && matchesPrice(listing.square_feet, query, normalizedQuery)) ||
        // Details
        (listing.property_type && listing.property_type.toLowerCase().includes(query)) ||
        // Owner Details
        (listing.owner_name && listing.owner_name.toLowerCase().includes(query)) ||
        (listing.mailing_address && listing.mailing_address.toLowerCase().includes(query)) ||
        (listing.emails && toSearchableString(listing.emails).includes(query)) ||
        (listing.phones && toSearchableString(listing.phones).includes(query))
      )
    })
  }, [data?.listings, searchQuery])


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-900 text-xl font-semibold">Loading Redfin listings...</p>
          <p className="text-gray-600 text-sm mt-2">Please wait while we fetch the data</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center border border-gray-200">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={fetchListings}
            className="bg-blue-50 text-blue-700 border border-blue-300 px-8 py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 shadow-sm hover:shadow-md font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data || !data.listings || data.listings.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center border border-gray-200">
          <div className="text-gray-400 text-8xl mb-6">📭</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">No Listings Available</h2>
          <p className="text-gray-600 text-lg mb-8">
            No Redfin listings were found in the data file.
          </p>
          <button
            onClick={fetchListings}
            className="bg-blue-50 text-blue-700 border border-blue-300 px-8 py-4 rounded-lg hover:bg-blue-100 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <Image
                src="/redfin_logo.png"
                alt="Redfin Logo"
                width={60}
                height={60}
                className="rounded-lg shadow-md w-10 h-10 sm:w-[60px] sm:h-[60px]"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-1 sm:mb-2 tracking-tight">
                  Redfin Listings
                </h1>
                <p className="text-gray-600 text-sm sm:text-base lg:text-lg">
                  DuPage County, Illinois - For Sale By Owner
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 w-full md:w-auto">
              <div className="bg-red-50 rounded-lg px-4 sm:px-5 lg:px-6 py-2.5 sm:py-3 border border-red-200 flex-shrink-0">
                <div className="text-2xl sm:text-3xl font-bold text-red-700">{data.total_listings}</div>
                <div className="text-xs sm:text-sm text-red-600 font-medium">Total Listings</div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-1 md:flex-initial">
                <button
                  onClick={fetchListings}
                  className="bg-blue-50 text-blue-700 border border-blue-300 px-4 sm:px-5 lg:px-6 py-2.5 sm:py-2.5 lg:py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md text-sm sm:text-base flex-1 sm:flex-initial min-h-[44px]"
                >
                  <span className="text-base sm:text-lg">🔄</span>
                  <span>Refresh</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-gray-50 text-gray-700 border border-gray-300 px-4 sm:px-5 lg:px-6 py-2.5 sm:py-2.5 lg:py-3 rounded-lg hover:bg-gray-100 transition-all duration-200 flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md text-sm sm:text-base flex-1 sm:flex-initial min-h-[44px]"
                >
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
          
          {/* URL Scraper Input Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <h3 className="text-lg font-semibold text-red-900 mb-2">Scrape from URL</h3>
              <p className="text-sm text-red-700 mb-4">Enter a Redfin URL to scrape a specific location</p>
              <UrlScraperInput
                defaultUrl={getDefaultUrlForPlatform('redfin')}
                expectedPlatform="redfin"
                showDefaultValue={true}
                placeholder="https://www.redfin.com/county/733/IL/DuPage-County/for-sale-by-owner"
                onSuccess={(platform, url) => {
                  fetchListings()
                }}
                onError={(error) => {
                  console.error('URL validation error:', error)
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 -mt-2">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
                Search Redfin Listings
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  id="search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1) // Reset to first page
                  }}
                  placeholder="Search"
                  className="w-full pl-12 pr-4 py-3.5 rounded-lg border-2 border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition-all text-gray-800 placeholder-gray-400 bg-white focus:bg-white font-medium"
                />
              </div>
            </div>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
                className="px-6 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all duration-200 whitespace-nowrap text-sm mt-6 md:mt-0 shadow-sm hover:shadow-md"
              >
                Clear Search
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-4 text-sm text-gray-600">
              <span className="font-bold text-teal-600">{filteredListings.length}</span> listing{filteredListings.length !== 1 ? 's' : ''} found
              {filteredListings.length !== data?.listings?.length && (
                <span className="text-gray-500 ml-2">
                  (out of {data?.listings?.length || 0} total)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Available Listings Card */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:shadow-md transition-all duration-200">
            <div className="mb-4">
              <div className="text-5xl font-bold text-gray-900">
                {searchQuery ? filteredListings.length : (data?.total_listings || 0)}
              </div>
            </div>
            <div className="text-gray-600 text-sm font-semibold uppercase tracking-wide">
              {searchQuery ? 'Filtered Listings' : 'Available Listings'}
            </div>
            <div className="text-gray-500 text-xs mt-2 font-medium">
              {searchQuery ? 'Matching search criteria' : 'Active properties'}
            </div>
          </div>

          {/* Last Updated Card */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:shadow-md transition-all duration-200">
            <div className="text-gray-600 text-sm font-semibold uppercase tracking-wide mb-2">Last Updated</div>
            <div className="text-xl font-bold">
              {data?.scrape_date ? (() => {
                const date = new Date(data.scrape_date)
                return date.toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              })() : 'N/A'}
            </div>
            <div className="text-gray-500 text-xs mt-2 font-medium">
              Last scraped date
            </div>
          </div>

          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 hover:shadow-md transition-all duration-200">
            <div className="text-gray-600 text-sm font-semibold uppercase tracking-wide mb-2">Status</div>
            <div className="text-xl font-bold text-gray-900">Active</div>
          </div>
        </div>

        {/* Listings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {(() => {
            const totalPages = Math.ceil(filteredListings.length / listingsPerPage)
            const startIndex = (currentPage - 1) * listingsPerPage
            const endIndex = startIndex + listingsPerPage
            const currentListings = filteredListings.slice(startIndex, endIndex)

            return currentListings.map((listing: RedfinListing) => (
              <div
                key={listing.id}
                className="bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 hover:border-red-300 transform hover:-translate-y-0.5 sm:hover:-translate-y-1 flex flex-col h-full"
              >
                <div className="p-4 sm:p-5 lg:p-6 flex flex-col h-full">
                  <div className="mb-3 sm:mb-4">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 line-clamp-2 leading-tight">
                        {listing.address || 'Address Not Available'}
                      </h3>
                      <EnrichmentBadge status={listing.enrichment_status} />
                    </div>
                    <p className="text-gray-500 text-xs sm:text-sm font-medium">{listing.county || 'DuPage County, IL'}</p>
                  </div>

                  {listing.property_type && (
                    <div className="mb-3 sm:mb-4">
                      <span className="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-2 sm:px-3 py-1 rounded-full">
                        {listing.property_type}
                      </span>
                    </div>
                  )}

                  <div className="mb-3 sm:mb-4 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Price</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {formatPrice(listing.price)}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Beds/Baths</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {formatNumber(listing.beds)} bds | {formatNumber(listing.baths)} ba
                      </div>
                    </div>
                  </div>

                  {listing.square_feet && listing.square_feet !== 'no data' && (
                    <div className="mb-4 bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Square Feet</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {formatSquareFeet(listing.square_feet)}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 sm:gap-3 mt-auto pt-4 sm:pt-5">
                    {listing.listing_link && (
                      <a
                        href={listing.listing_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full bg-red-50 text-red-700 border border-red-300 text-center py-2.5 sm:py-3 rounded-lg hover:bg-red-100 active:bg-red-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-0"
                      >
                        <span className="hidden sm:inline">View on Redfin</span>
                        <span className="sm:hidden">View Listing</span>
                        <span className="ml-1 sm:ml-2">→</span>
                      </a>
                    )}
                    {listing.address && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          if (typeof window !== 'undefined') {
                            const scrollY = window.scrollY
                            sessionStorage.setItem('listingScrollPosition', scrollY.toString())
                            sessionStorage.setItem('listingAddress', listing.address || '')
                            sessionStorage.setItem('preventScrollRestore', 'true')
                            sessionStorage.setItem('sourcePage', 'redfin-listings')
                            const params = new URLSearchParams({
                              address: listing.address || '',
                              source: 'redfin'
                            })
                            if (listing.listing_link) {
                              params.append('listing_link', listing.listing_link)
                            }
                            window.location.href = `/owner-info?${params.toString()}`
                          }
                        }}
                        className="w-full bg-gray-50 text-gray-700 border border-gray-300 text-center py-2.5 sm:py-3 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] focus:outline-none focus:ring-0"
                      >
                        <span className="hidden sm:inline">Owner Information</span>
                        <span className="sm:hidden">Owner Info</span>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownload(listing)
                      }}
                      className="w-full bg-gradient-to-r from-red-50 to-red-100 text-red-700 border border-red-300 text-center py-2.5 sm:py-3 rounded-lg hover:from-red-100 hover:to-red-200 active:from-red-200 active:to-red-300 transition-all duration-200 font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      <span className="hidden sm:inline">Download Details</span>
                      <span className="sm:hidden">Download</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          })()}
        </div>

        {/* Pagination Controls */}
        {(() => {
          const totalPages = Math.ceil(filteredListings.length / listingsPerPage)
          if (totalPages <= 1) return null

          // Calculate page numbers to show
          const maxPagesToShow = 7
          let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2))
          let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

          if (endPage - startPage < maxPagesToShow - 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1)
          }

          const pageNumbers = []
          for (let i = startPage; i <= endPage; i++) {
            pageNumbers.push(i)
          }

          return (
            <div className="flex justify-center items-center gap-1.5 sm:gap-2 mt-8 sm:mt-12 mb-4 sm:mb-6 flex-wrap">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[40px] sm:min-h-[44px]"
              >
                <span className="hidden sm:inline">← Prev</span>
                <span className="sm:hidden">←</span>
              </button>

              {startPage > 1 && (
                <>
                  <button
                    onClick={() => setCurrentPage(1)}
                    className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[40px] sm:min-h-[44px] min-w-[40px] sm:min-w-[44px]"
                  >
                    1
                  </button>
                  {startPage > 2 && <span className="text-gray-400 px-1 sm:px-2 text-xs sm:text-sm">...</span>}
                </>
              )}

              {pageNumbers.map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 sm:px-4 py-2 rounded-lg transition-all duration-200 font-medium shadow-sm active:scale-95 min-w-[40px] sm:min-w-[44px] min-h-[40px] sm:min-h-[44px] text-xs sm:text-sm ${currentPage === pageNum
                    ? 'bg-red-600 text-white border border-red-600 hover:bg-red-700'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100'
                    }`}
                >
                  {pageNum}
                </button>
              ))}

              {endPage < totalPages && (
                <>
                  {endPage < totalPages - 1 && <span className="text-gray-400 px-1 sm:px-2 text-xs sm:text-sm">...</span>}
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[40px] sm:min-h-[44px] min-w-[40px] sm:min-w-[44px]"
                  >
                    {totalPages}
                  </button>
                </>
              )}

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[40px] sm:min-h-[44px]"
              >
                <span className="hidden sm:inline">Next →</span>
                <span className="sm:hidden">→</span>
              </button>
            </div>
          )
        })()}

        {/* Display Info */}
        <div className="mt-8 mb-6 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 max-w-2xl mx-auto">
            <p className="text-xl font-bold text-gray-800 mb-2">
              Showing <span className="text-red-600 text-2xl">
                {(() => {
                  const startIndex = (currentPage - 1) * listingsPerPage
                  const endIndex = Math.min(startIndex + listingsPerPage, filteredListings.length)
                  return startIndex + 1 === endIndex ? endIndex : `${startIndex + 1}-${endIndex}`
                })()}
              </span> of{' '}
              <span className="text-red-600 text-2xl">{filteredListings.length}</span> {searchQuery ? 'filtered' : ''} listings
              {searchQuery && data?.listings && (
                <span className="text-gray-500 text-base font-normal ml-2">
                  (out of {data.listings.length} total)
                </span>
              )}
              {filteredListings.length > listingsPerPage && (
                <span className="text-gray-500 text-base font-normal ml-2">
                  (Page {currentPage} of {Math.ceil(filteredListings.length / listingsPerPage)})
                </span>
              )}
            </p>
            <p className="text-sm text-gray-600">
              Data source: {data.source || 'Redfin'} Scraped on {data.scrape_date || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Redfin Listings Dashboard</h3>
            <p className="text-gray-600 text-sm">
              Professional property listings viewer for DuPage County, Illinois
            </p>
            <p className="text-gray-500 text-xs mt-4">
              © {new Date().getFullYear()} Redfin Listings Dashboard
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function RedfinListingsPage() {
  return (
    <AuthGuard>
      <RedfinListingsPageContent />
    </AuthGuard>
  )
}

