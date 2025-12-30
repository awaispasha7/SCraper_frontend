'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AuthGuard from '@/app/components/AuthGuard'
import ScraperRunButton from '@/app/components/ScraperRunButton'
import EnrichmentBadge from '@/app/components/EnrichmentBadge'
import { createClient } from '@/lib/supabase-client'

interface ApartmentListing {
  id: number
  address: string
  price: string | number
  beds: string | number
  baths: string | number
  square_feet: string | number
  listing_link: string
  property_type: string
  description: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  street: string | null
  owner_name?: string | null
  owner_email?: string | null
  phone_numbers?: string | null
  emails?: string | null
  phones?: string | null
  title?: string | null
  full_address?: string | null
  mailing_address?: string | null
  enrichment_status?: string | null
}

interface ApartmentListingsData {
  total_listings: number
  scrape_date: string
  listings: ApartmentListing[]
}

function ApartmentsPageContent() {
  const router = useRouter()
  const [data, setData] = useState<ApartmentListingsData | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('apartmentsListingsData')
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
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1) // Current page number
  const listingsPerPage = 20 // Listings per page
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null) // Track when scraper was last run
  const [syncProgress, setSyncProgress] = useState<string>('') // Progress message during sync
  const [isSyncing, setIsSyncing] = useState(false) // Track if sync is in progress

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

  const handleDownload = (listing: ApartmentListing) => {
    const escapeCSV = (value: string | number | null | undefined): string => {
      if (value === null || value === undefined || value === '' || value === 'null' || value === 'No email addresses found' || value === 'no email found' || value === 'no data') {
        return ''
      }
      const str = String(value).trim()
      if (!str || str === '') return ''
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const csvData = [
      ['address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'description', 'neighborhood', 'city', 'state', 'zip_code', 'street', 'owner_name', 'owner_email', 'phone_numbers', 'emails', 'phones', 'title', 'full_address'].join(','),
      [
        escapeCSV(listing.address),
        escapeCSV(listing.price),
        escapeCSV(listing.beds),
        escapeCSV(listing.baths),
        escapeCSV(listing.square_feet),
        escapeCSV(listing.listing_link),
        escapeCSV(listing.property_type),
        escapeCSV(listing.description),
        escapeCSV(listing.neighborhood),
        escapeCSV(listing.city),
        escapeCSV(listing.state),
        escapeCSV(listing.zip_code),
        escapeCSV(listing.street),
        escapeCSV(listing.owner_name),
        escapeCSV(listing.owner_email),
        escapeCSV(listing.phone_numbers),
        escapeCSV(listing.emails),
        escapeCSV(listing.phones),
        escapeCSV(listing.title),
        escapeCSV(listing.full_address)
      ].join(',')
    ].join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const addressStr = listing.address ? String(listing.address).replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'listing'
    const filename = `apartments_${addressStr}_${listing.id || Date.now()}.csv`
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

      if (savedScrollPosition && (returningFromOwnerInfo || preventScrollRestore) && sourcePage === 'apartments') {
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

  // Poll for listings while syncing - updates UI in real-time
  const pollForListings = (interval: number = 3000, maxAttempts: number = 120): ReturnType<typeof setInterval> => {
    let attempts = 0
    let lastCount = 0
    const pollInterval = setInterval(async () => {
      attempts++
      try {
        const response = await fetch('/api/apartments-listings?' + new Date().getTime(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        })
        if (response.ok) {
          const result = await response.json()
          const newCount = result.listings?.length || 0
          if (newCount !== lastCount) {
            lastCount = newCount
            if (newCount > 0) {
              setSyncProgress(`🔍 Found ${newCount} new leads! List updating...`)
              // Update data immediately
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
              if (typeof window !== 'undefined') {
                try {
                  sessionStorage.setItem('apartmentsListingsData', JSON.stringify(normalizedResult))
                } catch (e) { }
              }
            } else {
              setSyncProgress(`🔍 Searching... ${newCount} leads found so far`)
            }
          } else {
            setSyncProgress(`🔍 Found ${newCount} leads! List updating...`)
          }
        }
      } catch (err) {
        // Silently fail polling
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval)
      }
    }, interval)

    return pollInterval
  }

  // Handle manual refresh (just fetches already-scraped data)
  const handleRefresh = async () => {
    await fetchListings(true)
  }

  const fetchListings = async (forceRefresh: boolean = false) => {
    try {
      const hasExistingData = data && data.listings && data.listings.length > 0

      // Always show loading when force refreshing, or when there's no existing data
      if (forceRefresh || !hasExistingData) {
        setLoading(true)
      }

      setError(null)

      // Clear sessionStorage cache if forcing refresh
      if (forceRefresh && typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('apartmentsListingsData')
        } catch (e) {
          // Ignore storage errors
        }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      // Add timestamp to force fresh fetch
      const timestamp = new Date().getTime()
      const response = await fetch(`/api/apartments-listings?t=${timestamp}&_=${Math.random()}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        priority: 'high'
      } as RequestInit)

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (!hasExistingData || forceRefresh) {
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

      // Update sessionStorage with fresh data
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem('apartmentsListingsData', JSON.stringify(normalizedResult))
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
      console.error('Error fetching Apartments listings:', err)
    } finally {
      setLoading(false)
    }
  }

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

  const formatSquareFeet = (sqft: string | number | null | undefined): string => {
    if (!sqft || sqft === 'null' || sqft === 'None' || sqft === '') return 'N/A'
    const str = String(sqft).trim()
    const num = parseInt(str.replace(/,/g, ''))
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
        (listing.full_address && listing.full_address.toLowerCase().includes(query)) ||
        (listing.street && listing.street.toLowerCase().includes(query)) ||
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
        (listing.neighborhood && listing.neighborhood.toLowerCase().includes(query)) ||
        (listing.city && listing.city.toLowerCase().includes(query)) ||
        (listing.description && listing.description.toLowerCase().includes(query)) ||
        // Owner Details
        (listing.owner_name && listing.owner_name.toLowerCase().includes(query)) ||
        (listing.mailing_address && listing.mailing_address.toLowerCase().includes(query)) ||
        (listing.owner_email && listing.owner_email.toLowerCase().includes(query)) ||
        (listing.phone_numbers && toSearchableString(listing.phone_numbers).includes(query))
      )
    })
  }, [data?.listings, searchQuery])

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-cyan-600 mx-auto mb-6"></div>
          <p className="text-gray-900 text-xl font-semibold">Loading Apartments listings...</p>
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
            onClick={() => fetchListings(true)}
            className="bg-cyan-50 text-cyan-700 border border-cyan-300 px-8 py-3 rounded-lg hover:bg-cyan-100 transition-all duration-200 shadow-sm hover:shadow-md font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if ((!data || !data.listings || data.listings.length === 0) && !isSyncing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md text-center border border-gray-200">
          <div className="text-gray-400 text-8xl mb-6">📭</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">No Listings Available</h2>
          <p className="text-gray-600 text-lg mb-8">
            The database is currently empty. Click the button below to sync data from the website.
          </p>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bg-cyan-600 text-white px-8 py-4 rounded-lg hover:bg-cyan-700 transition-all duration-200 font-medium shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="animate-spin inline-block mr-2">🔄</span>
                <span>Refreshing Data...</span>
              </>
            ) : (
              <>
                <span className="mr-2">🔄</span>
                <span>Refresh Data</span>
              </>
            )}
          </button>
          <p className="text-gray-500 text-sm mt-4">
            This will run the scraper and populate the database with current listings.
          </p>
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
                src="/apartments_logo.png"
                alt="Apartments Logo"
                width={60}
                height={60}
                className="rounded-lg shadow-md w-10 h-10 sm:w-[60px] sm:h-[60px]"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-1 sm:mb-2 tracking-tight">
                  Apartments Listings
                </h1>
                <p className="text-gray-600 text-sm sm:text-base lg:text-lg">
                  Apartment Rental Listings - Chicago, IL
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 w-full md:w-auto">
              <div className="bg-cyan-50 rounded-lg px-4 sm:px-5 lg:px-6 py-2.5 sm:py-3 border border-cyan-200 flex-shrink-0">
                <div className="text-2xl sm:text-3xl font-bold text-cyan-700">{data?.total_listings ?? 0}</div>
                <div className="text-xs sm:text-sm text-cyan-600 font-medium">Total Listings</div>
              </div>
              <ScraperRunButton
                scraperId="apartments"
                scraperName="Apartments"
                endpoint="/api/trigger-apartments"
                color="cyan"
              />
              <div className="flex items-center gap-2 sm:gap-3 flex-1 md:flex-initial">
                <button
                  onClick={() => fetchListings(true)}
                  disabled={loading || isSyncing}
                  className="bg-cyan-50 text-cyan-700 border border-cyan-300 px-4 sm:px-5 lg:px-6 py-2.5 sm:py-2.5 lg:py-3 rounded-lg hover:bg-cyan-100 transition-all duration-200 flex items-center justify-center gap-2 font-medium shadow-sm hover:shadow-md text-sm sm:text-base flex-1 sm:flex-initial min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className={`text-base sm:text-lg ${loading ? 'animate-spin' : ''}`}>🔄</span>
                  <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
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
        </div>
      </header>


      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 -mt-2">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 w-full">
              <label htmlFor="search" className="block text-sm font-semibold text-gray-700 mb-2">
                Search Apartments Listings
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by address, owner, neighborhood, city, or description"
                  className="w-full pl-12 pr-4 py-3.5 rounded-lg border-2 border-gray-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 outline-none transition-all text-gray-800 placeholder-gray-400 bg-white focus:bg-white font-medium"
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
              <span className="font-bold text-cyan-600">{filteredListings.length}</span> listing{filteredListings.length !== 1 ? 's' : ''} found
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

            return currentListings.map((listing: ApartmentListing) => (
              <div
                key={listing.id}
                className="bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 hover:border-cyan-300 transform hover:-translate-y-0.5 sm:hover:-translate-y-1"
              >
                <div className="p-4 sm:p-5 lg:p-6">
                  <div className="mb-3 sm:mb-4">
                    {/* Show title if available */}
                    {listing.title && (
                      <h2 className="text-sm sm:text-base font-semibold text-cyan-700 mb-1 line-clamp-1">
                        {listing.title}
                      </h2>
                    )}
                    {/* Show address - prioritize full_address, then address, then street */}
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 line-clamp-2 leading-tight">
                        {listing.full_address || listing.address || listing.street || 'Address Not Available'}
                      </h3>
                      <EnrichmentBadge status={listing.enrichment_status} />
                    </div>
                    {/* Show street separately if it's different from the main address */}
                    {listing.street && listing.street !== listing.full_address && listing.street !== listing.address && (
                      <p className="text-gray-500 text-xs sm:text-sm font-medium mt-1">{listing.street}</p>
                    )}
                    {listing.neighborhood && (
                      <p className="text-gray-500 text-xs sm:text-sm font-medium mt-1">{listing.neighborhood}</p>
                    )}
                    {listing.city && listing.state && (
                      <p className="text-gray-500 text-xs sm:text-sm font-medium">{listing.city}, {listing.state} {listing.zip_code || ''}</p>
                    )}
                  </div>

                  {listing.property_type && (
                    <div className="mb-3 sm:mb-4">
                      <span className="inline-block bg-cyan-100 text-cyan-700 text-xs font-semibold px-2 sm:px-3 py-1 rounded-full">
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

                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">Sqft</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {formatSquareFeet(listing.square_feet)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:gap-3 mt-4 sm:mt-5 lg:mt-6">
                    {listing.listing_link && (
                      <a
                        href={listing.listing_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full bg-cyan-50 text-cyan-700 border border-cyan-300 text-center py-2.5 sm:py-3 rounded-lg hover:bg-cyan-100 active:bg-cyan-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-0"
                      >
                        <span className="hidden sm:inline">View Listing</span>
                        <span className="sm:hidden">View</span>
                        <span className="ml-1 sm:ml-2">→</span>
                      </a>
                    )}
                    {(listing.address || listing.listing_link) && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          if (typeof window !== 'undefined') {
                            const scrollY = window.scrollY
                            sessionStorage.setItem('listingScrollPosition', scrollY.toString())
                            sessionStorage.setItem('listingAddress', listing.address || '')
                            sessionStorage.setItem('preventScrollRestore', 'true')
                            sessionStorage.setItem('sourcePage', 'apartments')
                            const params = new URLSearchParams({
                              address: listing.address || '',
                              source: 'apartments'
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
                      className="w-full bg-gradient-to-r from-cyan-50 to-cyan-100 text-cyan-700 border border-cyan-300 text-center py-2.5 sm:py-3 rounded-lg hover:from-cyan-100 hover:to-cyan-200 active:from-cyan-200 active:to-cyan-300 transition-all duration-200 font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 transform hover:scale-[1.02] active:scale-[0.98]"
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
                    ? 'bg-cyan-600 text-white border border-cyan-600 hover:bg-cyan-700'
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
              Showing <span className="text-cyan-600 text-2xl">
                {(() => {
                  const startIndex = (currentPage - 1) * listingsPerPage
                  const endIndex = Math.min(startIndex + listingsPerPage, filteredListings.length)
                  return startIndex + 1 === endIndex ? endIndex : `${startIndex + 1}-${endIndex}`
                })()}
              </span> of{' '}
              <span className="text-cyan-600 text-2xl">{filteredListings.length}</span> {searchQuery ? 'filtered' : ''} listings
              {searchQuery && data?.listings && (
                <span className="text-gray-500 text-base font-normal ml-2">
                  (out of {data?.listings?.length ?? 0} total)
                </span>
              )}
              {filteredListings.length > listingsPerPage && (
                <span className="text-gray-500 text-base font-normal ml-2">
                  (Page {currentPage} of {Math.ceil(filteredListings.length / listingsPerPage)})
                </span>
              )}
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Data scraped on {data?.scrape_date ? new Date(data.scrape_date).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <footer className="bg-white border-t border-gray-200 mt-16 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Apartments Listings Dashboard</h3>
            <p className="text-gray-600 text-sm">
              Professional apartment listings viewer for Chicago, IL
            </p>
            <p className="text-gray-500 text-xs mt-4">
              © {new Date().getFullYear()} Apartments Listings Dashboard
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function ApartmentsPage() {
  return (
    <AuthGuard>
      <ApartmentsPageContent />
    </AuthGuard>
  )
}

