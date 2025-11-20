'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface OwnerInfo {
  ownerName: string | null
  mailingAddress: string | null
  email: string | null
  phone: string | null
  allEmails?: string[]
  allPhones?: string[]
  propertyAddress: string
}

function OwnerInfoContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const address = searchParams.get('address')
  
  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Prevent scroll to top when page loads
    if (typeof window !== 'undefined') {
      // Keep scroll at top for owner-info page (it's a new page)
      window.scrollTo(0, 0)
    }
    
    if (!address) {
      setError('Address parameter is missing')
      setLoading(false)
      return
    }

    fetchOwnerInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const fetchOwnerInfo = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Get listing_link from URL if available
      const urlParams = new URLSearchParams(window.location.search)
      const listingLink = urlParams.get('listing_link') || ''
      
      let apiUrl = `/api/owner-info?address=${encodeURIComponent(address || '')}`
      if (listingLink) {
        apiUrl += `&listing_link=${encodeURIComponent(listingLink)}`
      }
      
      const response = await fetch(apiUrl)
      
      if (!response.ok) {
        const errorData = await response.json()
        
        // Use the error message from backend (it already contains all necessary details)
        let errorMessage = errorData.error || 'Failed to fetch owner information'
        
        // Only add extra context for 400 errors that aren't property not found
        if (response.status === 400 && !errorMessage.includes('Property not found')) {
          errorMessage = `${errorMessage}\n\nThis might be due to:\n- Address format issue\n- Invalid address parameters`
        }
        // For 404, the backend already provides comprehensive error message, so use it as is
        
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      console.log('Received Owner Info Data:', data)
      console.log('All Emails:', data.allEmails)
      console.log('All Phones:', data.allPhones)
      
      // Check if we have owner name or mailing address
      if (data.error && !data.ownerName && !data.mailingAddress) {
        // Only throw error if we have NO data at all
        throw new Error(data.error)
      }
      
      // Ensure allEmails and allPhones are arrays
      const ownerInfoData = {
        ...data,
        allEmails: Array.isArray(data.allEmails) ? data.allEmails : (data.email ? [data.email] : []),
        allPhones: Array.isArray(data.allPhones) ? data.allPhones : (data.phone ? [data.phone] : [])
      }
      
      console.log('Setting Owner Info:', ownerInfoData)
      
      // Set owner info
      setOwnerInfo(ownerInfoData)
      
      // If there's an error but we have some data, show a warning instead of error
      if (data.error && (data.ownerName || data.mailingAddress)) {
        console.warn('Partial data available despite error:', data.error)
      }
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching owner info:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center w-full overflow-x-hidden">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 bg-blue-600 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-white text-xl font-semibold">Loading owner information...</p>
          <p className="text-blue-200 text-sm mt-2">Please wait while we fetch the data</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4 w-full overflow-x-hidden">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-lg text-center border border-gray-100">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error Loading Owner Information</h2>
          <div className="text-gray-600 mb-6 text-left bg-gray-50 p-4 rounded-xl border border-gray-200">
            <p className="whitespace-pre-line">{error}</p>
            {address && (
              <div className="mt-3 pt-3 border-t border-gray-300">
                <p className="text-sm text-gray-500">
                  <strong>Property Address:</strong> {address}
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={fetchOwnerInfo}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
            >
              Retry
            </button>
            <button
              onClick={() => {
                // Store that we're going back to listings page
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('returningFromOwnerInfo', 'true')
                  // Use window.history.back() to maintain scroll position
                  window.history.back()
                }
              }}
              className="bg-gradient-to-r from-gray-600 to-gray-700 text-white px-8 py-3 rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all duration-200 shadow-lg hover:shadow-xl font-semibold"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 w-full overflow-x-hidden">
      {/* Header - Professional Design */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 shadow-2xl border-b-4 border-teal-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-4 shadow-xl">
                <span className="text-4xl">👤</span>
              </div>
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
                  Owner Information
                </h1>
                <p className="text-teal-200 text-lg font-medium">Property Owner Details</p>
              </div>
            </div>
            <button
              onClick={() => {
                // Store that we're going back to listings page
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('returningFromOwnerInfo', 'true')
                  // Use window.history.back() to maintain scroll position
                  window.history.back()
                }
              }}
              className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-xl hover:bg-white/30 transition-all duration-200 flex items-center gap-2 font-semibold shadow-lg hover:shadow-xl border border-white/30 hover:border-white/50"
            >
              <span className="text-lg">←</span>
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Owner Info Card */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 -mt-6">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
          {/* Property Address Section */}
          <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 text-white p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">📍</span>
                <div className="text-sm font-semibold uppercase tracking-wide opacity-90">Property Address</div>
              </div>
              <div className="text-3xl md:text-4xl font-extrabold leading-tight">
                {ownerInfo?.propertyAddress || 'Address Not Available'}
              </div>
            </div>
          </div>

          {/* Owner Information Section */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 max-w-4xl mx-auto">
              {/* Owner Name */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border-2 border-blue-300 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-4 shadow-md">
                    <span className="text-3xl">👤</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-blue-600 text-xs font-bold uppercase tracking-wide mb-2">Owner Name</div>
                    <div className="text-2xl font-extrabold text-gray-900 leading-tight">
                      {ownerInfo?.ownerName && ownerInfo.ownerName !== 'null' && ownerInfo.ownerName !== 'None'
                        ? ownerInfo.ownerName
                        : <span className="text-gray-400">Not Available</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mailing Address */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border-2 border-purple-300 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                <div className="flex items-start gap-4">
                  <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-xl p-4 shadow-md">
                    <span className="text-3xl">📮</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-purple-600 text-xs font-bold uppercase tracking-wide mb-2">Mailing Address</div>
                    <div className="text-lg font-bold text-gray-900 leading-tight">
                      {ownerInfo?.mailingAddress && ownerInfo.mailingAddress !== 'null' && ownerInfo.mailingAddress !== 'None'
                        ? ownerInfo.mailingAddress
                        : <span className="text-gray-400">Not Available</span>}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Email and Phone Section - Always show, even if empty */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 max-w-4xl mx-auto mt-6">
                {/* Email */}
                <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-2xl p-6 border-2 border-teal-300 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                  <div className="flex items-start gap-4">
                    <div className="bg-gradient-to-br from-teal-600 to-cyan-700 rounded-xl p-4 shadow-md">
                      <span className="text-3xl">📧</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-teal-600 text-xs font-bold uppercase tracking-wide mb-2">Email Address{ownerInfo?.allEmails && ownerInfo.allEmails.length > 1 ? 'es' : ''}</div>
                      {ownerInfo?.allEmails && ownerInfo.allEmails.length > 0 ? (
                        <div className="space-y-2">
                          {ownerInfo.allEmails.map((email, index) => (
                            <div key={index} className="text-lg font-bold text-gray-900 break-all">
                              <a href={`mailto:${email}`} className="text-teal-600 hover:text-teal-700 hover:underline">
                                {email}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : ownerInfo?.email ? (
                        <div className="text-lg font-bold text-gray-900 break-all">
                          <a href={`mailto:${ownerInfo.email}`} className="text-teal-600 hover:text-teal-700 hover:underline">
                            {ownerInfo.email}
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-400">Not Available</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Phone */}
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border-2 border-blue-200 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                  <div className="flex items-start gap-4">
                    <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-4 shadow-md">
                      <span className="text-3xl">📞</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-blue-600 text-xs font-bold uppercase tracking-wide mb-2">Phone Number{ownerInfo?.allPhones && ownerInfo.allPhones.length > 1 ? 's' : ''}</div>
                      {ownerInfo?.allPhones && ownerInfo.allPhones.length > 0 ? (
                        <div className="space-y-2">
                          {ownerInfo.allPhones.map((phone, index) => (
                            <div key={index} className="text-lg font-bold text-gray-900">
                              <a href={`tel:${phone}`} className="text-blue-600 hover:text-blue-700 hover:underline">
                                {phone}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : ownerInfo?.phone ? (
                        <div className="text-lg font-bold text-gray-900">
                          <a href={`tel:${ownerInfo.phone}`} className="text-blue-600 hover:text-blue-700 hover:underline">
                            {ownerInfo.phone}
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-400">Not Available</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            {/* Additional Info */}
            {(!ownerInfo?.ownerName || ownerInfo.ownerName === 'null' || ownerInfo.ownerName === 'None') &&
             (!ownerInfo?.mailingAddress || ownerInfo.mailingAddress === 'null' || ownerInfo.mailingAddress === 'None') && (
              <div className="mt-6 bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-2xl p-5 shadow-md max-w-4xl mx-auto">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">ℹ️</span>
                  <p className="text-sm text-yellow-800 font-medium">
                    <strong>Note:</strong> Owner information is not available for this property. 
                    This could be due to privacy restrictions or the property not being found in the database.
                  </p>
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <div className="mt-8 flex justify-center">
              <button
                onClick={fetchOwnerInfo}
                disabled={loading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-10 py-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center gap-3 disabled:opacity-50 font-bold shadow-xl hover:shadow-2xl transform hover:scale-105 text-lg"
              >
                <span className="text-xl animate-spin-slow">🔄</span>
                {loading ? 'Loading...' : 'Refresh Data'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OwnerInfoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center w-full overflow-x-hidden">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-blue-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 bg-blue-600 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-white text-xl font-semibold">Loading...</p>
          <p className="text-blue-200 text-sm mt-2">Please wait</p>
        </div>
      </div>
    }>
      <OwnerInfoContent />
    </Suspense>
  )
}

