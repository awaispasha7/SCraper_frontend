'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/app/components/AuthGuard'
import { createClient } from '@/lib/supabase-client'

interface TruliaListing {
  id: number
  address: string
  price: string | number
  beds: string | number
  baths: string | number
  square_feet: string | number
  listing_link: string
  property_type: string
  lot_size: string
  description: string
  owner_name?: string | null
  mailing_address?: string | null
  emails?: string | null
  phones?: string | null
  is_active_for_sale: boolean
  is_off_market: boolean
  is_recently_sold: boolean
  is_foreclosure: boolean
  title: string
}

interface TruliaListingsData {
  total_listings: number
  scrape_date: string
  listings: TruliaListing[]
}

function TruliaListingsPageContent() {
  const router = useRouter()
  const [data, setData] = useState<TruliaListingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    fetchListings()
  }, [])

  const fetchListings = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/trulia-listings?' + new Date().getTime(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch listings')
      }

      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message || 'Failed to load listings')
      console.error('Error fetching Trulia listings:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: string | number | null | undefined): string => {
    if (!price || price === 'null' || price === 'None' || price === '') return 'Price on Request'
    
    let cleanPrice = String(price).trim()
    
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
    if (!value || value === 'null' || value === 'None' || value === '') return 'N/A'
    
    const str = String(value).trim()
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-900 text-xl font-semibold">Loading Trulia listings...</p>
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
            No Trulia listings were found in the data file.
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2 tracking-tight">
                Trulia Listings
              </h1>
              <p className="text-gray-600 text-lg">
                Chicago, Illinois Property Listings
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-blue-50 rounded-lg px-6 py-3 border border-blue-200">
                <div className="text-3xl font-bold text-blue-700">{data.total_listings}</div>
                <div className="text-sm text-blue-600 font-medium">Total Listings</div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={fetchListings}
                  className="bg-blue-50 text-blue-700 border border-blue-300 px-6 py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 flex items-center gap-2 font-medium shadow-sm hover:shadow-md"
                >
                  <span className="text-lg">🔄</span>
                  Refresh
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-red-50 text-red-700 border border-red-300 px-6 py-3 rounded-lg hover:bg-red-100 transition-all duration-200 flex items-center gap-2 font-medium shadow-sm hover:shadow-md"
                >
                  <span className="text-lg">🚪</span>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="text-3xl font-bold text-gray-900 mb-2">{data.total_listings}</div>
            <div className="text-gray-600 text-sm font-semibold uppercase tracking-wide">
              Total Listings
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {data.listings.filter(l => l.is_active_for_sale).length}
            </div>
            <div className="text-gray-600 text-sm font-semibold uppercase tracking-wide">
              Active for Sale
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div className="text-3xl font-bold text-gray-900 mb-2">
              {data.scrape_date || 'N/A'}
            </div>
            <div className="text-gray-600 text-sm font-semibold uppercase tracking-wide">
              Scrape Date
            </div>
          </div>
        </div>

        {/* Listings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.listings.map((listing) => (
            <div
              key={listing.id}
              className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 hover:border-blue-300 transform hover:-translate-y-1"
            >
              {/* Status Badge */}
              {listing.is_recently_sold && (
                <div className="bg-red-600 text-white text-xs font-semibold px-4 py-2 text-center">
                  SOLD
                </div>
              )}
              {listing.is_off_market && !listing.is_recently_sold && (
                <div className="bg-gray-600 text-white text-xs font-semibold px-4 py-2 text-center">
                  OFF MARKET
                </div>
              )}
              {listing.is_foreclosure && (
                <div className="bg-orange-600 text-white text-xs font-semibold px-4 py-2 text-center">
                  FORECLOSURE
                </div>
              )}

              <div className="p-6">
                {/* Address */}
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-2 leading-tight mb-1">
                    {listing.address || 'Address Not Available'}
                  </h3>
                  <p className="text-gray-500 text-sm font-medium">Chicago, IL</p>
                </div>

                {/* Property Type */}
                {listing.property_type && (
                  <div className="mb-4">
                    <span className="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-3 py-1 rounded-full">
                      {listing.property_type}
                    </span>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex flex-col gap-3 mt-6">
                  {listing.listing_link && (
                    <a
                      href={listing.listing_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-blue-50 text-blue-700 border border-blue-300 text-center py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-sm"
                    >
                      View on Trulia →
                    </a>
                  )}
                  {listing.address && listing.address !== 'Address Not Available' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        
                        // Store current scroll position before navigation
                        if (typeof window !== 'undefined') {
                          const scrollY = window.scrollY
                          sessionStorage.setItem('listingScrollPosition', scrollY.toString())
                          sessionStorage.setItem('listingAddress', listing.address || '')
                          sessionStorage.setItem('preventScrollRestore', 'true')
                          sessionStorage.setItem('sourcePage', 'trulia-listings')
                          
                          // Navigate to owner-info page
                          const params = new URLSearchParams({
                            address: listing.address || '',
                            source: 'trulia'
                          })
                          if (listing.listing_link) {
                            params.append('listing_link', listing.listing_link)
                          }
                          
                          window.location.href = `/owner-info?${params.toString()}`
                        }
                      }}
                      className="w-full bg-blue-50 text-blue-700 border border-blue-300 text-center py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 font-semibold shadow-sm hover:shadow-md text-sm"
                    >
                      Owner Information
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Info */}
        <div className="mt-8 mb-6 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 max-w-2xl mx-auto">
            <p className="text-lg font-bold text-gray-800">
              Showing <span className="text-blue-600 text-2xl">{data.total_listings}</span> listings
            </p>
            <p className="text-sm text-gray-600 mt-2">
              Data scraped on {data.scrape_date || '2025-11-20'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Trulia Listings Dashboard</h3>
            <p className="text-gray-600 text-sm">
              Professional property listings viewer for Chicago, Illinois
            </p>
            <p className="text-gray-500 text-xs mt-4">
              © {new Date().getFullYear()} Trulia Listings Dashboard
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function TruliaListingsPage() {
  return (
    <AuthGuard>
      <TruliaListingsPageContent />
    </AuthGuard>
  )
}

