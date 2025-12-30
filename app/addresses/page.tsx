'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase-client'

interface Address {
  address: string
  city: string
  state: string
  zip: string
  ownerName?: string | null
  mailingAddress?: string | null
  emails?: string | null
  phones?: string | null
  loadingOwner?: boolean
}

export default function AddressesPage() {
  // Initialize data from sessionStorage if available (for navigation persistence)
  const [addresses, setAddresses] = useState<Address[]>(() => {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('addressesData')
      if (cached) {
        try {
          return JSON.parse(cached)
        } catch (e) {
          return []
        }
      }
    }
    return []
  })
  const [loading, setLoading] = useState(() => {
    // Don't show loading if we have cached data
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('addressesData')
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          if (parsed && parsed.length > 0) {
            return false // Don't show loading if we have cached data
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
    return true
  })
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

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

  const handleDownload = (addr: Address) => {
    // Escape CSV values properly for Excel compatibility
    const escapeCSV = (value: string | null | undefined): string => {
      // Handle null, undefined, or empty values
      if (!value || value === 'null' || value === 'No email addresses found') {
        return ''
      }
      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    // Prepare CSV data
    const csvData = [
      // Header row
      ['address', 'city', 'state', 'zip', 'owner_name', 'mailing_address', 'emails', 'phones'].join(','),
      // Data row
      [
        escapeCSV(addr.address),
        escapeCSV(addr.city),
        escapeCSV(addr.state),
        escapeCSV(addr.zip),
        escapeCSV(addr.ownerName),
        escapeCSV(addr.mailingAddress),
        escapeCSV(addr.emails),
        escapeCSV(addr.phones)
      ].join(',')
    ].join('\n')

    // Create blob with UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })

    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url

    // Generate filename from address
    const filename = `${addr.address.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${addr.city}_${addr.state}_${addr.zip}.csv`
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
    if (returningFromOwnerInfo && addresses && addresses.length > 0) {
      // Use cached data, don't fetch
      setLoading(false)
      return
    }

    // Otherwise, fetch addresses
    fetchAddresses()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore scroll position after data loads (matching Redfin logic)
  useEffect(() => {
    if (!addresses || addresses.length === 0) return

    // Restore scroll position when returning from owner-info page
    if (typeof window !== 'undefined') {
      const savedScrollPosition = sessionStorage.getItem('addressesScrollPosition')
      const returningFromOwnerInfo = sessionStorage.getItem('returningFromOwnerInfo')
      const preventScrollRestore = sessionStorage.getItem('preventScrollRestore')
      const sourcePage = sessionStorage.getItem('sourcePage')

      // Only restore if we're returning from owner-info and on the correct page
      if (savedScrollPosition && (returningFromOwnerInfo || preventScrollRestore) && sourcePage === 'addresses') {
        const scrollPos = parseInt(savedScrollPosition, 10)

        // Wait for DOM to be ready and content to render
        const restoreScroll = () => {
          window.scrollTo({ top: scrollPos, behavior: 'auto' })
        }

        // Try multiple times to ensure it works (matching Redfin approach)
        setTimeout(restoreScroll, 50)
        setTimeout(restoreScroll, 100)
        setTimeout(restoreScroll, 200)
        setTimeout(restoreScroll, 500)

        // Clear the flags after restoring
        setTimeout(() => {
          sessionStorage.removeItem('returningFromOwnerInfo')
          sessionStorage.removeItem('preventScrollRestore')
          sessionStorage.removeItem('addressesScrollPosition')
          sessionStorage.removeItem('sourcePage')
        }, 600)
      }
    }
  }, [addresses])

  const fetchAddresses = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/addresses?' + new Date().getTime(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch addresses')
      }

      const result = await response.json()

      if (result.error) {
        throw new Error(result.error)
      }

      const formattedAddresses: Address[] = (result.addresses || []).map((addr: any) => ({
        address: addr.address || '',
        city: addr.city || '',
        state: addr.state || '',
        zip: addr.zip || '',
        ownerName: addr.ownerName || null,
        mailingAddress: addr.mailingAddress || null,
        emails: addr.emails || null,
        phones: addr.phones || null,
        loadingOwner: false
      }))

      setAddresses(formattedAddresses)

      // Cache addresses data in sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('addressesData', JSON.stringify(formattedAddresses))
      }
    } catch (err: any) {
      console.error('Error fetching addresses:', err)
      setError(err.message || 'Failed to load addresses. Please try again.')
    } finally {
      setLoading(false)
    }
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

  // Filter addresses based on search query (including owner information)
  const filteredAddresses = useMemo(() => {
    if (!addresses) return []
    if (!searchQuery.trim()) return addresses

    const query = searchQuery.toLowerCase().trim()
    const normalizedQuery = normalizePrice(query)

    return addresses.filter(addr => {
      return (
        // Address match
        addr.address.toLowerCase().includes(query) ||
        addr.city.toLowerCase().includes(query) ||
        addr.state.toLowerCase().includes(query) ||
        addr.zip.toLowerCase().includes(query) ||
        // Owner Details
        (addr.ownerName && addr.ownerName.toLowerCase().includes(query)) ||
        (addr.mailingAddress && addr.mailingAddress.toLowerCase().includes(query)) ||
        (addr.emails && toSearchableString(addr.emails).includes(query)) ||
        (addr.phones && toSearchableString(addr.phones).includes(query))
      )
    })
  }, [addresses, searchQuery])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 w-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Loading addresses...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <button
            onClick={fetchAddresses}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
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
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-1 sm:mb-2 tracking-tight">
                Addresses
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 w-full md:w-auto">
              <div className="bg-blue-50 rounded-lg px-4 sm:px-5 lg:px-6 py-2.5 sm:py-3 border border-blue-200 flex-shrink-0">
                <div className="text-2xl sm:text-3xl font-bold text-blue-700">{addresses.length}</div>
                <div className="text-xs sm:text-sm text-blue-600 font-medium">Total Addresses</div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-1 md:flex-initial">
                <button
                  onClick={fetchAddresses}
                  className="bg-blue-50 text-blue-700 border border-blue-300 px-4 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 flex items-center gap-2 font-medium shadow-sm hover:shadow-md text-sm sm:text-base flex-1 sm:flex-initial"
                >
                  <span className="text-base sm:text-lg">🔄</span>
                  <span className="hidden sm:inline">Refresh</span>
                  <span className="sm:hidden">Refresh</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-gray-50 text-gray-700 border border-gray-300 px-4 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg hover:bg-gray-100 transition-all duration-200 flex items-center gap-2 font-medium shadow-sm hover:shadow-md text-sm sm:text-base flex-1 sm:flex-initial"
                >
                  <span className="hidden sm:inline">Logout</span>
                  <span className="sm:hidden">Logout</span>
                </button>
              </div>
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
                Search Addresses
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
                  placeholder="Search addresses..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-lg border-2 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-gray-800 placeholder-gray-400 bg-white focus:bg-white font-medium text-sm sm:text-base"
                />
              </div>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-6 py-3.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all duration-200 whitespace-nowrap text-sm mt-6 md:mt-0 shadow-sm hover:shadow-md"
              >
                Clear Search
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-4 text-sm text-gray-600">
              <span className="font-bold text-blue-600">{filteredAddresses.length}</span> address{filteredAddresses.length !== 1 ? 'es' : ''} found
              {filteredAddresses.length !== addresses.length && (
                <span className="text-gray-500 ml-2">
                  (out of {addresses.length} total)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Addresses Cards Grid */}
        {filteredAddresses.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 text-sm sm:text-base">
              {searchQuery ? 'No addresses found matching your search.' : 'No addresses available.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
            {filteredAddresses.map((addr, index) => (
              <div
                key={`${addr.address}-${addr.city}-${index}`}
                className="bg-white rounded-xl sm:rounded-2xl shadow-md sm:shadow-lg hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 hover:border-blue-300 transform hover:-translate-y-0.5 sm:hover:-translate-y-1"
              >
                <div className="p-4 sm:p-5 lg:p-6">
                  {/* Address */}
                  <div className="mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 line-clamp-2 leading-tight mb-1">
                      {addr.address}
                    </h3>
                    <p className="text-gray-500 text-xs sm:text-sm font-medium">
                      {addr.city}, {addr.state}
                    </p>
                  </div>

                  {/* Location Badge */}
                  <div className="mb-3 sm:mb-4">
                    <span className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-2 sm:px-3 py-1 rounded-full">
                      {addr.state}
                    </span>
                  </div>

                  {/* Address Details Grid */}
                  <div className="mb-3 sm:mb-4 grid grid-cols-2 gap-2 sm:gap-3">
                    {/* City */}
                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">City</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900 break-words">
                        {addr.city}
                      </div>
                    </div>

                    {/* State */}
                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">State</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {addr.state}
                      </div>
                    </div>

                    {/* ZIP */}
                    <div className="bg-gray-50 rounded-lg p-2 sm:p-3 border border-gray-200 col-span-2">
                      <div className="text-xs sm:text-sm text-gray-600 font-medium mb-1">ZIP Code</div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {addr.zip}
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col gap-2 sm:gap-3 mt-4 sm:mt-5 lg:mt-6">
                    <button
                      onClick={(e) => {
                        e.preventDefault()

                        // Store current scroll position before navigation
                        if (typeof window !== 'undefined') {
                          const scrollY = window.scrollY
                          sessionStorage.setItem('addressesScrollPosition', scrollY.toString())
                          sessionStorage.setItem('preventScrollRestore', 'true')
                          sessionStorage.setItem('sourcePage', 'addresses')

                          // Navigate to owner-info page (using window.location to prevent Next.js auto-scroll)
                          const fullAddress = `${addr.address}, ${addr.city}, ${addr.state} ${addr.zip}`
                          const params = new URLSearchParams({
                            address: fullAddress,
                            source: 'addresses'
                          })
                          window.location.href = `/owner-info?${params.toString()}`
                        }
                      }}
                      className="w-full bg-gray-50 text-gray-700 border border-gray-300 text-center py-2.5 sm:py-3 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-0"
                    >
                      <span className="hidden sm:inline">Owner Information</span>
                      <span className="sm:hidden">Owner Info</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleDownload(addr)
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
            ))}
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-8 mb-6 text-center">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100 max-w-2xl mx-auto">
            <p className="text-lg font-bold text-gray-800">
              Showing <span className="text-blue-600 text-2xl">{filteredAddresses.length}</span> of <span className="text-blue-600 text-2xl">{addresses.length}</span> addresses
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Addresses Dashboard</h3>
            <p className="text-gray-600 text-sm">
              Property addresses with owner information from Supabase
            </p>
            <p className="text-gray-500 text-xs mt-4">
              © {new Date().getFullYear()} Addresses Dashboard
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
