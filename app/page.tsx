'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

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

export default function Dashboard() {
  const router = useRouter()
  const [data, setData] = useState<ListingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null) // Track when scraper was last run
  const [dataChanged, setDataChanged] = useState(false)
  const [displayedCount, setDisplayedCount] = useState(20) // Initially show 20 listings
  const [syncProgress, setSyncProgress] = useState<string>('') // Progress message during sync
  const [isSyncing, setIsSyncing] = useState(false) // Track if sync is in progress
  const [searchQuery, setSearchQuery] = useState('') // Search query for filtering listings
  const [previousUrls, setPreviousUrls] = useState<Set<string>>(() => {
    // Load previous URLs from localStorage if available
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('previousListingUrls')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    }
    return new Set()
  })
  
  // Use ref to track current data for polling comparison (avoids dependency issues)
  const dataRef = useRef<ListingsData | null>(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  
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
    
    // Restore scroll position FIRST, before any other operations
    if (typeof window !== 'undefined') {
      const savedScrollPosition = sessionStorage.getItem('listingScrollPosition')
      const returningFromOwnerInfo = sessionStorage.getItem('returningFromOwnerInfo')
      const preventScrollRestore = sessionStorage.getItem('preventScrollRestore')
      
      if (savedScrollPosition && (returningFromOwnerInfo || preventScrollRestore)) {
        const scrollPos = parseInt(savedScrollPosition, 10)
        
        // Function to restore scroll position
        const restoreScroll = () => {
          if (window.scrollY !== scrollPos) {
            window.scrollTo({
              top: scrollPos,
              left: 0,
              behavior: 'instant'
            })
          }
        }
        
        // Restore immediately
        restoreScroll()
        
        // Restore on next frame and multiple delays to ensure it sticks
        requestAnimationFrame(() => {
          restoreScroll()
          setTimeout(restoreScroll, 0)
          setTimeout(restoreScroll, 10)
          setTimeout(restoreScroll, 50)
          setTimeout(restoreScroll, 100)
          setTimeout(restoreScroll, 200)
          setTimeout(restoreScroll, 500)
        })
        
        // Also restore when DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', restoreScroll)
        }
        
        // Monitor and restore scroll position for first 2 seconds
        const scrollMonitor = setInterval(() => {
          if (Math.abs(window.scrollY - scrollPos) > 10) {
            restoreScroll()
          } else {
            clearInterval(scrollMonitor)
          }
        }, 50)
        
        setTimeout(() => clearInterval(scrollMonitor), 2000)
        
        // Clean up after a delay
        setTimeout(() => {
          sessionStorage.removeItem('listingScrollPosition')
          sessionStorage.removeItem('returningFromOwnerInfo')
          sessionStorage.removeItem('preventScrollRestore')
        }, 2000)
      }
    }
    
    // Fetch listings when page loads (after scroll restoration setup)
    fetchListings()
  }, []) // Only run once on mount

  // Function to check if property is sold
  const isPropertySold = (listing: Listing): boolean => {
    // Check address, price, and other fields for sold indicators
    const address = (listing.address || '').toLowerCase()
    const price = (listing.price || '').toLowerCase()
    
    const soldIndicators = [
      'sold',
      'this property has been sold',
      'property sold',
      'no longer available',
      'listing removed',
      'off market',
    ]
    
    const combinedText = `${address} ${price}`.toLowerCase()
    return soldIndicators.some(indicator => combinedText.includes(indicator))
  }

  const fetchListings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/listings?' + new Date().getTime(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        }
      }) // Cache busting + no-store
      
      if (!response.ok) {
        // If API returns error, still try to show empty state instead of error
        const errorData = await response.json().catch(() => ({}))
        console.warn('API returned error, showing empty state:', errorData)
        setData({
          scrape_timestamp: new Date().toISOString(),
          total_listings: 0,
          listings: []
        })
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
      
      setData(result)
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
      
      // Reset displayed count if new data has different count
      if (data && result.listings.length !== data.listings.length) {
        setDisplayedCount(20) // Reset to show first 20
      }
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching listings:', err)
    } finally {
      setLoading(false)
    }
  }

  // Poll for listings while syncing - updates UI in real-time
  // Optimized to reduce lag during sync
  const pollForListings = (interval: number = 3000, maxAttempts: number = 120): ReturnType<typeof setInterval> => {
    let attempts = 0
    let lastCount = 0
    const pollInterval = setInterval(async () => {
      attempts++
      try {
        const response = await fetch('/api/listings?' + new Date().getTime(), {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
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
      }
    }, interval) // Increased to 3 seconds during sync to reduce lag
    
    return pollInterval
  }

  // Handle manual refresh (runs scraper + syncs + fetches)
  const handleRefresh = async () => {
    try {
      setIsSyncing(true)
      setSyncProgress('🔍 Starting to find new leads...')
      setError(null)
      
      // Start polling for listings immediately - this will update the UI in real-time
      const pollInterval = pollForListings(3000, 120) // Poll every 3 seconds (reduced frequency to prevent lag)
      
      // Step 1: Run scraper and sync to Supabase
      console.log('🔄 Step 1: Scraping data from website...')
      console.log('🔄 Step 2: Storing listings directly in database...')
      setSyncProgress('🔍 Searching for new leads...')
      
      const syncResponse = await fetch('/api/auto-sync', { method: 'POST' })
      
      if (!syncResponse.ok) {
        clearInterval(pollInterval)
        const errorData = await syncResponse.json()
        throw new Error(errorData.error || 'Failed to sync listings')
      }
      
      const syncResult = await syncResponse.json()
      console.log('✅ Sync complete:', syncResult)
      console.log(`✅ Added: ${syncResult.stats?.added || 0} new listings`)
      console.log(`✅ Updated: ${syncResult.stats?.updated || 0} listings`)
      console.log(`✅ Total in database: ${syncResult.stats?.total || 0} listings`)
      
      // Update last refresh time using the timestamp from sync result
      if (syncResult.timestamp) {
        setLastRefreshTime(new Date(syncResult.timestamp))
      } else {
        setLastRefreshTime(new Date())
      }
      
      // Continue polling for a bit more to catch any final listings
      setSyncProgress(`✅ Found ${syncResult.stats?.total || 0} leads! Updating list...`)
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Stop polling and fetch final data
      clearInterval(pollInterval)
      
      // Step 2: Fetch fresh data from Supabase
      await fetchListings()
      
      // Step 4: Ensure lastRefreshTime reflects the sync timestamp
      if (syncResult.timestamp) {
        const syncTimestamp = new Date(syncResult.timestamp)
        setLastRefreshTime(prev => {
          if (!prev || syncTimestamp >= prev) {
            return syncTimestamp
          }
          return prev
        })
      }
      
      setSyncProgress('')
      setIsSyncing(false)
      
    } catch (err: any) {
      setError(err.message || 'Failed to refresh listings')
      console.error('Error refreshing listings:', err)
      setSyncProgress('')
      setIsSyncing(false)
      // Still try to fetch existing data even if sync failed
      await fetchListings()
    }
  }

  const formatPrice = (price: string | null | undefined) => {
    if (!price || price === 'null' || price === 'None' || price === '') return 'Price on Request'
    
    // Clean up the price string
    let cleanPrice = String(price).trim()
    
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
  
  const formatNumber = (value: string | null | undefined): string => {
    if (!value || value === 'null' || value === 'None' || value === '') return 'N/A'
    
    const str = String(value).trim()
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

  // Helper function to normalize text for search (remove extra spaces, trim, lowercase)
  const normalizeForSearch = (text: string | null | undefined): string => {
    if (!text || text === 'null' || text === 'None' || text === '') return ''
    // Convert to string, trim, lowercase, and normalize whitespace
    return String(text).toLowerCase().trim().replace(/\s+/g, ' ')
  }
  
  // Helper function to check if query matches text (more precise matching for owner names)
  const matchesSearch = (text: string, query: string): boolean => {
    if (!text || !query) return false
    
    // Normalize both for comparison
    const normalizedText = text.toLowerCase().trim()
    const normalizedQuery = query.toLowerCase().trim()
    
    // 1. Exact match (case-insensitive)
    if (normalizedText === normalizedQuery) return true
    
    // 2. Direct substring match (query is contained in text)
    if (normalizedText.includes(normalizedQuery)) return true
    
    // 3. Split into words for word-by-word matching
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 0)
    const textWords = normalizedText.split(/\s+/).filter(w => w.length > 0)
    
    // If query is a single word, check if it matches any word in text
    if (queryWords.length === 1) {
      const queryWord = queryWords[0]
      // For single word, check if it's an exact match of any word OR starts with it
      return textWords.some(word => {
        // Exact word match
        if (word === queryWord) return true
        // Word starts with query (for partial matching like "John" matching "Johnny")
        if (word.startsWith(queryWord) && queryWord.length >= 3) return true
        // Query starts with word (for reverse partial matching)
        if (queryWord.startsWith(word) && word.length >= 3) return true
        return false
      })
    }
    
    // Multiple words - all words must be present (in any order)
    if (queryWords.length > 1) {
      // Check if all query words are found in text
      return queryWords.every(queryWord => {
        return textWords.some(textWord => {
          // Exact word match
          if (textWord === queryWord) return true
          // Word starts with query word (for partial matching)
          if (textWord.startsWith(queryWord) && queryWord.length >= 3) return true
          // Query word starts with text word (for reverse partial matching)
          if (queryWord.startsWith(textWord) && textWord.length >= 3) return true
          return false
        })
      })
    }
    
    return false
  }

  // Filter listings based on search query
  const filterListings = (listings: Listing[]): Listing[] => {
    if (!searchQuery.trim()) {
      return listings
    }

    // Normalize search query (remove extra spaces, trim, lowercase)
    const query = normalizeForSearch(searchQuery)
    
    if (!query) return listings
    
    return listings.filter(listing => {
      // Search ONLY in owner name and mailing address (not email, phone, or other fields)
      
      // Search in owner name (handle null, undefined, 'null', 'None', empty string)
      // Use STRICT matching for owner names to avoid false positives
      const ownerNameRaw = listing.owner_name
      if (ownerNameRaw) {
        const ownerNameStr = String(ownerNameRaw).trim()
        if (ownerNameStr && ownerNameStr !== 'null' && ownerNameStr !== 'None' && ownerNameStr !== '') {
          const ownerName = normalizeForSearch(ownerNameStr)
          if (ownerName && ownerName.length > 0) {
            // 1. Exact match (case-insensitive) - highest priority
            if (ownerName === query) return true
            
            // 2. Owner name starts with query (for partial name search like "John" matching "John Smith")
            if (ownerName.startsWith(query) && query.length >= 3) return true
            
            // 3. Query is a complete word in owner name (for searching last name or company name)
            const ownerWords = ownerName.split(/\s+/)
            const queryWords = query.split(/\s+/)
            
            // If query is single word, check if it matches any complete word in owner name
            if (queryWords.length === 1) {
              const queryWord = queryWords[0]
              if (ownerWords.some(word => word === queryWord || word.startsWith(queryWord))) {
                return true
              }
            }
            
            // If query has multiple words, all must be present as complete words
            if (queryWords.length > 1) {
              const allWordsMatch = queryWords.every(queryWord => {
                return ownerWords.some(ownerWord => ownerWord === queryWord || ownerWord.startsWith(queryWord))
              })
              if (allWordsMatch) return true
            }
            
            // 4. Owner name contains query as substring (only if query is substantial)
            if (ownerName.includes(query) && query.length >= 4) return true
          }
        }
      }
      
      // Search in mailing address
      // Check multiple ways mailing_address might be stored
      const mailingAddressRaw = listing.mailing_address || listing.mailingAddress || (listing as any).mailing_address
      if (mailingAddressRaw) {
        const mailingAddressStr = String(mailingAddressRaw).trim()
        if (mailingAddressStr && mailingAddressStr !== 'null' && mailingAddressStr !== 'None' && mailingAddressStr !== '') {
          const mailingAddress = normalizeForSearch(mailingAddressStr)
          if (mailingAddress && mailingAddress.length > 0) {
            // Simple substring match (most reliable)
            if (mailingAddress.includes(query)) return true
            // Reverse match (query contains mailing address)
            if (query.includes(mailingAddress)) return true
            // Word-by-word match for multi-word queries
            if (matchesSearch(mailingAddress, query)) return true
          }
        }
      }
      
      return false
    })
  }

  // Get filtered listings
  const filteredListings = data?.listings ? filterListings(data.listings) : []

  if (loading && !isSyncing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 bg-blue-600 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-white text-xl font-semibold">Loading listings...</p>
          <p className="text-blue-200 text-sm mt-2">Please wait while we fetch the latest data</p>
        </div>
      </div>
    )
  }


  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center border border-gray-100">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={fetchListings}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Don't show empty state if we're syncing - show the main view with progress banner instead
  if ((!data || !data.listings || data.listings.length === 0) && !isSyncing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 w-full overflow-x-hidden">
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 shadow-2xl border-b-4 border-blue-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 shadow-lg">
                  <span className="text-4xl">🏠</span>
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
                    ForSaleByOwner
                    <span className="block text-2xl md:text-3xl text-blue-200 font-semibold mt-1">Dashboard</span>
                  </h1>
                  <p className="text-blue-100 text-lg font-medium flex items-center gap-2">
                    <span className="text-xl">📍</span>
                    Chicago, Illinois Property Listings
                  </p>
                </div>
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading || isSyncing}
                className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-xl hover:bg-white/30 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 font-semibold shadow-lg hover:shadow-xl border border-white/30 hover:border-white/50"
              >
                <span className={`text-lg ${isSyncing ? 'animate-spin' : 'animate-spin-slow'}`}>🔄</span>
                {isSyncing ? 'Syncing...' : loading ? 'Loading...' : 'Sync Data'}
              </button>
            </div>
          </div>
        </header>

        {/* No Listings Message */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-white rounded-2xl shadow-2xl p-12 max-w-2xl mx-auto text-center border border-gray-100">
            <div className="text-gray-400 text-8xl mb-6">📭</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4">No Listings Available</h2>
            <p className="text-gray-600 text-lg mb-8">
              The database is currently empty. Click the button below to sync data from the website.
            </p>
            <div className="space-y-4">
              <button
                onClick={handleRefresh}
                disabled={loading || isSyncing}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 mx-auto"
              >
                {isSyncing || loading ? (
                  <>
                    <span className="animate-spin">🔄</span>
                    <span>Syncing Data...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl">🚀</span>
                    <span>Sync Data from Website</span>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 w-full overflow-x-hidden">
      {/* Header - Darker Blue Professional Design */}
      <header className="bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 shadow-xl border-b-4 border-teal-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-white rounded-2xl p-3 shadow-lg border border-blue-300">
                <img src="/fsbo-default.2328aad2.svg" alt="ForSaleByOwner Logo" className="h-12 w-auto" />
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
                  ForSaleByOwner
                  <span className="block text-2xl md:text-3xl text-teal-300 font-semibold mt-1">Dashboard</span>
                </h1>
                <p className="text-blue-100 text-lg font-medium">
                  Chicago, Illinois Property Listings
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {dataChanged && (
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-5 py-2.5 rounded-xl shadow-lg font-semibold flex items-center gap-2 animate-pulse">
                  <span className="text-lg">✓</span>
                  Data Updated!
                </div>
              )}
              <button
                onClick={handleRefresh}
                disabled={loading || isSyncing}
                className="bg-teal-600 text-white px-6 py-3 rounded-xl hover:bg-teal-700 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 font-semibold shadow-lg hover:shadow-xl"
              >
                <span className={`text-lg ${isSyncing ? 'animate-spin' : 'animate-spin-slow'}`}>🔄</span>
                {isSyncing ? 'Syncing...' : loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Sync Progress Banner */}
      {isSyncing && syncProgress && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 -mt-2">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-lg p-4 border border-blue-400/30 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="animate-spin text-2xl">🔍</div>
              <div className="flex-1">
                <p className="text-white font-semibold text-lg">{syncProgress}</p>
                <p className="text-blue-100 text-sm mt-1">
                  New leads are being added to the list below in real-time...
                </p>
              </div>
              {data && data.listings && data.listings.length > 0 && (
                <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
                  <p className="text-white font-bold text-xl">{data.listings.length}</p>
                  <p className="text-blue-100 text-xs">leads found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search Bar - Professional Design */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 -mt-2">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
                🔍 Search Listings
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-xl">🔍</span>
                <input
                  id="search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setDisplayedCount(20)
                  }}
                  placeholder="Search by owner name or mailing address..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-teal-500 focus:ring-4 focus:ring-teal-100 outline-none transition-all text-gray-800 placeholder-gray-400 bg-gray-50 focus:bg-white font-medium"
                />
              </div>
            </div>
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setDisplayedCount(20)
                }}
                className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap text-sm mt-6 md:mt-0 shadow-sm hover:shadow-md"
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

      {/* Stats - Professional Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Available Listings Card */}
          <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-700 rounded-2xl shadow-2xl p-6 text-white transform hover:scale-105 transition-all duration-300 border-2 border-blue-400/30 hover:border-blue-300/50">
            <div className="mb-4">
              <div className="text-5xl font-extrabold">
                {searchQuery ? filteredListings.length : (data?.total_listings || 0)}
              </div>
            </div>
            <div className="text-blue-100 text-sm font-bold uppercase tracking-wide">
              {searchQuery ? 'Filtered Listings' : 'Available Listings'}
            </div>
            <div className="text-blue-200 text-xs mt-2 font-medium">
              {searchQuery ? 'Matching search criteria' : 'Active properties'}
            </div>
          </div>

          {/* Last Updated Card */}
          <div className="bg-gradient-to-br from-purple-600 via-indigo-700 to-purple-700 rounded-2xl shadow-2xl p-6 text-white transform hover:scale-105 transition-all duration-300 border-2 border-purple-400/30 hover:border-purple-300/50">
            <div className="text-purple-100 text-sm font-bold uppercase tracking-wide mb-2">Last Updated</div>
            <div className="text-xl font-bold">
              {(() => {
                const displayTime = lastRefreshTime || (data?.scrape_timestamp ? new Date(data.scrape_timestamp) : new Date())
                return formatDate(displayTime.toISOString())
              })()}
            </div>
            {lastRefreshTime && data?.scrape_timestamp && (
              <div className="text-purple-200 text-xs mt-2 font-medium">
                Data from: {formatDate(data.scrape_timestamp)}
              </div>
            )}
          </div>

          {/* Status Card */}
          <div className="bg-gradient-to-br from-teal-600 via-cyan-700 to-teal-700 rounded-2xl shadow-2xl p-6 text-white transform hover:scale-105 transition-all duration-300 border-2 border-teal-400/30 hover:border-teal-300/50">
            <div className="text-teal-100 text-sm font-bold uppercase tracking-wide mb-2">Status</div>
            <div className="text-xl font-bold">Active</div>
            {lastFetchTime && (
              <div className="text-teal-200 text-xs mt-2 font-medium">
                Last checked: {lastFetchTime.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Listings Grid */}
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
                  setDisplayedCount(20)
                }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold"
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {filteredListings.slice(0, displayedCount).map((listing, index) => {
            // Check if listing is new (not in stored previous URLs)
            const storedUrls = typeof window !== 'undefined' 
              ? JSON.parse(localStorage.getItem('previousListingUrls') || '[]')
              : []
            const isNewListing = !storedUrls.includes(listing.listing_link)
            return (
            <div
              key={index}
              className={`bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border ${isNewListing ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200 hover:border-blue-300'} transform hover:-translate-y-1`}
            >
              {isNewListing && (
                <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-green-500 text-white text-xs font-bold px-4 py-2 text-center shadow-md">
                  NEW LISTING
                </div>
              )}
              <div className="p-6">
                {/* Address Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight mb-1">
                    {listing.address && listing.address !== 'null' && listing.address !== 'None' 
                      ? listing.address 
                      : 'Address Not Available'}
                  </h3>
                  <p className="text-gray-500 text-sm font-medium">Chicago, IL</p>
                </div>
                
                {/* Time of Post */}
                {listing.time_of_post && listing.time_of_post !== 'null' && listing.time_of_post !== 'None' && (
                  <div className="text-xs text-gray-600 mb-6 text-center bg-gradient-to-r from-slate-50 to-blue-50 rounded-lg py-2 px-3 font-medium border border-gray-100">
                    Posted: {listing.time_of_post}
                  </div>
                )}

                {/* Buttons - More Professional */}
                <div className="flex flex-col gap-3 mt-6">
                  {listing.listing_link && (
                    <a
                      href={listing.listing_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white text-center py-3.5 rounded-lg hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-200 font-semibold shadow-md hover:shadow-lg transform hover:scale-[1.02] text-sm"
                    >
                      View Listing →
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
                      className="w-full bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white text-center py-3.5 rounded-lg hover:from-teal-700 hover:via-cyan-700 hover:to-blue-700 transition-all duration-200 flex items-center justify-center gap-2 font-semibold shadow-md hover:shadow-lg transform hover:scale-[1.02] text-sm"
                    >
                      Owner Information
                    </button>
                  )}
                </div>
              </div>
            </div>
            )
          })}
        </div>

        )}
        
        {/* Load More Button */}
        {filteredListings.length > displayedCount && (
          <div className="flex justify-center mt-8 mb-4">
            <button
              onClick={() => {
                const newCount = Math.min(displayedCount + 20, filteredListings.length)
                setDisplayedCount(newCount)
              }}
              className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white px-10 py-4 rounded-xl hover:from-teal-700 hover:via-cyan-700 hover:to-blue-700 transition-all duration-200 flex items-center gap-3 text-lg font-bold shadow-xl hover:shadow-2xl transform hover:scale-105"
            >
              <span className="text-2xl">📄</span>
              Load More Listings
              <span className="text-sm opacity-90 font-normal bg-white/20 px-3 py-1 rounded-lg">
                {filteredListings.length - displayedCount} more available
              </span>
            </button>
          </div>
        )}

        {/* Show All Button (if not all shown) */}
        {filteredListings.length > 0 && displayedCount < filteredListings.length && (
          <div className="flex justify-center mt-2 mb-6">
            <button
              onClick={() => setDisplayedCount(filteredListings.length)}
              className="text-teal-600 hover:text-teal-700 font-semibold text-base underline decoration-2 underline-offset-4 transition-colors"
            >
              Show All {filteredListings.length} {searchQuery ? 'Filtered' : ''} Listings
            </button>
          </div>
        )}

        {/* Display Info */}
        <div className="text-center mt-8 mb-6">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 max-w-2xl mx-auto">
            <p className="text-xl font-bold text-gray-800 mb-4">
              Showing <span className="text-blue-600 text-2xl">{Math.min(displayedCount, filteredListings.length)}</span> of{' '}
              <span className="text-blue-600 text-2xl">{filteredListings.length}</span> {searchQuery ? 'filtered' : ''} listings
              {searchQuery && data?.listings && (
                <span className="text-gray-500 text-base font-normal ml-2">
                  (out of {data.listings.length} total)
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
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200 max-w-xs mx-auto">
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

      {/* Footer - Darker Blue Professional Design */}
      <footer className="bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 border-t-4 border-teal-500 mt-16 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {/* Brand Section */}
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-4">
                <div className="bg-white rounded-xl p-3 shadow-md border border-blue-400">
                  <img src="/fsbo-default.2328aad2.svg" alt="ForSaleByOwner Logo" className="h-10 w-auto" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">ForSaleByOwner</h3>
                  <p className="text-blue-100 text-sm">Property Dashboard</p>
                </div>
              </div>
              <p className="text-blue-100 text-sm leading-relaxed">
                Professional property management system for tracking and managing real estate listings in Chicago, Illinois.
              </p>
            </div>

            {/* Quick Links Section */}
            <div className="text-center md:text-left">
              <h4 className="text-white font-bold text-lg mb-4">Quick Links</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-blue-100 hover:text-white transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>View All Listings</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="text-blue-100 hover:text-white transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>Property Search</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="text-blue-100 hover:text-white transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>Owner Information</span>
                  </a>
                </li>
                <li>
                  <a href="#" className="text-blue-100 hover:text-white transition-colors text-sm flex items-center justify-center md:justify-start gap-2">
                    <span>→</span>
                    <span>Dashboard</span>
                  </a>
                </li>
              </ul>
            </div>

            {/* Information Section */}
            <div className="text-center md:text-left">
              <h4 className="text-white font-bold text-lg mb-4">Information</h4>
              <ul className="space-y-2">
                <li className="text-blue-100 text-sm flex items-center justify-center md:justify-start gap-2">
                  <span>📍</span>
                  <span>Chicago, Illinois</span>
                </li>
                <li className="text-blue-100 text-sm flex items-center justify-center md:justify-start gap-2">
                  <span>📊</span>
                  <span>Real-time Data Updates</span>
                </li>
                <li className="text-blue-100 text-sm flex items-center justify-center md:justify-start gap-2">
                  <span>✅</span>
                  <span>Active Monitoring</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-blue-400/50 my-8"></div>

          {/* Bottom Section */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="text-blue-100 text-sm">
                © {new Date().getFullYear()} <span className="font-semibold text-white">ForSaleByOwner Dashboard</span>
              </p>
              <p className="text-blue-200 text-xs mt-1">Professional Property Management System</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-blue-100 text-sm">
                <span className="text-emerald-300 animate-pulse">●</span>
                <span>System Active</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

