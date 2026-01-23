'use client'

import { useEffect, useState, useMemo, Suspense, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import AuthGuard from '@/app/components/AuthGuard'
import EnrichmentBadge from '@/app/components/EnrichmentBadge'
import UrlScraperInput from '@/app/components/UrlScraperInput'
import { getDefaultUrlForPlatform } from '@/lib/url-validation'
import { createClient } from '@/lib/supabase-client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

interface ZillowFSBOListing {
  id: number
  address: string
  price: string | number
  beds: string | number
  baths: string | number
  square_feet: string | number
  listing_link: string
  property_type: string
  year_build: string | number | null
  hoa: string | number | null
  days_on_zillow: string | number | null
  page_view_count: string | number | null
  favorite_count: string | number | null
  phone_number: string | null
  owner_name?: string | null
  mailing_address?: string | null
  emails?: string | string[] | null
  phones?: string | string[] | null
  enrichment_status?: string | null
}

interface ZillowFSBOListingsData {
  total_listings: number
  scrape_date: string
  listings: ZillowFSBOListing[]
}

function ZillowFSBOPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ZillowFSBOListingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isStartingScraper, setIsStartingScraper] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1) // Current page number
  const listingsPerPage = 20 // Listings per page
  const [isScraperRunning, setIsScraperRunning] = useState(false) // Track scraper status
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null) // Notification state
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null) // Track when data was last fetched
  const wasRunningRef = useRef(false) // Track previous running state to detect changes
  const fetchListingsRef = useRef<((forceRefresh?: boolean) => Promise<void>) | null>(null) // Ref to fetchListings to avoid stale closures

  // Handle starting scraper with default URL
  const handleStartScrapingWithDefault = async () => {
    const defaultUrl = getDefaultUrlForPlatform('zillow_fsbo')
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

      // Mark scraper as running and start polling for completion
      setIsScraperRunning(true)
      setNotification({ message: '🔄 Scraper started! Listings will auto-refresh when complete.', type: 'info' })
      setTimeout(() => setNotification(null), 5000)
    } catch (error: any) {
      setError(error.message || 'Failed to start scraper')
    } finally {
      setIsStartingScraper(false)
    }
  }

  // Webhook: Use Supabase real-time subscriptions instead of polling
  useEffect(() => {
    const supabase = createClient()
    
    // Subscribe to real-time changes in zillow_fsbo_listings table
    const channel = supabase
      .channel('zillow_fsbo_listings_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'zillow_fsbo_listings'
        },
        (payload) => {
          console.log('[Zillow FSBO] Webhook: Database change detected:', payload.eventType)
          
          // Use ref to avoid stale closure
          const refreshWithRetry = async (retryCount = 0, maxRetries = 3) => {
            try {
              if (!fetchListingsRef.current) return
              
              console.log(`[Zillow FSBO] Webhook: Refreshing listings (attempt ${retryCount + 1}/${maxRetries})...`)
              await fetchListingsRef.current(true)
              
              // Fetch fresh count from API (don't use stale data state)
              setTimeout(async () => {
                try {
                  const res = await fetch('/api/zillow-fsbo-listings?' + Date.now(), { cache: 'no-store' })
                  const result = await res.json()
                  const newCount = result.listings?.length || result.total_listings || 0
                  console.log(`[Zillow FSBO] Webhook refresh complete: ${newCount} listings`)
                  setNotification({ message: `🔄 Listings updated! Now showing ${newCount} listings.`, type: 'info' })
                  setTimeout(() => setNotification(null), 5000)
                } catch (err) {
                  console.error('[Zillow FSBO] Error getting count after webhook:', err)
                  setNotification({ message: '🔄 Listings updated from Supabase!', type: 'info' })
                  setTimeout(() => setNotification(null), 5000)
                }
              }, 500)
            } catch (err) {
              console.error(`[Zillow FSBO] Webhook refresh failed (attempt ${retryCount + 1}):`, err)
              if (retryCount < maxRetries - 1) {
                setTimeout(() => refreshWithRetry(retryCount + 1, maxRetries), 2000)
              } else {
                setNotification({ message: '⚠️ Failed to refresh. Click Refresh button.', type: 'info' })
                setTimeout(() => setNotification(null), 5000)
              }
            }
          }
          
          // Wait 2 seconds to ensure all changes are committed
          setTimeout(() => refreshWithRetry(), 2000)
        }
      )
      .subscribe((status) => {
        console.log('[Zillow FSBO] Webhook subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('[Zillow FSBO] ✅ Successfully subscribed to real-time updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Zillow FSBO] ❌ Webhook subscription error')
        }
      })

    // Check scraper status CONTINUOUSLY (not just when running)
    let statusCheckInterval: NodeJS.Timeout | null = null
    
    const checkScraperStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/status-all`, { cache: 'no-store' })
        if (res.ok) {
          const statusData = await res.json()
          const scraperStatus = statusData.zillow_fsbo
          const isRunning = scraperStatus?.status === 'running'
          
          // Update state if changed
          setIsScraperRunning(prev => {
            if (prev !== isRunning) {
              return isRunning
            }
            return prev
          })
          
          // If scraper just stopped (was running, now not running)
          if (!isRunning && wasRunningRef.current) {
            console.log('[Zillow FSBO] Scraper stopped! Fetching latest listings...')
            wasRunningRef.current = false
            
            // Wait 5 seconds for Supabase to finish saving, then refresh with retry
            const refreshAfterStop = async (currentRetry = 0, maxRetries = 5) => {
              try {
                if (!fetchListingsRef.current) return
                
                console.log(`[Zillow FSBO] Auto-refreshing after scraper stop (attempt ${currentRetry + 1}/${maxRetries})...`)
                await fetchListingsRef.current(true)
                
                // Verify count by fetching fresh data
                setTimeout(async () => {
                  try {
                    const res = await fetch('/api/zillow-fsbo-listings?' + Date.now(), { cache: 'no-store' })
                    const result = await res.json()
                    const newCount = result.listings?.length || result.total_listings || 0
                    console.log(`[Zillow FSBO] Successfully refreshed! Now showing ${newCount} listings`)
                    setNotification({ message: `✅ Scraper completed! Showing ${newCount} listings.`, type: 'success' })
                    setTimeout(() => setNotification(null), 5000)
                  } catch (err) {
                    console.error('[Zillow FSBO] Error verifying count:', err)
                    setNotification({ message: '✅ Scraper completed! Listings refreshed.', type: 'success' })
                    setTimeout(() => setNotification(null), 5000)
                  }
                }, 1000)
              } catch (err) {
                console.error(`[Zillow FSBO] Refresh failed (attempt ${currentRetry + 1}):`, err)
                if (currentRetry < maxRetries - 1) {
                  setTimeout(() => refreshAfterStop(currentRetry + 1, maxRetries), 2000 * (currentRetry + 1))
                } else {
                  setNotification({ message: '⚠️ Failed to refresh. Click Refresh button.', type: 'info' })
                  setTimeout(() => setNotification(null), 5000)
                }
              }
            }
            
            setTimeout(() => refreshAfterStop(), 5000)
          } else if (isRunning) {
            wasRunningRef.current = true
          }
        }
      } catch (err) {
        console.error('[Zillow FSBO] Error checking scraper status:', err)
      }
    }
    
    // Initialize ref from current state
    wasRunningRef.current = isScraperRunning
    
    // Run status check continuously every 3 seconds
    statusCheckInterval = setInterval(checkScraperStatus, 3000)
    checkScraperStatus()

    // Cleanup
    return () => {
      console.log('[Zillow FSBO] Cleaning up webhook subscription and status check')
      supabase.removeChannel(channel)
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval)
      }
    }
  }, []) // Empty dependencies - only run once on mount

  // Handle deep-linking from enrichment log
  useEffect(() => {
    const search = searchParams.get('search')
    if (search) {
      setSearchQuery(search)
    }
  }, [searchParams])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      localStorage.setItem('justLoggedOut', 'true')
      await supabase.auth.signOut()
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')
      await new Promise(resolve => setTimeout(resolve, 200))
      window.location.href = '/login'
    } catch (err) {
      localStorage.setItem('justLoggedOut', 'true')
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')
      window.location.href = '/login'
    }
  }

  const handleDownload = (listing: ZillowFSBOListing) => {
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

    // Prepare CSV data with all Supabase fields for Zillow FSBO
    const headers = ['address', 'price', 'beds', 'baths', 'listing_link', 'property_type', 'year_build', 'hoa', 'days_on_zillow', 'page_view_count', 'favorite_count', 'phone_number', 'owner_name', 'mailing_address', 'emails', 'phones']
    const rowData = [
      escapeCSV(listing.address),
      escapeCSV(listing.price),
      escapeCSV(listing.beds),
      escapeCSV(listing.baths),
      escapeCSV(listing.listing_link),
      escapeCSV(listing.property_type),
      escapeCSV(listing.year_build),
      escapeCSV(listing.hoa),
      escapeCSV(listing.days_on_zillow),
      escapeCSV(listing.page_view_count),
      escapeCSV(listing.favorite_count),
      escapeCSV(listing.phone_number),
      escapeCSV(listing.owner_name),
      escapeCSV(listing.mailing_address),
      escapeCSV(listing.emails, true), // Mark as array field
      escapeCSV(listing.phones, true) // Mark as array field
    ]

    const csvData = [headers.join(','), rowData.join(',')].join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const addressStr = listing.address ? String(listing.address).replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'listing'
    const filename = `zillow_fsbo_${addressStr}_${listing.id || Date.now()}.csv`
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
    }

    const returningFromOwnerInfo = typeof window !== 'undefined' &&
      (sessionStorage.getItem('returningFromOwnerInfo') || sessionStorage.getItem('preventScrollRestore'))

    if (returningFromOwnerInfo && data && data.listings && data.listings.length > 0) {
      setLoading(false)
      return
    }

    if (!data || !data.listings || data.listings.length === 0) {
      fetchListings()
    } else if (!returningFromOwnerInfo) {
      fetchListings()
    }
  }, [])

  useEffect(() => {
    if (!data || !data.listings || data.listings.length === 0) return

    if (typeof window !== 'undefined') {
      const savedScrollPosition = sessionStorage.getItem('listingScrollPosition')
      const returningFromOwnerInfo = sessionStorage.getItem('returningFromOwnerInfo')
      const preventScrollRestore = sessionStorage.getItem('preventScrollRestore')
      const sourcePage = sessionStorage.getItem('sourcePage')

      if (savedScrollPosition && (returningFromOwnerInfo || preventScrollRestore) && sourcePage === 'zillow-fsbo') {
        const scrollPos = parseInt(savedScrollPosition, 10)
        const restoreScroll = () => {
          window.scrollTo({ top: scrollPos, behavior: 'auto' })
        }
        setTimeout(restoreScroll, 50)
        setTimeout(restoreScroll, 100)
        setTimeout(restoreScroll, 200)
        setTimeout(restoreScroll, 500)
        setTimeout(() => {
          sessionStorage.removeItem('returningFromOwnerInfo')
          sessionStorage.removeItem('preventScrollRestore')
          sessionStorage.removeItem('listingScrollPosition')
          sessionStorage.removeItem('sourcePage')
        }, 600)
      }
    }
  }, [data])

  const fetchListings = useCallback(async (forceRefresh = false) => {
    try {
      const hasExistingData = data && data.listings && data.listings.length > 0
      if (!hasExistingData || forceRefresh) {
        setLoading(true)
      }
      setError(null)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch('/api/zillow-fsbo-listings?' + new Date().getTime(), {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache',
        },
        priority: 'high'
      } as RequestInit)

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json()
        if (!hasExistingData) {
          throw new Error(errorData.error || 'Failed to fetch listings')
        }
        return
      }

      const result = await response.json()

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
      setLastFetchTime(new Date()) // Update last fetch time to current time
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.')
      } else {
        setError(err.message || 'Failed to load listings')
      }
      console.error('Error fetching Zillow FSBO listings:', err)
    } finally {
      setLoading(false)
    }
  }, [data]) // Include data in dependencies since we check it

  // Store ref to fetchListings
  useEffect(() => {
    fetchListingsRef.current = fetchListings
  }, [fetchListings])

  const formatPrice = (price: string | number | null | undefined): string => {
    if (price === null || price === undefined || price === '' || price === 'null' || price === 'None') return 'Price on Request'
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
    if (value === null || value === undefined || value === '' || value === 'null' || value === 'None') return 'N/A'
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
        (listing.phone_number && listing.phone_number.includes(query)) ||
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
          <p className="text-gray-900 text-xl font-semibold">Loading Zillow FSBO listings...</p>
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
            onClick={() => fetchListings()}
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
            No Zillow FSBO listings were found.
          </p>
          <button
            onClick={() => fetchListings()}
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
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <Image
                src="/Zillow.jpg"
                alt="Zillow Logo"
                width={60}
                height={60}
                className="rounded-lg shadow-md w-10 h-10 sm:w-[60px] sm:h-[60px]"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-1 sm:mb-2 tracking-tight">
                  Zillow FSBO Listings
                </h1>
                <p className="text-gray-600 text-sm sm:text-base lg:text-lg">
                  For Sale By Owner Property Listings
                </p>
              </div>
            </div>
            {/* Data Changed Indicator Only - Removed Total Listings, Refresh, and Logout buttons from individual pages */}
          </div>
          
          {/* URL Scraper Input Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
              <h3 className="text-lg font-semibold text-purple-900 mb-2">Scrape from URL</h3>
              <p className="text-sm text-purple-700 mb-4">Enter a Zillow FSBO URL to scrape a specific location</p>
              <UrlScraperInput
                defaultUrl={getDefaultUrlForPlatform('zillow_fsbo')}
                expectedPlatform="zillow_fsbo"
                showDefaultValue={true}
                placeholder="https://www.zillow.com/homes/for_sale/"
                onSuccess={(platform, url) => {
                  // Start polling for scraper completion
                  setIsScraperRunning(true)
                  setNotification({ message: '🔄 Scraper started! Listings will auto-refresh when complete.', type: 'info' })
                  setTimeout(() => setNotification(null), 5000)
                }}
                onError={(error) => {
                  console.error('URL validation error:', error)
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Notification Banner */}
      {notification && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className={`rounded-lg shadow-md p-4 border ${
            notification.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center justify-between">
              <p className="font-medium">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className="ml-4 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          {/* Available Listings Card */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-5 border border-gray-200 hover:shadow-md transition-all duration-200">
            <div className="mb-2">
              <div className="text-3xl sm:text-4xl font-bold text-gray-900">
                {searchQuery ? filteredListings.length : (data?.total_listings || 0)}
              </div>
            </div>
            <div className="text-gray-600 text-xs sm:text-sm font-semibold uppercase tracking-wide">
              {searchQuery ? 'Filtered Listings' : 'Available Listings'}
            </div>
            <div className="text-gray-500 text-xs mt-1 font-medium">
              {searchQuery ? 'Matching search criteria' : 'Active properties'}
            </div>
          </div>

          {/* Last Updated Card */}
          <div className="bg-white rounded-lg shadow-sm p-4 sm:p-5 border border-gray-200 hover:shadow-md transition-all duration-200">
            <div className="text-gray-600 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Last Updated</div>
            <div className="text-lg sm:text-xl font-bold">
              {lastFetchTime ? lastFetchTime.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
              }) : (data?.scrape_date && data.scrape_date.trim() ? (() => {
                // Fallback to scrape_date if lastFetchTime not set yet
                try {
                  const dateStr = data.scrape_date.trim()
                  const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00')
                  // Check if date is valid
                  if (isNaN(date.getTime())) {
                    // If date is invalid but we have data, show current time
                    return new Date().toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true
                    })
                  }
                  return date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })
                } catch (err) {
                  // If error but we have data, show current time
                  return new Date().toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                  })
                }
              })() : (data?.listings && data.listings.length > 0 ? (() => {
                // If we have listings but no date, show current time
                return new Date().toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true
                })
              })() : 'N/A'))}
            </div>
            <div className="text-gray-500 text-xs mt-1 font-medium">
              {lastFetchTime ? 'Last refreshed' : 'Last scraped date'}
            </div>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
                Search Zillow FSBO Listings
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
                    setCurrentPage(1) // Reset to first page on search
                  }}
                  placeholder="Search"
                  className="w-full pl-12 pr-4 py-3.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-gray-800 placeholder-gray-400 bg-white focus:bg-white font-medium"
                />
              </div>
            </div>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setCurrentPage(1) // Reset to first page when clearing search
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {(() => {
            // Calculate pagination
            const totalPages = Math.ceil(filteredListings.length / listingsPerPage)
            const startIndex = (currentPage - 1) * listingsPerPage
            const endIndex = startIndex + listingsPerPage
            const currentListings = filteredListings.slice(startIndex, endIndex)

            return currentListings.map((listing: ZillowFSBOListing) => (
              <div
                key={listing.id}
                className="bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 hover:border-blue-300 transform hover:-translate-y-0.5 sm:hover:-translate-y-1"
              >
                <div className="p-4 sm:p-5 lg:p-6">
                  <div className="mb-3 sm:mb-4">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 line-clamp-2 leading-tight">
                        {listing.address || 'Address Not Available'}
                      </h3>
                      <EnrichmentBadge status={listing.enrichment_status} />
                    </div>
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
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Beds</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {formatNumber(listing.beds)}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Baths</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {formatNumber(listing.baths)}
                      </div>
                    </div>

                    {listing.year_build && (
                      <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                        <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Year</div>
                        <div className="text-sm sm:text-base font-bold text-gray-900">
                          {formatNumber(listing.year_build)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 sm:gap-3 mt-4 sm:mt-5 lg:mt-6">
                    {listing.listing_link && (
                      <a
                        href={listing.listing_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full bg-blue-50 text-blue-700 border border-blue-300 text-center py-2.5 sm:py-3 rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-0"
                      >
                        <span className="hidden sm:inline">View on Zillow</span>
                        <span className="sm:hidden">View Listing</span>
                        <span className="ml-1 sm:ml-2">→</span>
                      </a>
                    )}
                    {listing.address && listing.address !== 'Address Not Available' && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          if (typeof window !== 'undefined') {
                            const scrollY = window.scrollY
                            sessionStorage.setItem('listingScrollPosition', scrollY.toString())
                            sessionStorage.setItem('listingAddress', listing.address || '')
                            sessionStorage.setItem('preventScrollRestore', 'true')
                            sessionStorage.setItem('sourcePage', 'zillow-fsbo')
                            const params = new URLSearchParams({
                              address: listing.address || '',
                              source: 'zillow-fsbo'
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
                      className="w-full bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-300 text-center py-2.5 sm:py-3 rounded-lg hover:from-blue-100 hover:to-blue-200 active:from-blue-200 active:to-blue-300 transition-all duration-200 font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-[1.02] active:scale-[0.98]"
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

        {/* Pagination */}
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
            <div className="flex justify-center items-center gap-1.5 sm:gap-2 mt-6 sm:mt-8 mb-4 sm:mb-6 flex-wrap">
              {/* Previous Button */}
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="bg-white text-gray-700 border border-gray-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[40px] sm:min-h-[44px]"
              >
                <span className="hidden sm:inline">← Prev</span>
                <span className="sm:hidden">←</span>
              </button>

              {/* First Page */}
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

              {/* Page Numbers */}
              {pageNumbers.map(pageNum => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 sm:px-4 py-2 rounded-lg transition-all duration-200 font-medium shadow-sm active:scale-95 min-w-[40px] sm:min-w-[44px] min-h-[40px] sm:min-h-[44px] text-xs sm:text-sm ${currentPage === pageNum
                    ? 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100'
                    }`}
                >
                  {pageNum}
                </button>
              ))}

              {/* Last Page */}
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

              {/* Next Button */}
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
            <p className="text-xl font-bold text-gray-800 mb-4">
              Showing <span className="text-blue-600 text-2xl">
                {(() => {
                  const startIndex = (currentPage - 1) * listingsPerPage
                  const endIndex = Math.min(startIndex + listingsPerPage, filteredListings.length)
                  return startIndex + 1 === endIndex ? endIndex : `${startIndex + 1}-${endIndex}`
                })()}
              </span> of{' '}
              <span className="text-blue-600 text-2xl">{filteredListings.length}</span> {searchQuery ? 'filtered' : ''} listings
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
            <p className="text-sm text-gray-600 mt-2">
              Data scraped on {data.scrape_date || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <footer className="bg-white border-t border-gray-200 mt-16 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Zillow FSBO Listings Dashboard</h3>
            <p className="text-gray-600 text-sm">
              Professional property listings viewer for For Sale By Owner properties
            </p>
            <p className="text-gray-500 text-xs mt-4">
              © {new Date().getFullYear()} Zillow FSBO Listings Dashboard
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function ZillowFSBOPage() {
  return (
    <AuthGuard>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      }>
        <ZillowFSBOPageContent />
      </Suspense>
    </AuthGuard>
  )
}

