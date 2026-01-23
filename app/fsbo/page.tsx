'use client'

import { useEffect, useState, useRef, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import UrlScraperInput from '@/app/components/UrlScraperInput'
import { getDefaultUrlForPlatform } from '@/lib/url-validation'
import { createClient } from '@/lib/supabase-client'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

interface Listing {
  address: string
  price: string
  beds: string
  baths: string
  square_feet: string
  listing_link: string
  time_of_post: string | null
  owner_emails?: string[]
  owner_phones?: string[]
  owner_name?: string | null
  mailing_address?: string | null
}

interface ListingsData {
  scrape_timestamp: string
  total_listings: number
  listings: Listing[]
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ListingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null) // Track when scraper was last run
  const [dataChanged, setDataChanged] = useState(false)
  const [currentPage, setCurrentPage] = useState(1) // Current page number
  const listingsPerPage = 20 // Listings per page
  const [syncProgress, setSyncProgress] = useState<string>('') // Progress message during sync
  const [isSyncing, setIsSyncing] = useState(false) // Track if sync is in progress
  const [isStartingScraper, setIsStartingScraper] = useState(false) // Track if scraper is starting
  const [searchQuery, setSearchQuery] = useState('') // Search query for filtering listings
  const [isScraperRunning, setIsScraperRunning] = useState(false) // Track scraper status
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null) // Notification state
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false) // Show welcome message after login
  const [previousUrls, setPreviousUrls] = useState<Set<string>>(() => {
    // Load previous URLs from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('previousListingUrls')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    }
    return new Set()
  })

  // Check authentication on mount using Supabase Auth
  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        // Don't show any content until auth is checked
        setCheckingAuth(true)

        const { createClient } = await import('@/lib/supabase-client')
        const supabase = createClient()
        const { data: { session }, error } = await supabase.auth.getSession()

        if (!mounted) return

        if (error || !session) {
          // Immediately redirect to login without showing dashboard
          router.replace('/login')
          if (mounted) {
            setCheckingAuth(false)
          }
          return
        }

        setIsAuthenticated(true)
        if (mounted) {
          setCheckingAuth(false)
        }
      } catch (err) {
        if (!mounted) return
        router.replace('/login')
        if (mounted) {
          setCheckingAuth(false)
        }
      }
    }

    // Check immediately without delay to prevent flash
    checkAuth()

    return () => {
      mounted = false
    }
  }, [router])

  // Handle deep-linking from enrichment log
  useEffect(() => {
    const search = searchParams.get('search')
    if (search) {
      setSearchQuery(search)
    }
  }, [searchParams])

  // Check for welcome message flag after authentication
  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      const showWelcome = sessionStorage.getItem('showWelcomeMessage')
      if (showWelcome === 'true') {
        setShowWelcomeMessage(true)
        // Clear the flag
        sessionStorage.removeItem('showWelcomeMessage')
        // Hide message after 3 seconds
        setTimeout(() => {
          setShowWelcomeMessage(false)
        }, 3000)
      }
    }
  }, [isAuthenticated])

  // Handle logout
  const handleLogout = async () => {
    try {
      const { createClient } = await import('@/lib/supabase-client')
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

  // Use ref to track current data for polling comparison (avoids dependency issues)
  const dataRef = useRef<ListingsData | null>(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Scroll to top when page changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [currentPage])

  // Prevent automatic scroll to top on page load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Disable automatic scroll restoration
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
    }
  }, [])

  useEffect(() => {
    // ALWAYS disable automatic scroll restoration on mount
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
  }, []) // Only run once on mount

  // Restore scroll position after data loads
  useEffect(() => {
    if (!data || !data.listings || data.listings.length === 0) return

    // Restore scroll position when returning from owner-info page
    if (typeof window !== 'undefined') {
      const savedScrollPosition = sessionStorage.getItem('listingScrollPosition')
      const returningFromOwnerInfo = sessionStorage.getItem('returningFromOwnerInfo')
      const preventScrollRestore = sessionStorage.getItem('preventScrollRestore')
      const sourcePage = sessionStorage.getItem('sourcePage')

      // Only restore if we're returning from owner-info and on the correct page (main page)
      if (savedScrollPosition && (returningFromOwnerInfo || preventScrollRestore) && (!sourcePage || sourcePage === 'main' || sourcePage === '')) {
        const scrollPos = parseInt(savedScrollPosition, 10)

        // Function to restore scroll position
        const restoreScroll = () => {
          window.scrollTo({
            top: scrollPos,
            left: 0,
            behavior: 'auto'
          })
        }

        // Wait for content to render, then restore (only a few times, not continuously)
        setTimeout(restoreScroll, 100)
        setTimeout(restoreScroll, 300)
        setTimeout(restoreScroll, 500)

        // Clean up after restoring
        setTimeout(() => {
          sessionStorage.removeItem('listingScrollPosition')
          sessionStorage.removeItem('returningFromOwnerInfo')
          sessionStorage.removeItem('preventScrollRestore')
          sessionStorage.removeItem('sourcePage')
        }, 1000)
      }
    }
  }, [data]) // Run when data changes

  // Webhook: Use Supabase real-time subscriptions instead of polling
  useEffect(() => {
    const supabase = createClient()
    
    // Subscribe to real-time changes in listings table
    const channel = supabase
      .channel('listings_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'listings'
        },
        (payload) => {
          console.log('[FSBO] Webhook: Database change detected:', payload.eventType)
          // When data changes in Supabase, automatically refresh listings
          setTimeout(() => {
            fetchListings(true)
            setNotification({ message: '🔄 Listings updated from Supabase via webhook!', type: 'info' })
            setTimeout(() => setNotification(null), 3000)
          }, 500)
        }
      )
      .subscribe()

    // Also check scraper status periodically (but less frequently - only when running)
    let statusCheckInterval: NodeJS.Timeout | null = null
    if (isScraperRunning) {
      const checkScraperStatus = async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/status-all`, { cache: 'no-store' })
          if (res.ok) {
            const statusData = await res.json()
            const fsboStatus = statusData.fsbo
            const isRunning = fsboStatus?.status === 'running'
            
            if (!isRunning && isScraperRunning) {
              setIsScraperRunning(false)
              setNotification({ message: '✅ Scraper completed! Listings updated via webhook.', type: 'success' })
              setTimeout(() => setNotification(null), 5000)
            }
          }
        } catch (err) {
          console.error('[FSBO] Error checking scraper status:', err)
        }
      }
      
      // Check status every 5 seconds (less frequent than before)
      statusCheckInterval = setInterval(checkScraperStatus, 5000)
    }

    // Cleanup
    return () => {
      supabase.removeChannel(channel)
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval)
      }
    }
  }, [isScraperRunning])

  // Function to check if property is sold (Relaxed)
  const isPropertySold = (listing: Listing): boolean => {
    // Check price and address for specific sold keywords
    const price = (listing.price || '').toLowerCase().trim()
    const address = (listing.address || '').toLowerCase()

    // Only mark as sold if it's very clear in the price field or address
    const soldIndicators = [
      'sold!',
      'property sold',
      'this property has been sold',
      'no longer available'
    ]

    // Most indicators for "Sold" in FSBO sites are in the price field
    return soldIndicators.some(indicator => price.includes(indicator))
  }

  const fetchListings = async (forceRefresh = false) => {
    try {
      // Don't set loading to true if we already have data (prevents clearing during navigation)
      // UNLESS forceRefresh is true (for auto-refresh after scraper completes)
      const hasExistingData = data && data.listings && data.listings.length > 0
      if (!hasExistingData || forceRefresh) {
        setLoading(true)
      }

      // Add timeout for fetch request - reduced to 10 seconds for faster feedback
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      // Add timestamp and random number for aggressive cache busting
      const cacheBuster = `t=${Date.now()}&r=${Math.random()}`
      const response = await fetch(`/api/listings?${cacheBuster}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        // Add priority hint for faster loading
        priority: 'high'
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        // If API returns error, keep existing data if available
        const errorData = await response.json().catch(() => ({}))
        console.warn('API returned error:', errorData)
        // Only set empty data if we don't have existing data
        if (!hasExistingData) {
          setData({
            scrape_timestamp: new Date().toISOString(),
            total_listings: 0,
            listings: []
          })
        }
        setError(null)
        setLoading(false)
        return
      }

      const result = await response.json()

      // Ensure result has the expected structure
      if (!result || typeof result !== 'object') {
        setData({
          scrape_timestamp: new Date().toISOString(),
          total_listings: 0,
          listings: []
        })
        setError(null)
        setLoading(false)
        return
      }

      // FILTER OUT SOLD PROPERTIES - Only show available properties
      const availableListings = result.listings.filter((listing: Listing) => !isPropertySold(listing))
      result.listings = availableListings
      result.total_listings = availableListings.length

      // Separate new and old listings
      const currentUrls = new Set(result.listings.map((l: Listing) => l.listing_link).filter(Boolean))

      // Check if data changed
      if (data && result.scrape_timestamp !== data.scrape_timestamp) {
        setDataChanged(true)
        setTimeout(() => setDataChanged(false), 3000) // Hide after 3 seconds
      } else if (!data) {
        // First load - initialize with current URLs so all appear as "new" initially
        // Next refresh will compare properly
      }

      // Update previous URLs after comparison (for next fetch)
      // Store in localStorage for persistence
      if (typeof window !== 'undefined') {
        const storedUrls = localStorage.getItem('previousListingUrls')
        const storedSet = storedUrls ? new Set(JSON.parse(storedUrls)) : new Set()

        // Helper function to get listing priority score
        // Higher score = appears first
        const getListingPriority = (listing: Listing): number => {
          const hasEmail = listing.owner_emails && listing.owner_emails.length > 0
          const hasPhone = listing.owner_phones && listing.owner_phones.length > 0
          const hasOwnerName = listing.owner_name && listing.owner_name !== 'null' && listing.owner_name !== 'None' && listing.owner_name.trim() !== ''
          const hasMailingAddress = listing.mailing_address && listing.mailing_address !== 'null' && listing.mailing_address !== 'None' && listing.mailing_address.trim() !== ''

          let score = 0

          // Highest priority: Has email AND phone (score: 100)
          if (hasEmail && hasPhone) {
            score = 100
          }
          // High priority: Has email OR phone (score: 50)
          else if (hasEmail || hasPhone) {
            score = 50
          }
          // Low priority: Only has owner_name or mailing_address but NO email/phone (score: 10)
          // These should go to the end
          else if (hasOwnerName || hasMailingAddress) {
            score = 10
          }
          // Lowest priority: Nothing (score: 0)
          else {
            score = 0
          }

          return score
        }

        // Sort listings: listings with email/phone first, then new listings, then others
        const sortedListings = [...result.listings].sort((a, b) => {
          const aPriority = getListingPriority(a)
          const bPriority = getListingPriority(b)

          // First priority: listings with email/phone come first
          if (aPriority > bPriority) return -1
          if (aPriority < bPriority) return 1

          // Second priority: new listings (if both have same priority)
          const aIsNew = !storedSet.has(a.listing_link)
          const bIsNew = !storedSet.has(b.listing_link)

          if (aIsNew && !bIsNew) return -1 // a is new, b is old - a comes first
          if (!aIsNew && bIsNew) return 1  // a is old, b is new - b comes first

          return 0 // Both same type, maintain original order
        })

        result.listings = sortedListings

        // Save current URLs for next comparison
        const currentUrlsArray = Array.from(currentUrls) as string[]
        localStorage.setItem('previousListingUrls', JSON.stringify(currentUrlsArray))
        setPreviousUrls(new Set<string>(currentUrlsArray))
      } else {
        // Server-side: sort based on email/phone priority and new listings
        // Helper function to get listing priority score
        const getListingPriority = (listing: Listing): number => {
          const hasEmail = listing.owner_emails && listing.owner_emails.length > 0
          const hasPhone = listing.owner_phones && listing.owner_phones.length > 0
          const hasOwnerName = listing.owner_name && listing.owner_name !== 'null' && listing.owner_name !== 'None' && listing.owner_name.trim() !== ''
          const hasMailingAddress = listing.mailing_address && listing.mailing_address !== 'null' && listing.mailing_address !== 'None' && listing.mailing_address.trim() !== ''

          let score = 0

          // Highest priority: Has email AND phone (score: 100)
          if (hasEmail && hasPhone) {
            score = 100
          }
          // High priority: Has email OR phone (score: 50)
          else if (hasEmail || hasPhone) {
            score = 50
          }
          // Low priority: Only has owner_name or mailing_address but NO email/phone (score: 10)
          else if (hasOwnerName || hasMailingAddress) {
            score = 10
          }
          // Lowest priority: Nothing (score: 0)
          else {
            score = 0
          }

          return score
        }

        const sortedListings = [...result.listings].sort((a, b) => {
          const aPriority = getListingPriority(a)
          const bPriority = getListingPriority(b)

          // First priority: listings with email/phone come first
          if (aPriority > bPriority) return -1
          if (aPriority < bPriority) return 1

          // Second priority: new listings
          const aIsNew = !previousUrls.has(a.listing_link)
          const bIsNew = !previousUrls.has(b.listing_link)

          if (aIsNew && !bIsNew) return -1
          if (!aIsNew && bIsNew) return 1
          return 0
        })
        result.listings = sortedListings
      }

      // Store scroll position before updating data to prevent scroll jump
      const currentScrollY = typeof window !== 'undefined' ? window.scrollY : 0
      const isReturningFromOwnerInfo = typeof window !== 'undefined' &&
        (sessionStorage.getItem('returningFromOwnerInfo') || sessionStorage.getItem('preventScrollRestore'))

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
      setLastFetchTime(new Date())
      setError(null)

      // Restore scroll position after state update if not returning from owner-info
      if (typeof window !== 'undefined' && currentScrollY > 0 && !isReturningFromOwnerInfo) {
        // Use requestAnimationFrame to restore after React re-render
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (Math.abs(window.scrollY - currentScrollY) > 10) {
              window.scrollTo({
                top: currentScrollY,
                behavior: 'instant'
              })
            }
          }, 0)
        })
      }

      // Update lastRefreshTime if the new scrape_timestamp is newer
      // Only update if we don't already have a more recent lastRefreshTime
      // (This prevents overwriting a manual refresh timestamp)
      if (result.scrape_timestamp) {
        const newScrapeTime = new Date(result.scrape_timestamp)
        setLastRefreshTime(prev => {
          // Only update if the new time is significantly newer (more than 1 second)
          // This prevents race conditions and ensures manual refresh timestamps are preserved
          if (!prev) {
            return newScrapeTime
          }
          // Only update if new time is at least 1 second newer
          if (newScrapeTime.getTime() > prev.getTime() + 1000) {
            return newScrapeTime
          }
          return prev
        })
      }

      // Reset to first page if new data has different count
      if (data && result.listings.length !== data.listings.length) {
        setCurrentPage(1) // Reset to first page
      }
      
      console.log(`[FSBO] Fetched ${result.listings?.length || 0} listings from Supabase (API total_listings: ${result.total_listings || 0})`)
    } catch (err: any) {
      setError(err.message)
      console.error('[FSBO] Error fetching listings:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle starting scraper with default URL
  const handleStartScrapingWithDefault = async () => {
    const defaultUrl = getDefaultUrlForPlatform('fsbo')
    if (!defaultUrl) {
      setSyncProgress('❌ No default URL configured')
      setTimeout(() => setSyncProgress(''), 5000)
      return
    }

    setIsStartingScraper(true)
    setSyncProgress(`🚀 Starting scraper with default URL...`)

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

      setSyncProgress(`✅ Scraper started! Scraping ${defaultUrl}...`)
      setIsSyncing(true)
      // Mark scraper as running and start polling for completion
      setIsScraperRunning(true)
      setNotification({ message: '🔄 Scraper started! Listings will auto-refresh when complete.', type: 'info' })
      setTimeout(() => setNotification(null), 5000)
      pollForListings(3000, 120)
      // Note: pollForListings now checks backend status and stops automatically when scraper finishes
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start scraper'
      setSyncProgress(`❌ ${errorMsg}`)
      setTimeout(() => setSyncProgress(''), 5000)
    } finally {
      setIsStartingScraper(false)
    }
  }

  // Poll for listings while syncing - updates UI in real-time
  // Optimized to reduce lag during sync
  const pollForListings = (interval: number = 3000, maxAttempts: number = 120): ReturnType<typeof setInterval> => {
    let attempts = 0
    let lastCount = 0
    const pollInterval = setInterval(async () => {
      attempts++
      
      // Check if scraper is still running
      try {
        const statusRes = await fetch(`${BACKEND_URL}/api/status-all`, { cache: 'no-store' })
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          const fsboStatus = statusData.fsbo
          const isScraperRunning = fsboStatus?.status === 'running'
          
          // If scraper finished, stop polling and clear status
          if (!isScraperRunning) {
            clearInterval(pollInterval)
            setIsSyncing(false)
            const lastResult = fsboStatus?.last_result
            if (lastResult?.success) {
              setSyncProgress(`✅ Scraping completed successfully!`)
              // Final fetch to get latest data
              await fetchListings()
            } else if (lastResult?.error) {
              setSyncProgress(`❌ Scraping failed: ${lastResult.error}`)
            } else {
              setSyncProgress('')
            }
            // Clear progress message after 5 seconds
            setTimeout(() => setSyncProgress(''), 5000)
            return
          }
        }
      } catch (statusErr) {
        // Continue polling even if status check fails
      }
      
      try {
        // Add timestamp and random number for aggressive cache busting
        const cacheBuster = `t=${Date.now()}&r=${Math.random()}`
        const response = await fetch(`/api/listings?${cacheBuster}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
        if (response.ok) {
          const result = await response.json()
          const currentCount = data?.listings?.length || 0
          const newCount = result.listings?.length || 0

          // Only update if count actually changed to reduce re-renders
          if (newCount > lastCount) {
            // New listings found - update immediately
            setSyncProgress(`🔍 Found ${newCount} new leads! List updating...`)
            setData(result)
            setDataChanged(true)
            setLastFetchTime(new Date())
            lastCount = newCount
          } else if (newCount > 0 && newCount === lastCount) {
            // Same count - only update progress message, not data (reduces lag)
            setSyncProgress(`🔍 Searching... ${newCount} leads found so far`)
          } else if (newCount > 0 && lastCount === 0) {
            // First time seeing listings
            setSyncProgress(`🔍 Found ${newCount} leads! List updating...`)
            setData(result)
            setDataChanged(true)
            setLastFetchTime(new Date())
            lastCount = newCount
          } else if (newCount === 0) {
            // No listings yet - keep searching
            setSyncProgress(`🔍 Searching for new leads...`)
            // Only set empty data if we don't have any (avoid unnecessary updates)
            if (!data) {
              setData({ scrape_timestamp: new Date().toISOString(), total_listings: 0, listings: [] })
            }
          }
        }
      } catch (err) {
        // Silently fail polling
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval)
        setIsSyncing(false)
        setSyncProgress('')
      }
    }, interval) // Increased to 3 seconds during sync to reduce lag

    return pollInterval
  }

  // Handle manual refresh (just fetches already-scraped data)
  const handleRefresh = async () => {
    await fetchListings()
  }

  const formatPrice = (price: string | number | null | undefined) => {
    // Handle null, undefined, empty string, or string 'null'/'None'
    if (price === null || price === undefined || price === '' || price === 'null' || price === 'None') return 'Price on Request'

    // Handle number 0
    if (typeof price === 'number' && price === 0) return 'Price on Request'

    // Clean up the price string
    let cleanPrice = String(price).trim()
    if (!cleanPrice || cleanPrice === '') return 'Price on Request'

    // If already properly formatted with $ and commas, return as is
    if (/^\$[\d,]+$/.test(cleanPrice)) {
      return cleanPrice
    }

    // Remove $ and any non-digit characters except commas
    cleanPrice = cleanPrice.replace(/[^\d,]/g, '')

    // If it's a number, format it with $ and commas
    if (cleanPrice && /^\d+/.test(cleanPrice)) {
      const numStr = cleanPrice.replace(/,/g, '')
      const num = parseInt(numStr)
      if (!isNaN(num) && num > 0) {
        // Format with commas: 665000 -> $665,000
        return `$${num.toLocaleString('en-US')}`
      }
    }

    // If already has $, try to clean and format
    if (String(price).includes('$')) {
      const extracted = String(price).match(/[\d,]+/)
      if (extracted) {
        const num = parseInt(extracted[0].replace(/,/g, ''))
        if (!isNaN(num) && num > 0) {
          return `$${num.toLocaleString('en-US')}`
        }
      }
      return String(price).trim()
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

    // If it's already a number, return as is
    if (/^\d+(\.\d+)?$/.test(str)) {
      return str
    }
    // If it has commas, return as is
    if (/^[\d,]+$/.test(str)) {
      return str
    }
    // Try to extract number
    const numMatch = str.match(/[\d.]+/)
    if (numMatch) {
      return numMatch[0]
    }
    return 'N/A'
  }

  const formatDate = (timestamp: string) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleDownload = (listing: Listing) => {
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
    const escapeCSV = (value: string | string[] | number | null | undefined, isArrayField: boolean = false, alwaysQuote: boolean = false): string => {
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

      // Handle arrays for non-array fields (shouldn't happen, but be safe)
      if (Array.isArray(value)) {
        const filtered = value.filter(v => v && String(v).trim() !== '')
        if (filtered.length === 0) return ''
        // Join with comma and ALWAYS quote
        const joined = filtered.join(',')
        const str = String(joined).trim().replace(/\n/g, ' ').replace(/\r/g, '')
        if (!str) return ''
        // ALWAYS quote arrays to keep commas inside one column
        return `"${str.replace(/"/g, '""')}"`
      }

      // Convert to string (handles numbers and other types)
      const str = String(value).trim()
      if (!str || str === '') return ''

      // ALWAYS quote if: contains comma, quote, newline, OR if alwaysQuote flag is set
      // Addresses and mailing addresses MUST be quoted (they contain commas)
      if (alwaysQuote || str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Prepare CSV data with all Supabase fields for FSBO
    // Use a more robust CSV generation method that ensures proper column alignment
    // Removed scrape_timestamp to prevent column misalignment issues
    const headers = ['address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'time_of_post', 'owner_name', 'mailing_address', 'owner_emails', 'owner_phones']

    const rowData = [
      escapeCSV(listing.address, false, true), // Always quote addresses (contain commas)
      escapeCSV(listing.price),
      escapeCSV(listing.beds),
      escapeCSV(listing.baths),
      escapeCSV(listing.square_feet),
      escapeCSV(listing.listing_link, false, true), // Always quote URLs (may contain special chars)
      escapeCSV(listing.time_of_post),
      escapeCSV(listing.owner_name),
      escapeCSV(listing.mailing_address, false, true), // Always quote mailing addresses (contain commas)
      escapeCSV(listing.owner_emails, true), // Array field - always quoted
      escapeCSV(listing.owner_phones, true) // Array field - always quoted
    ]

    // Ensure headers and data have the same length
    if (headers.length !== rowData.length) {
      console.error('CSV column mismatch:', { headers: headers.length, data: rowData.length })
    }

    // Build CSV row by row - don't quote headers (like Trulia)
    // Headers should be simple strings without quotes for Excel compatibility
    const csvRows = [
      headers.join(','), // Headers without quotes
      rowData.join(',')  // Data with proper escaping
    ]

    const csvData = csvRows.join('\n')

    // Create blob with UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })

    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Generate filename from address
    const addressStr = listing.address ? String(listing.address).replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'listing'
    const filename = `fsbo_${addressStr}_${Date.now()}.csv`
    link.setAttribute('download', filename)

    // Trigger download
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
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
        // Owner Details
        (listing.owner_name && listing.owner_name.toLowerCase().includes(query)) ||
        (listing.mailing_address && listing.mailing_address.toLowerCase().includes(query)) ||
        (listing.owner_emails && toSearchableString(listing.owner_emails).includes(query)) ||
        (listing.owner_phones && toSearchableString(listing.owner_phones).includes(query))
      )
    })
  }, [data?.listings, searchQuery])

  // Get filtered listings

  if (loading && !isSyncing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 bg-blue-100 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-gray-900 text-xl font-semibold">Loading listings...</p>
          <p className="text-gray-600 text-sm mt-2">Please wait while we fetch the latest data</p>
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

  // Don't show empty state if we're syncing - show the main view with progress banner instead
  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-900 text-xl font-semibold">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Redirect if not authenticated (handled by useEffect, but show loading just in case)
  // Don't render anything until auth is verified - this prevents dashboard flash
  if (checkingAuth || !isAuthenticated) {
    return null
  }

  if ((!data || !data.listings || data.listings.length === 0) && !isSyncing) {
    return (
      <div className="min-h-screen bg-gray-50 w-full overflow-x-hidden">
        {/* Header */}
        <header className="bg-white shadow-md border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-gray-50 rounded-lg p-4 shadow-sm border border-gray-200">
                  <span className="text-4xl">🏠</span>
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-2 tracking-tight break-words">
                    <span className="block">ForSaleByOwner</span>
                    <span className="block text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 font-medium mt-1">Dashboard</span>
                  </h1>
                  <p className="text-gray-600 text-sm sm:text-base lg:text-lg">
                    Property Listings
                  </p>
                </div>
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="bg-blue-50 text-blue-700 border border-blue-300 px-6 py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 font-medium shadow-sm hover:shadow-md"
              >
                <span className={`text-lg ${loading ? 'animate-spin' : 'animate-spin-slow'}`}>🔄</span>
                {loading ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </div>
        </header>

        {/* No Listings Message */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-white rounded-lg shadow-md p-12 max-w-2xl mx-auto text-center border border-gray-200">
            <div className="text-gray-400 text-8xl mb-6">📭</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">No Listings Available</h2>
            <p className="text-gray-600 text-lg mb-8">
              The database is currently empty. Click the button below to sync data from the website.
            </p>
            <div className="space-y-4">
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="bg-blue-50 text-blue-700 border border-blue-300 px-8 py-4 rounded-lg hover:bg-blue-100 transition-all duration-200 font-medium shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">🔄</span>
                    <span>Refreshing Data...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">🔄</span>
                    <span>Refresh Data</span>
                  </>
                )}
              </button>
              <p className="text-sm text-gray-500 mt-4">
                This will run the scraper and populate the database with current listings.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 w-full overflow-x-hidden">
      {/* Header - Light Professional Design */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3 sm:gap-4 w-full md:w-auto">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 shadow-sm border border-gray-200 flex-shrink-0">
                <img src="/fsbo-default.2328aad2.svg" alt="ForSaleByOwner Logo" className="h-8 sm:h-10 lg:h-12 w-auto" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2 tracking-tight break-words">
                  <span className="block">ForSaleByOwner</span>
                  <span className="block text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 font-medium mt-0.5 sm:mt-1">Dashboard</span>
                </h1>
                <p className="text-gray-600 text-sm sm:text-base lg:text-lg">
                  Property Listings
                </p>
              </div>
            </div>
            {/* Data Changed Indicator Only - Removed Total Listings, Refresh, and Logout buttons from individual pages */}
            {dataChanged && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
                <div className="bg-green-100 text-green-700 border border-green-300 px-3 sm:px-4 lg:px-5 py-2 sm:py-2.5 rounded-lg shadow-sm font-medium flex items-center gap-2 text-sm sm:text-base whitespace-nowrap">
                  <span className="text-sm">✓</span>
                  <span className="hidden sm:inline">Data Updated!</span>
                  <span className="sm:hidden">Updated!</span>
                </div>
              </div>
            )}
          </div>
          
          {/* URL Scraper Input Section */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Scrape from URL</h3>
              <p className="text-sm text-blue-700 mb-4">Enter a ForSaleByOwner.com URL to scrape a specific location</p>
              <UrlScraperInput
                expectedPlatform="fsbo"
                showDefaultValue={true}
                placeholder="https://www.forsalebyowner.com/search/list/chicago-illinois"
                onSuccess={(platform, url) => {
                  // Start polling for scraper completion
                  setIsScraperRunning(true)
                  setNotification({ message: '🔄 Scraper started! Listings will auto-refresh when complete.', type: 'info' })
                  setTimeout(() => setNotification(null), 5000)
                  setSyncProgress(`✅ Scraper started for ${platform}. Scraping ${url}...`)
                  setIsSyncing(true)
                  pollForListings(3000, 120)
                  // Note: pollForListings now checks backend status and stops automatically when scraper finishes
                }}
                onStop={() => {
                  // Immediately refresh listings when scraper is stopped
                  console.log('[FSBO] Scraper stopped - refreshing listings immediately...')
                  setIsScraperRunning(false)
                  setIsSyncing(false)
                  setNotification({ message: '🛑 Scraper stopped! Refreshing listings...', type: 'info' })
                  // Wait 1 second for Supabase to sync, then refresh
                  setTimeout(async () => {
                    try {
                      await fetchListings(true)
                      setNotification({ message: '✅ Listings refreshed from Supabase!', type: 'success' })
                      setTimeout(() => setNotification(null), 5000)
                    } catch (err) {
                      console.error('[FSBO] Error refreshing after stop:', err)
                      setNotification({ message: '⚠️ Failed to refresh. Please refresh manually.', type: 'info' })
                      setTimeout(() => setNotification(null), 5000)
                    }
                  }, 1000)
                }}
                onError={(error) => {
                  setSyncProgress(`❌ ${error}`)
                  setTimeout(() => setSyncProgress(''), 5000)
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Welcome Message Toast */}
      {showWelcomeMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top fade-in">
          <div className="bg-white rounded-lg shadow-lg border border-green-200 p-3 sm:p-4 max-w-xs w-full flex items-center gap-3">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Welcome back!</p>
            </div>
            <button
              onClick={() => setShowWelcomeMessage(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Sync Progress Banner */}
      {isSyncing && syncProgress && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 -mt-2">
          <div className="bg-blue-50 rounded-lg shadow-sm p-4 border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="animate-spin text-2xl">🔍</div>
              <div className="flex-1">
                <p className="text-blue-900 font-semibold text-lg">{syncProgress}</p>
                <p className="text-blue-700 text-sm mt-1">
                  New leads are being added to the list below in real-time...
                </p>
              </div>
              {data && data.listings && data.listings.length > 0 && (
                <div className="bg-white rounded-lg px-4 py-2 border border-blue-200">
                  <p className="text-blue-900 font-bold text-xl">{data.listings.length}</p>
                  <p className="text-blue-700 text-xs">leads found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


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
              {data?.scrape_timestamp ? formatDate(data.scrape_timestamp) : 'N/A'}
            </div>
            <div className="text-gray-500 text-xs mt-1 font-medium">
              Last scraped date
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
                Search FSBO Listings
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
                    setCurrentPage(1)
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

      {/* Listings Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-6">
        {(!data || !data.listings || data.listings.length === 0) && isSyncing ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-100">
              <div className="animate-spin text-6xl mb-4">🔍</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Searching for leads...</h3>
              <p className="text-gray-600">New leads will appear here as they are found</p>
            </div>
          </div>
        ) : filteredListings.length === 0 && searchQuery ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center border border-gray-100">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">No listings found</h3>
              <p className="text-gray-600 mb-4">No listings match your search query: <span className="font-semibold text-gray-800">"{searchQuery}"</span></p>
              <button
                onClick={() => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold"
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6 mb-6 sm:mb-8">
            {(() => {
              // Calculate pagination
              const totalPages = Math.ceil(filteredListings.length / listingsPerPage)
              const startIndex = (currentPage - 1) * listingsPerPage
              const endIndex = startIndex + listingsPerPage
              const currentListings = filteredListings.slice(startIndex, endIndex)

              return currentListings.map((listing: Listing, index: number) => {
                // Check if listing is new (not in stored previous URLs)
                const storedUrls = typeof window !== 'undefined'
                  ? JSON.parse(localStorage.getItem('previousListingUrls') || '[]')
                  : []
                const isNewListing = !storedUrls.includes(listing.listing_link)
                return (
                  <div
                    key={index}
                    className={`bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 overflow-hidden border ${isNewListing ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200 hover:border-blue-300'} transform hover:-translate-y-0.5 sm:hover:-translate-y-1`}
                  >
                    {isNewListing && (
                      <div className="bg-green-600 text-white text-xs font-semibold px-3 sm:px-4 py-1.5 sm:py-2 text-center shadow-sm">
                        NEW LISTING
                      </div>
                    )}
                    <div className="p-4 sm:p-5 lg:p-6">
                      {/* Address Section */}
                      <div className="mb-4 sm:mb-5 lg:mb-6">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 line-clamp-2 leading-tight mb-1">
                          {listing.address && listing.address !== 'null' && listing.address !== 'None'
                            ? listing.address
                            : 'Address Not Available'}
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm font-medium">Chicago, IL</p>
                      </div>

                      {/* Time of Post */}
                      {listing.time_of_post && listing.time_of_post !== 'null' && listing.time_of_post !== 'None' && (
                        <div className="text-xs text-gray-600 mb-3 sm:mb-4 text-center bg-gray-50 rounded-lg py-1.5 sm:py-2 px-2 sm:px-3 font-medium border border-gray-200">
                          Posted: {listing.time_of_post}
                        </div>
                      )}

                      {/* Property Details - Price, Beds, Baths, Sqft */}
                      <div className="mb-4 sm:mb-5 lg:mb-6 grid grid-cols-2 gap-2 sm:gap-3">
                        {/* Price */}
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                          <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Price</div>
                          <div className="text-sm sm:text-base font-bold text-gray-900">
                            {formatPrice(listing.price)}
                          </div>
                        </div>

                        {/* Beds */}
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                          <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Beds</div>
                          <div className="text-sm sm:text-base font-bold text-gray-900">
                            {formatNumber(listing.beds)}
                          </div>
                        </div>

                        {/* Baths */}
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                          <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Baths</div>
                          <div className="text-sm sm:text-base font-bold text-gray-900">
                            {formatNumber(listing.baths)}
                          </div>
                        </div>

                        {/* Square Feet */}
                        <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                          <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Sqft</div>
                          <div className="text-sm sm:text-base font-bold text-gray-900">
                            {listing.square_feet && listing.square_feet !== 'null' && listing.square_feet !== 'None' && listing.square_feet !== ''
                              ? `${formatNumber(listing.square_feet)} sqft`
                              : 'N/A'}
                          </div>
                        </div>
                      </div>

                      {/* Buttons - Responsive */}
                      <div className="flex flex-col gap-2 sm:gap-3 mt-4 sm:mt-5 lg:mt-6">
                        {listing.listing_link && (
                          <a
                            href={listing.listing_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full bg-blue-50 text-blue-700 border border-blue-300 text-center py-2.5 sm:py-3 lg:py-3.5 rounded-lg hover:bg-blue-100 active:bg-blue-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-0"
                          >
                            <span className="hidden sm:inline">View Listing</span>
                            <span className="sm:hidden">View Listing</span>
                            <span className="ml-1 sm:ml-2">→</span>
                          </a>
                        )}
                        {listing.address && listing.address !== 'null' && listing.address !== 'None' && (
                          <button
                            onClick={(e) => {
                              e.preventDefault()

                              // Store current scroll position before navigation
                              if (typeof window !== 'undefined') {
                                const scrollY = window.scrollY
                                sessionStorage.setItem('listingScrollPosition', scrollY.toString())
                                sessionStorage.setItem('listingAddress', listing.address || '')
                                sessionStorage.setItem('preventScrollRestore', 'true')
                                sessionStorage.setItem('sourcePage', 'main')

                                // Use window.location to navigate (prevents Next.js auto-scroll)
                                const params = new URLSearchParams({
                                  address: listing.address || ''
                                })
                                if (listing.listing_link) {
                                  params.append('listing_link', listing.listing_link)
                                }

                                window.location.href = `/owner-info?${params.toString()}`
                              }
                            }}
                            className="w-full bg-gray-50 text-gray-700 border border-gray-300 text-center py-2.5 sm:py-3 lg:py-3.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all duration-200 flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] focus:outline-none focus:ring-0"
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
                          className="w-full bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-300 text-center py-2.5 sm:py-3 lg:py-3.5 rounded-lg hover:from-blue-100 hover:to-blue-200 active:from-blue-200 active:to-blue-300 transition-all duration-200 font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-[1.02] active:scale-[0.98]"
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
                )
              })
            })()}
          </div>

        )}

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
        <div className="text-center mt-8 mb-6">
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
            {(() => {
              const storedUrls = typeof window !== 'undefined'
                ? JSON.parse(localStorage.getItem('previousListingUrls') || '[]')
                : []
              const listingsToCheck = searchQuery ? filteredListings : (data?.listings || [])
              const newCount = listingsToCheck.filter(l => !storedUrls.includes(l.listing_link)).length
              return (
                newCount > 0 && (
                  <div className="mt-4">
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200 max-w-xs mx-auto">
                      <p className="text-sm font-semibold text-green-700">
                        ✨ <span className="text-lg font-bold">{newCount}</span> new listings
                      </p>
                      <p className="text-xs text-green-600 mt-1">Shown at top</p>
                    </div>
                  </div>
                )
              )
            })()}
          </div>
        </div>
      </div>

      {/* Footer - Light Professional Design */}
      <footer className="bg-white border-t border-gray-200 mt-16 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Brand Section */}
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3 shadow-sm border border-gray-200">
                  <img src="/fsbo-default.2328aad2.svg" alt="ForSaleByOwner Logo" className="h-10 w-auto" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">ForSaleByOwner</h3>
                  <p className="text-gray-600 text-sm">Property Dashboard</p>
                </div>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Professional property management system for tracking and managing real estate listings.
              </p>
            </div>

            {/* Quick Links Section */}
            <div className="text-center md:text-left">
              <h4 className="text-gray-900 font-bold text-lg mb-4">Quick Links</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>View All Listings</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>Property Search</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>Owner Information</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-600 hover:text-gray-900 transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>Dashboard</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Information Section */}
            <div className="text-center md:text-left">
              <h4 className="text-gray-900 font-bold text-lg mb-4">Information</h4>
              <ul className="space-y-2">
                <li className="text-gray-600 text-sm flex items-center justify-center md:justify-start gap-2">
                  <span>📊</span>
                  <span>Real-time Data Updates</span>
                </li>
                <li className="text-gray-600 text-sm flex items-center justify-center md:justify-start gap-2">
                  <span>✅</span>
                  <span>Active Monitoring</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 my-8"></div>

          {/* Bottom Section */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="text-gray-600 text-sm">
                © {new Date().getFullYear()} <span className="font-semibold text-gray-900">ForSaleByOwner Dashboard</span>
              </p>
              <p className="text-gray-500 text-xs mt-1">Professional Property Management System</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <span className="text-green-500 animate-pulse">●</span>
                <span>System Active</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
