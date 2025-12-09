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
      
      // Get listing_link and source from URL if available
      const urlParams = new URLSearchParams(window.location.search)
      const listingLink = urlParams.get('listing_link') || ''
      const source = urlParams.get('source') || ''
      
      let apiUrl = `/api/owner-info?address=${encodeURIComponent(address || '')}`
      if (listingLink) {
        apiUrl += `&listing_link=${encodeURIComponent(listingLink)}`
      }
      if (source) {
        apiUrl += `&source=${encodeURIComponent(source)}`
      }
      
      // Add cache busting and timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
      
      const response = await fetch(apiUrl, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        }
      })
      
      clearTimeout(timeoutId)
      
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
      if (err.name === 'AbortError') {
        setError('Request timed out. Please try again.')
      } else {
        setError(err.message || 'Failed to fetch owner information')
      }
      console.error('Error fetching owner info:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!ownerInfo) return

    // Escape CSV values properly for Excel compatibility
    const escapeCSV = (value: string | null | undefined, alwaysQuote: boolean = false): string => {
      // Handle null, undefined, or empty values
      if (value === null || value === undefined || value === '' || value === 'null' || value === 'None') {
        return ''
      }
      const str = String(value).trim()
      if (!str || str === '') return ''
      
      // If value contains comma, quote, newline, or if alwaysQuote is set, wrap in quotes
      if (alwaysQuote || str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Format phone numbers: prefix EACH number with tab to force Excel text mode
    // This prevents Excel from converting to scientific notation
    // Each number gets its own tab prefix so Excel treats each as text
    const formatPhonesForExcel = (phoneArray: string[] | null | undefined, singlePhone: string | null | undefined): string => {
      if (phoneArray && phoneArray.length > 0) {
        // Prefix each phone number individually with tab character
        // This ensures each number is treated as text, even when comma-separated
        return phoneArray.map(phone => '\t' + String(phone).trim()).join(',')
      }
      if (singlePhone) {
        const phone = String(singlePhone).trim()
        return '\t' + phone
      }
      return ''
    }

    // Format emails: prefix EACH email with tab to force Excel text mode
    const formatEmailsForExcel = (emailArray: string[] | null | undefined, singleEmail: string | null | undefined): string => {
      if (emailArray && emailArray.length > 0) {
        // Prefix each email individually with tab character
        return emailArray.map(email => '\t' + String(email).trim()).join(',')
      }
      if (singleEmail) {
        const email = String(singleEmail).trim()
        return '\t' + email
      }
      return ''
    }

    // Get formatted emails and phones with tab prefix on each individual item
    const emails = formatEmailsForExcel(ownerInfo.allEmails, ownerInfo.email)
    const phones = formatPhonesForExcel(ownerInfo.allPhones, ownerInfo.phone)

    // Prepare CSV data
    const headers = ['property_address', 'owner_name', 'mailing_address', 'email_addresses', 'phone_numbers']
    const rowData = [
      escapeCSV(ownerInfo.propertyAddress, true), // Always quote addresses (contain commas)
      escapeCSV(ownerInfo.ownerName),
      escapeCSV(ownerInfo.mailingAddress, true), // Always quote mailing addresses (contain commas)
      escapeCSV(emails, true), // Always quote emails (contain commas and tab prefixes)
      escapeCSV(phones, true) // Always quote phones (contain commas and tab prefixes)
    ]

    const csvData = [headers.join(','), rowData.join(',')].join('\n')

    // Create blob with UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })
    
    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    
    // Generate filename from property address
    const addressStr = ownerInfo.propertyAddress 
      ? String(ownerInfo.propertyAddress).replace(/[^a-z0-9]/gi, '_').toLowerCase() 
      : 'owner_info'
    const filename = `owner_info_${addressStr}_${Date.now()}.csv`
    link.setAttribute('download', filename)
    
    // Trigger download
    document.body.appendChild(link)
    link.click()
    
    // Cleanup
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center w-full overflow-x-hidden">
        <div className="text-center max-w-md px-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-blue-100 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-gray-900 text-lg sm:text-xl font-semibold mb-2">Loading owner information...</p>
          <p className="text-gray-600 text-sm mt-2">Fetching data from multiple sources</p>
          <div className="mt-4 flex justify-center gap-1">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 w-full overflow-x-hidden">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-lg text-center border border-gray-200">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Owner Information</h2>
          <div className="text-gray-600 mb-6 text-left bg-gray-50 p-4 rounded-lg border border-gray-200">
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
              className="bg-blue-50 text-blue-700 border border-blue-300 px-8 py-3 rounded-lg hover:bg-blue-100 transition-all duration-200 shadow-sm hover:shadow-md font-medium"
            >
              Retry
            </button>
            <button
              onClick={() => {
                // Store that we're going back to previous page
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('returningFromOwnerInfo', 'true')
                  // Use window.history.back() to maintain scroll position (like Redfin)
                  window.history.back()
                }
              }}
              className="bg-gray-50 text-gray-700 border border-gray-300 px-8 py-3 rounded-lg hover:bg-gray-100 transition-all duration-200 shadow-sm hover:shadow-md font-medium"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 w-full overflow-x-hidden">
      {/* Header - Light Professional Design */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
              <div className="bg-gray-100 rounded-lg p-2 sm:p-3 lg:p-4 shadow-sm border border-gray-200 flex-shrink-0">
                <span className="text-2xl sm:text-3xl lg:text-4xl">👤</span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-1 sm:mb-2 tracking-tight">
                  Owner Information
                </h1>
                <p className="text-gray-600 text-sm sm:text-base lg:text-lg">Property Owner Details</p>
              </div>
            </div>
            <button
              onClick={() => {
                // Store that we're going back to previous page
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('returningFromOwnerInfo', 'true')
                  // Use window.history.back() to maintain scroll position (like Redfin)
                  window.history.back()
                }
              }}
              className="bg-gray-50 text-gray-700 border border-gray-300 px-4 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg hover:bg-gray-100 transition-all duration-200 flex items-center gap-2 font-medium shadow-sm hover:shadow-md text-sm sm:text-base w-full md:w-auto justify-center md:justify-start"
            >
              <span className="text-base sm:text-lg">←</span>
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </button>
          </div>
        </div>
      </header>

      {/* Owner Info Card */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 -mt-6">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
          {/* Property Address Section */}
          <div className="bg-gray-100 border-b border-gray-200 p-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">📍</span>
              <div className="text-sm font-semibold uppercase tracking-wide text-gray-600">Property Address</div>
            </div>
            <div className="text-3xl md:text-4xl font-bold leading-tight text-gray-900">
              {ownerInfo?.propertyAddress || 'Address Not Available'}
            </div>
          </div>

          {/* Owner Information Section */}
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 max-w-4xl mx-auto">
              {/* Owner Name */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-start gap-4">
                  <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                    <span className="text-3xl">👤</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide mb-2">Owner Name</div>
                    <div className="text-2xl font-bold text-gray-900 leading-tight">
                      {ownerInfo?.ownerName && ownerInfo.ownerName !== 'null' && ownerInfo.ownerName !== 'None'
                        ? ownerInfo.ownerName
                        : <span className="text-gray-400">Not Available</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mailing Address */}
              <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="flex items-start gap-4">
                  <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                    <span className="text-3xl">📮</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide mb-2">Mailing Address</div>
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
                <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-start gap-4">
                    <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                      <span className="text-3xl">📧</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide mb-2">Email Address{ownerInfo?.allEmails && ownerInfo.allEmails.length > 1 ? 'es' : ''}</div>
                      {ownerInfo?.allEmails && ownerInfo.allEmails.length > 0 ? (
                        <div className="space-y-2">
                          {ownerInfo.allEmails.map((email, index) => (
                            <div key={index} className="text-lg font-bold text-gray-900 break-all">
                              <a href={`mailto:${email}`} className="text-blue-600 hover:text-blue-700 hover:underline">
                                {email}
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : ownerInfo?.email ? (
                        <div className="text-lg font-bold text-gray-900 break-all">
                          <a href={`mailto:${ownerInfo.email}`} className="text-blue-600 hover:text-blue-700 hover:underline">
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
                <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex items-start gap-4">
                    <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                      <span className="text-3xl">📞</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-gray-600 text-xs font-semibold uppercase tracking-wide mb-2">Phone Number{ownerInfo?.allPhones && ownerInfo.allPhones.length > 1 ? 's' : ''}</div>
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

            {/* Additional Info - Only show warning if ALL information is missing */}
            {(() => {
              const hasOwnerName = ownerInfo?.ownerName && ownerInfo.ownerName !== 'null' && ownerInfo.ownerName !== 'None'
              const hasMailingAddress = ownerInfo?.mailingAddress && ownerInfo.mailingAddress !== 'null' && ownerInfo.mailingAddress !== 'None'
              const hasEmail = ownerInfo?.email && ownerInfo.email !== 'null' && ownerInfo.email !== 'None'
              const hasPhone = ownerInfo?.phone && ownerInfo.phone !== 'null' && ownerInfo.phone !== 'None'
              const hasAllEmails = ownerInfo?.allEmails && ownerInfo.allEmails.length > 0
              const hasAllPhones = ownerInfo?.allPhones && ownerInfo.allPhones.length > 0
              
              // Only show warning if ALL information is missing
              const allMissing = !hasOwnerName && !hasMailingAddress && !hasEmail && !hasPhone && !hasAllEmails && !hasAllPhones
              
              return allMissing ? (
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-5 shadow-sm max-w-4xl mx-auto">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">ℹ️</span>
                    <p className="text-sm text-yellow-800 font-medium">
                      <strong>Note:</strong> Owner information is not available for this property. 
                      This could be due to privacy restrictions or the property not being found in the database.
                    </p>
                  </div>
                </div>
              ) : null
            })()}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={handleDownload}
                disabled={!ownerInfo || loading}
                className="bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-300 px-10 py-4 rounded-lg hover:from-blue-100 hover:to-blue-200 active:from-blue-200 active:to-blue-300 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 font-medium shadow-sm hover:shadow-md text-lg"
              >
                <svg 
                  className="w-5 h-5" 
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
                Download Details
              </button>
              <button
                onClick={fetchOwnerInfo}
                disabled={loading}
                className="bg-blue-50 text-blue-700 border border-blue-300 px-10 py-4 rounded-lg hover:bg-blue-100 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 font-medium shadow-sm hover:shadow-md text-lg"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center w-full overflow-x-hidden">
        <div className="text-center max-w-md px-4">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 sm:h-20 sm:w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gray-100 rounded-full animate-pulse"></div>
            </div>
          </div>
          <p className="text-gray-900 text-lg sm:text-xl font-semibold mb-2">Loading...</p>
          <p className="text-gray-600 text-sm mt-2">Please wait</p>
        </div>
      </div>
    }>
      <OwnerInfoContent />
    </Suspense>
  )
}


