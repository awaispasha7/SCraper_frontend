'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthGuard from '@/app/components/AuthGuard'
import { createClient } from '@/lib/supabase-client'

interface UnifiedListing {
  id: string | number
  address: string
  price: string | number
  beds: string | number
  baths: string | number
  square_feet: string | number
  listing_link?: string
  property_type?: string
  owner_name?: string | null
  mailing_address?: string | null
  emails?: string | null | string[]
  phones?: string | null | string[]
  source: 'fsbo' | 'trulia' | 'redfin' | 'apartments' | 'zillow-fsbo' | 'zillow-frbo' | 'hotpads'
  scrape_date?: string
  time_of_post?: string | null
  county?: string
  lot_size?: string
  lot_acres?: string | number
  description?: string
  city?: string
  state?: string
  zip?: string
  neighborhood?: string | null
}

function AllListingsPageContent() {
  const router = useRouter()
  const [allListings, setAllListings] = useState<UnifiedListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState<{ [key: string]: number }>({
    fsbo: 1,
    trulia: 1,
    redfin: 1,
    apartments: 1,
    'zillow-fsbo': 1,
    'zillow-frbo': 1,
    hotpads: 1
  })
  const listingsPerPage = 10 // Show 10 listings per page per source

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

  useEffect(() => {
    fetchAllListings()
  }, [])

  const fetchAllListings = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch from all 7 sources in parallel
      const [fsboRes, truliaRes, redfinRes, apartmentsRes, zillowFsboRes, zillowFrboRes, hotpadsRes] = await Promise.all([
        fetch('/api/listings?' + new Date().getTime(), { cache: 'no-store' }),
        fetch('/api/trulia-listings?' + new Date().getTime(), { cache: 'no-store' }),
        fetch('/api/redfin-listings?' + new Date().getTime(), { cache: 'no-store' }),
        fetch('/api/apartments-listings?' + new Date().getTime(), { cache: 'no-store' }),
        fetch('/api/zillow-fsbo-listings?' + new Date().getTime(), { cache: 'no-store' }),
        fetch('/api/zillow-frbo-listings?' + new Date().getTime(), { cache: 'no-store' }),
        fetch('/api/hotpads-listings?' + new Date().getTime(), { cache: 'no-store' })
      ])

      const [fsboData, truliaData, redfinData, apartmentsData, zillowFsboData, zillowFrboData, hotpadsData] = await Promise.all([
        fsboRes.json(),
        truliaRes.json(),
        redfinRes.json(),
        apartmentsRes.json(),
        zillowFsboRes.json(),
        zillowFrboRes.json(),
        hotpadsRes.json()
      ])

      // Transform and combine all listings
      const unifiedListings: UnifiedListing[] = []

      // 1. FSBO Listings (first)
      if (fsboData.listings && Array.isArray(fsboData.listings)) {
        fsboData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `fsbo-${listing.id || Date.now()}`,
            address: listing.address || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            owner_name: listing.owner_name || null,
            mailing_address: listing.mailing_address || null,
            emails: listing.owner_emails || null,
            phones: listing.owner_phones || null,
            source: 'fsbo',
            time_of_post: listing.time_of_post || null
          })
        })
      }

      // 2. Trulia Listings (second)
      if (truliaData.listings && Array.isArray(truliaData.listings)) {
        truliaData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `trulia-${listing.id || Date.now()}`,
            address: listing.address || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            property_type: listing.property_type || '',
            owner_name: listing.owner_name || null,
            mailing_address: listing.mailing_address || null,
            emails: listing.emails || null,
            phones: listing.phones || null,
            source: 'trulia',
            lot_size: listing.lot_size || '',
            description: listing.description || ''
          })
        })
      }

      // 3. Redfin Listings (third)
      if (redfinData.listings && Array.isArray(redfinData.listings)) {
        redfinData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `redfin-${listing.id || Date.now()}`,
            address: listing.address || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            property_type: listing.property_type || '',
            county: listing.county || '',
            lot_acres: listing.lot_acres || '',
            owner_name: listing.owner_name || null,
            mailing_address: listing.mailing_address || null,
            emails: listing.emails || null,
            phones: listing.phones || null,
            source: 'redfin',
            scrape_date: listing.scrape_date || ''
          })
        })
      }

      // 4. Apartments (fourth)
      if (apartmentsData.listings && Array.isArray(apartmentsData.listings)) {
        apartmentsData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `apartments-${listing.id || Date.now()}`,
            address: listing.address || listing.full_address || listing.title || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            property_type: listing.property_type || 'Apartment',
            city: listing.city || '',
            state: listing.state || '',
            zip: listing.zip_code || listing.zip || '',
            owner_name: listing.owner_name || null,
            mailing_address: null,
            emails: listing.emails || null,
            phones: listing.phones || null,
            description: listing.description || null,
            neighborhood: listing.neighborhood || null,
            source: 'apartments'
          })
        })
      }

      // 5. Zillow FSBO (fifth)
      if (zillowFsboData.listings && Array.isArray(zillowFsboData.listings)) {
        zillowFsboData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `zillow-fsbo-${listing.id || Date.now()}`,
            address: listing.address || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            property_type: listing.property_type || '',
            owner_name: listing.owner_name || null,
            mailing_address: listing.mailing_address || null,
            emails: listing.emails || null,
            phones: listing.phones || null,
            source: 'zillow-fsbo'
          })
        })
      }

      // 6. Zillow FRBO (sixth)
      if (zillowFrboData.listings && Array.isArray(zillowFrboData.listings)) {
        zillowFrboData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `zillow-frbo-${listing.id || Date.now()}`,
            address: listing.address || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            property_type: listing.property_type || '',
            owner_name: listing.owner_name || null,
            mailing_address: listing.mailing_address || null,
            emails: listing.emails || null,
            phones: listing.phones || null,
            source: 'zillow-frbo'
          })
        })
      }

      // 7. Hotpads (seventh)
      if (hotpadsData.listings && Array.isArray(hotpadsData.listings)) {
        hotpadsData.listings.forEach((listing: any) => {
          unifiedListings.push({
            id: `hotpads-${listing.id || Date.now()}`,
            address: listing.address || '',
            price: listing.price || '',
            beds: listing.beds || '',
            baths: listing.baths || '',
            square_feet: listing.square_feet || '',
            listing_link: listing.listing_link || '',
            property_type: listing.property_type || '',
            owner_name: listing.owner_name || null,
            mailing_address: listing.mailing_address || null,
            emails: listing.emails || null,
            phones: listing.phones || null,
            source: 'hotpads'
          })
        })
      }

      setAllListings(unifiedListings)
    } catch (err: any) {
      console.error('Error fetching all listings:', err)
      setError(err.message || 'Failed to load listings. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: string | number | null | undefined): string => {
    if (price === null || price === undefined || price === '' || price === 'null' || price === 'None') return 'Price on Request'
    if (typeof price === 'number' && price === 0) return 'Price on Request'
    let cleanPrice = String(price).trim()
    if (!cleanPrice || cleanPrice === '') return 'Price on Request'
    if (/^\$[\d,]+$/.test(cleanPrice)) return cleanPrice
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
    if (/^\d+(\.\d+)?$/.test(str)) return str
    if (/^[\d,]+$/.test(str)) return str
    const numMatch = str.match(/[\d.]+/)
    if (numMatch) return numMatch[0]
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

  const getSourceBadgeColor = (source: string) => {
    switch (source) {
      case 'fsbo':
        return 'bg-blue-100 text-blue-700'
      case 'trulia':
        return 'bg-green-100 text-green-700'
      case 'redfin':
        return 'bg-red-100 text-red-700'
      case 'apartments':
        return 'bg-purple-100 text-purple-700'
      case 'zillow-fsbo':
        return 'bg-purple-100 text-purple-700'
      case 'zillow-frbo':
        return 'bg-indigo-100 text-indigo-700'
      case 'hotpads':
        return 'bg-teal-100 text-teal-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'fsbo':
        return 'For Sale By Owner'
      case 'trulia':
        return 'Trulia'
      case 'redfin':
        return 'Redfin'
      case 'apartments':
        return 'Apartments'
      case 'zillow-fsbo':
        return 'Zillow FSBO'
      case 'zillow-frbo':
        return 'Zillow FRBO'
      case 'hotpads':
        return 'Hotpads'
      default:
        return source
    }
  }

  // Helper to normalize array data (handles arrays, JSON strings, or single values)
  const normalizeArrayData = (value: any): string[] => {
    if (!value || value === 'null' || value === 'None' || value === '') return []
    
    if (Array.isArray(value)) {
      // Flatten nested arrays and handle numbers properly (prevent scientific notation)
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
              if (Number.isInteger(item) && item > 0) {
                // Convert large integers to string without scientific notation
                if (item > Number.MAX_SAFE_INTEGER) {
                  str = BigInt(item).toString()
                } else {
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
    
    if (typeof value === 'string') {
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
          return normalizeArrayData(parsed) // Recursively handle nested arrays
        }
        // If parsed to a single value, return as array
        return [String(parsed).trim()].filter(v => v)
      } catch (e) {
        // Not JSON, check if it's comma-separated
        if (value.includes(',')) {
          return value.split(',').map(v => v.trim()).filter(v => v)
        }
        // Single string value
        return [value.trim()].filter(v => v)
      }
    }
    
    // Handle numbers or other types - convert to string array
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value > 0) {
        if (value > Number.MAX_SAFE_INTEGER) {
          return [BigInt(value).toString()]
        } else {
          return [value.toString()]
        }
      }
      return [String(value)]
    }
    
    return []
  }

  const escapeCSV = (value: string | string[] | number | null | undefined, isArrayField: boolean = false): string => {
    if (value === null || value === undefined || value === '' || value === 'null' || value === 'No email addresses found' || value === 'no email found' || value === 'no data') {
      return ''
    }
    
    // For array fields (emails/phones), normalize first
    if (isArrayField) {
      const normalized = normalizeArrayData(value)
      if (normalized.length === 0) return ''
      // Join with comma separator (,) - user requested comma separation
      // CRITICAL: Must quote the entire result so Excel treats commas as part of the value, not column separators
      let joined = normalized.join(',')
      // Add a leading tab character to force Excel to treat the cell as text
      // This prevents Excel from trying to calculate or parse numbers (especially phone numbers)
      // The tab character is invisible but forces text mode in Excel
      joined = '\t' + joined
      // Always quote array values to ensure they stay in one column
      // This ensures "email1,email2,email3" stays in ONE column
      return `"${joined.replace(/"/g, '""')}"`
      
    }
    
    // Handle arrays for non-array fields (shouldn't happen, but be safe)
    if (Array.isArray(value)) {
      const filtered = value.filter(v => v && String(v).trim() !== '')
      if (filtered.length === 0) return ''
      // Join with comma and ALWAYS quote
      const joined = filtered.join(',')
      return `"${joined.replace(/"/g, '""')}"`
    }
    
    const str = String(value).trim()
    if (!str || str === '') return ''
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const handleDownload = (listing: UnifiedListing) => {
    // Prepare CSV data for single listing - different fields based on source
    let headers: string[]
    let rowData: string[]
    
    if (listing.source === 'apartments') {
      // For apartments, include all apartment fields
      headers = ['address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'owner_name', 'emails', 'phones', 'city', 'state', 'zip', 'neighborhood', 'description']
      rowData = [
        escapeCSV(listing.address),
        escapeCSV(listing.price),
        escapeCSV(listing.beds),
        escapeCSV(listing.baths),
        escapeCSV(listing.square_feet),
        escapeCSV(listing.listing_link),
        escapeCSV(listing.property_type),
        escapeCSV(listing.owner_name),
        escapeCSV(listing.emails, true),
        escapeCSV(listing.phones, true),
        escapeCSV(listing.city),
        escapeCSV(listing.state),
        escapeCSV(listing.zip),
        escapeCSV(listing.neighborhood),
        escapeCSV(listing.description)
      ]
    } else {
      // For other sources, include all fields
      headers = ['source', 'address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'owner_name', 'mailing_address', 'emails', 'phones', 'city', 'state', 'zip']
      rowData = [
        escapeCSV(listing.source),
        escapeCSV(listing.address),
        escapeCSV(listing.price),
        escapeCSV(listing.beds),
        escapeCSV(listing.baths),
        escapeCSV(listing.square_feet),
        escapeCSV(listing.listing_link),
        escapeCSV(listing.property_type),
        escapeCSV(listing.owner_name),
        escapeCSV(listing.mailing_address),
        escapeCSV(listing.emails, true), // Mark as array field
        escapeCSV(listing.phones, true), // Mark as array field
        escapeCSV(listing.city),
        escapeCSV(listing.state),
        escapeCSV(listing.zip)
      ]
    }

    const csvData = [headers.join(','), rowData.join(',')].join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const addressStr = listing.address ? String(listing.address).replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'listing'
    const filename = `${listing.source}_${addressStr}_${Date.now()}.csv`
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadAll = () => {
    // Prepare CSV data for all listings - use all fields for mixed sources
    const headers = ['source', 'address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'owner_name', 'mailing_address', 'emails', 'phones', 'city', 'state', 'zip']
    const rows = filteredListings.map(listing => [
      escapeCSV(listing.source),
      escapeCSV(listing.address),
      escapeCSV(listing.price),
      escapeCSV(listing.beds),
      escapeCSV(listing.baths),
      escapeCSV(listing.square_feet),
      escapeCSV(listing.listing_link),
      escapeCSV(listing.property_type),
      escapeCSV(listing.owner_name),
      escapeCSV(listing.mailing_address),
      escapeCSV(listing.emails, true), // Mark as array field
      escapeCSV(listing.phones, true), // Mark as array field
      escapeCSV(listing.city),
      escapeCSV(listing.state),
      escapeCSV(listing.zip)
    ])

    const csvData = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const filename = `all_listings_${Date.now()}.csv`
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadBySource = (source: string) => {
    const sourceListings = filteredListings.filter(listing => listing.source === source)
    
    // Prepare CSV data for source listings - different fields based on source
    let headers: string[]
    let rows: string[][]
    
    if (source === 'apartments') {
      // For apartments, include all apartment fields
      headers = ['address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'owner_name', 'emails', 'phones', 'city', 'state', 'zip', 'neighborhood', 'description']
      rows = sourceListings.map(listing => [
        escapeCSV(listing.address),
        escapeCSV(listing.price),
        escapeCSV(listing.beds),
        escapeCSV(listing.baths),
        escapeCSV(listing.square_feet),
        escapeCSV(listing.listing_link),
        escapeCSV(listing.property_type),
        escapeCSV(listing.owner_name),
        escapeCSV(listing.emails, true), // Mark as array field
        escapeCSV(listing.phones, true), // Mark as array field
        escapeCSV(listing.city),
        escapeCSV(listing.state),
        escapeCSV(listing.zip),
        escapeCSV(listing.neighborhood),
        escapeCSV(listing.description)
      ])
    } else {
      // For other sources, include all fields
      headers = ['source', 'address', 'price', 'beds', 'baths', 'square_feet', 'listing_link', 'property_type', 'owner_name', 'mailing_address', 'emails', 'phones', 'city', 'state', 'zip']
      rows = sourceListings.map(listing => [
        escapeCSV(listing.source),
        escapeCSV(listing.address),
        escapeCSV(listing.price),
        escapeCSV(listing.beds),
        escapeCSV(listing.baths),
        escapeCSV(listing.square_feet),
        escapeCSV(listing.listing_link),
        escapeCSV(listing.property_type),
        escapeCSV(listing.owner_name),
        escapeCSV(listing.mailing_address),
        escapeCSV(listing.emails, true), // Mark as array field
        escapeCSV(listing.phones, true), // Mark as array field
        escapeCSV(listing.city),
        escapeCSV(listing.state),
        escapeCSV(listing.zip)
      ])
    }

    const csvData = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvData], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const filename = `${source}_all_listings_${Date.now()}.csv`
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  // Filter listings based on search query - search across all fields
  const filteredListings = allListings.filter(listing => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    
    // Helper function to safely convert value to searchable string
    const toSearchableString = (value: any): string => {
      if (value === null || value === undefined || value === '') return ''
      if (Array.isArray(value)) {
        return value.map(v => String(v || '')).filter(v => v).join(' ').toLowerCase()
      }
      const str = String(value).trim()
      if (str === '' || str === 'null' || str === 'undefined' || str === 'No email addresses found' || str === 'no email found' || str === 'no data' || str === 'no phone available') return ''
      // For comma-separated strings (like emails/phones), replace commas with spaces for better searching
      return str.replace(/,/g, ' ').toLowerCase()
    }
    
    // Helper function to normalize price/number values for comparison
    // Removes $, commas, spaces, and extracts only digits
    const normalizePrice = (value: any): string => {
      if (value === null || value === undefined || value === '') return ''
      // Convert to string and extract only digits
      const str = String(value)
      // Remove all non-digit characters
      return str.replace(/\D/g, '')
    }
    
    // Normalize the search query for price/number matching
    const normalizedQuery = normalizePrice(query)
    
    // Detect if user is searching specifically for beds or baths
    const isBedsSearch = query.includes('bed') && !query.includes('bath')
    const isBathsSearch = query.includes('bath') && !query.includes('bed')
    
    // Extract number from query (e.g., "6 beds" -> "6", "6" -> "6")
    const extractNumber = (searchQuery: string): string => {
      const match = searchQuery.match(/\d+/)
      return match ? match[0] : ''
    }
    const searchNumber = extractNumber(query)
    const normalizedSearchNumber = normalizePrice(searchNumber)
    
    // Helper function to match exact number (for beds/baths)
    const matchesExactNumber = (value: any, searchNumber: string): boolean => {
      if (value === null || value === undefined || value === '' || !searchNumber) return false
      const valueStr = String(value).trim()
      const normalizedValue = normalizePrice(value)
      // Exact match only - "6" should match "6" but not "16" or "60"
      return normalizedValue === searchNumber || valueStr === searchNumber
    }
    
    // Helper function to check if a price/number field matches the query
    const matchesPrice = (value: any): boolean => {
      if (value === null || value === undefined || value === '') return false
      
      // Convert to string for comparison
      const valueStr = String(value).toLowerCase().trim()
      const normalizedValue = normalizePrice(value)
      
      // If normalized query is empty, check original string match
      if (!normalizedQuery || normalizedQuery === '') {
        return valueStr.includes(query)
      }
      
      // For price matching, be more precise:
      // 1. Exact match on normalized values (e.g., "450000" === "450000")
      // 2. Original string contains the full query (e.g., "$450,000" contains "$450,000")
      // 3. Normalized value starts with normalized query (e.g., "450000" starts with "450" for partial search)
      //    BUT only if the query is shorter (user searching "450" should match "450000", not "1450000")
      if (normalizedValue === normalizedQuery) {
        return true // Exact match
      }
      
      // Check if original formatted string contains the query
      if (valueStr.includes(query)) {
        return true
      }
      
      // For partial number matches, only match if the normalized value starts with the normalized query
      // This prevents "450" from matching "1450000" (which contains "450" but doesn't start with it)
      if (normalizedQuery.length < normalizedValue.length && normalizedValue.startsWith(normalizedQuery)) {
        return true
      }
      
      return false
    }
    
    // If searching specifically for beds or baths, ONLY search those fields
    if (isBedsSearch) {
      return listing.beds && matchesExactNumber(listing.beds, normalizedSearchNumber)
    }
    
    if (isBathsSearch) {
      return listing.baths && matchesExactNumber(listing.baths, normalizedSearchNumber)
    }
    
    // Search in all fields (when not searching specifically for beds/baths)
    return (
      // Address fields
      (listing.address && String(listing.address).toLowerCase().includes(query)) ||
      (listing.city && String(listing.city).toLowerCase().includes(query)) ||
      (listing.state && String(listing.state).toLowerCase().includes(query)) ||
      (listing.zip && String(listing.zip).toLowerCase().includes(query)) ||
      
      // Owner name
      (listing.owner_name && String(listing.owner_name).toLowerCase().includes(query)) ||
      
      // Property details - use normalized price matching for numeric fields
      (listing.price && matchesPrice(listing.price)) ||
      // If searching just a number (no "bed" or "bath" keyword), check both beds and baths with exact match
      (normalizedSearchNumber && normalizedSearchNumber.length > 0 && (
        (listing.beds && matchesExactNumber(listing.beds, normalizedSearchNumber)) ||
        (listing.baths && matchesExactNumber(listing.baths, normalizedSearchNumber))
      )) ||
      // Square feet
      (listing.square_feet && matchesPrice(listing.square_feet)) ||
      (listing.property_type && listing.property_type.toLowerCase().includes(query)) ||
      (listing.county && listing.county.toLowerCase().includes(query)) ||
      (listing.lot_size && listing.lot_size.toLowerCase().includes(query)) ||
      (listing.lot_acres && matchesPrice(listing.lot_acres)) ||
      (listing.description && listing.description.toLowerCase().includes(query)) ||
      
      // Dates and source
      (listing.time_of_post && listing.time_of_post.toLowerCase().includes(query)) ||
      (listing.scrape_date && listing.scrape_date.toLowerCase().includes(query)) ||
      (listing.source && listing.source.toLowerCase().includes(query)) ||
      (listing.listing_link && listing.listing_link.toLowerCase().includes(query))
    )
  })

  // Group listings by source for display
  const groupedListings = {
    fsbo: filteredListings.filter(l => l.source === 'fsbo'),
    trulia: filteredListings.filter(l => l.source === 'trulia'),
    redfin: filteredListings.filter(l => l.source === 'redfin'),
    apartments: filteredListings.filter(l => l.source === 'apartments'),
    'zillow-fsbo': filteredListings.filter(l => l.source === 'zillow-fsbo'),
    'zillow-frbo': filteredListings.filter(l => l.source === 'zillow-frbo'),
    hotpads: filteredListings.filter(l => l.source === 'hotpads')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 w-full flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-lg">Loading all listings...</p>
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
            onClick={fetchAllListings}
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
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 tracking-tight">
                All Listings
              </h1>
              <p className="text-gray-500 text-xs sm:text-sm">
                Combined listings from all sources
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
              <div className="bg-blue-50 rounded-lg px-3 sm:px-4 py-2 border border-blue-200 flex-shrink-0">
                <div className="text-xl sm:text-2xl font-bold text-blue-700">{allListings.length}</div>
                <div className="text-xs text-blue-600 font-medium">Total</div>
              </div>
              <div className="flex items-center gap-2 flex-1 md:flex-initial">
                <button
                  onClick={handleDownloadAll}
                  className="bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-300 px-3 sm:px-4 py-2 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all duration-200 flex items-center gap-1.5 font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm flex-1 sm:flex-initial"
                >
                  <svg 
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2.5} 
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                    />
                  </svg>
                  <span className="hidden sm:inline">Download All</span>
                  <span className="sm:hidden">All</span>
                </button>
                <button
                  onClick={fetchAllListings}
                  className="bg-blue-50 text-blue-700 border border-blue-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-100 transition-all duration-200 flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm flex-1 sm:flex-initial"
                >
                  <span className="text-sm sm:text-base">🔄</span>
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="bg-gray-50 text-gray-700 border border-gray-300 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-100 transition-all duration-200 flex items-center gap-1.5 font-medium shadow-sm hover:shadow-md text-xs sm:text-sm flex-1 sm:flex-initial"
                >
                  <span className="hidden sm:inline">Logout</span>
                  <span className="sm:hidden">Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex-1 w-full">
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  id="search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by address, price, beds, baths, sqft, owner..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-200 outline-none transition-all text-gray-800 placeholder-gray-400 bg-white text-sm"
                />
              </div>
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-all duration-200 whitespace-nowrap text-sm shadow-sm"
              >
                Clear
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-3 text-xs sm:text-sm text-gray-600">
              <span className="font-bold text-blue-600">{filteredListings.length}</span> listing{filteredListings.length !== 1 ? 's' : ''} found
              {filteredListings.length !== allListings.length && (
                <span className="text-gray-500 ml-2">
                  (of {allListings.length} total)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Listings by Source */}
        {['fsbo', 'trulia', 'redfin', 'apartments', 'zillow-fsbo', 'zillow-frbo', 'hotpads'].map((source) => {
          const listings = groupedListings[source as keyof typeof groupedListings]
          if (listings.length === 0) return null

          const totalPages = Math.ceil(listings.length / listingsPerPage)
          const currentPageNum = currentPage[source] || 1
          const startIndex = (currentPageNum - 1) * listingsPerPage
          const endIndex = startIndex + listingsPerPage
          const paginatedListings = listings.slice(startIndex, endIndex)

          return (
            <div key={source} className="mb-8">
              {/* Source Header */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 mb-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">
                      {getSourceLabel(source)}
                    </h2>
                    <span className={`${getSourceBadgeColor(source)} text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0`}>
                      {listings.length}
                    </span>
                    <span className="text-gray-500 text-xs sm:text-sm hidden sm:inline">
                      (Showing {startIndex + 1}-{Math.min(endIndex, listings.length)})
                    </span>
                  </div>
                  <button
                    onClick={() => handleDownloadBySource(source)}
                    className="bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-300 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:from-blue-100 hover:to-blue-200 transition-all duration-200 flex items-center gap-1.5 font-semibold shadow-sm hover:shadow-md text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
                  >
                    <svg 
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2.5} 
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                      />
                    </svg>
                    <span className="hidden sm:inline">Download All Details</span>
                    <span className="sm:hidden">Download</span>
                  </button>
                </div>
              </div>

              {/* Listings Container */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Address</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Price</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Beds</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Baths</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Sqft</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Owner</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {paginatedListings.map((listing, index) => (
                        <tr 
                          key={listing.id} 
                          className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                        >
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-gray-900 max-w-xs">
                              {listing.address || 'Address Not Available'}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm font-bold text-gray-900">
                              {listing.price ? formatPrice(listing.price) : 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                            {listing.beds ? formatNumber(listing.beds) : 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 text-center">
                            {listing.baths ? formatNumber(listing.baths) : 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {listing.square_feet ? formatSquareFeet(listing.square_feet) : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                            {listing.owner_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              {listing.listing_link && (
                                <a
                                  href={listing.listing_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-1.5 rounded hover:bg-blue-50 transition-colors flex-shrink-0"
                                  title="View Listing"
                                >
                                  View
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
                                      sessionStorage.setItem('sourcePage', 'all-listings')
                                      const params = new URLSearchParams({
                                        address: listing.address || '',
                                        source: listing.source
                                      })
                                      if (listing.listing_link) {
                                        params.append('listing_link', listing.listing_link)
                                      }
                                      window.location.href = `/owner-info?${params.toString()}`
                                    }
                                  }}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-1.5 rounded hover:bg-blue-50 transition-colors flex-shrink-0"
                                  title="Owner Information"
                                >
                                  Owner
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  handleDownload(listing)
                                }}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-1.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-1 flex-shrink-0"
                                title="Download Details"
                              >
                                <svg 
                                  className="w-4 h-4 flex-shrink-0" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                                  />
                                </svg>
                                <span>Download</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card Layout */}
                <div className="md:hidden space-y-3 p-4">
                {paginatedListings.map((listing) => (
                  <div key={listing.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="space-y-2">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-1">
                          {listing.address || 'Address Not Available'}
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Price:</span>
                          <span className="ml-1 font-bold text-gray-900">{listing.price ? formatPrice(listing.price) : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Beds:</span>
                          <span className="ml-1 font-medium text-gray-900">{listing.beds ? formatNumber(listing.beds) : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Baths:</span>
                          <span className="ml-1 font-medium text-gray-900">{listing.baths ? formatNumber(listing.baths) : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Sqft:</span>
                          <span className="ml-1 font-medium text-gray-900">{listing.square_feet ? formatSquareFeet(listing.square_feet) : 'N/A'}</span>
                        </div>
                        {listing.owner_name && (
                          <div className="col-span-2">
                            <span className="text-gray-500">Owner:</span>
                            <span className="ml-1 font-medium text-gray-900 truncate block">{listing.owner_name}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                        {listing.listing_link && (
                          <a
                            href={listing.listing_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-2 rounded-lg border border-blue-300 hover:bg-blue-50 transition-colors"
                          >
                            View
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
                                sessionStorage.setItem('sourcePage', 'all-listings')
                                const params = new URLSearchParams({
                                  address: listing.address || '',
                                  source: listing.source
                                })
                                if (listing.listing_link) {
                                  params.append('listing_link', listing.listing_link)
                                }
                                window.location.href = `/owner-info?${params.toString()}`
                              }
                            }}
                            className="flex-1 text-center text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-2 rounded-lg border border-blue-300 hover:bg-blue-50 transition-colors"
                          >
                            Owner
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            handleDownload(listing)
                          }}
                          className="flex-1 text-center text-blue-600 hover:text-blue-800 text-xs font-medium px-3 py-2 rounded-lg border border-blue-300 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                        >
                          <svg 
                            className="w-4 h-4" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" 
                            />
                          </svg>
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="bg-gray-50 px-3 sm:px-4 py-2.5 border-t border-gray-200 flex items-center justify-between">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => setCurrentPage(prev => ({ ...prev, [source]: Math.max(1, currentPageNum - 1) }))}
                        disabled={currentPageNum === 1}
                        className="relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => ({ ...prev, [source]: Math.min(totalPages, currentPageNum + 1) }))}
                        disabled={currentPageNum === totalPages}
                        className="ml-2 relative inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-gray-600">
                          Page <span className="font-medium">{currentPageNum}</span> of <span className="font-medium">{totalPages}</span>
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                          <button
                            onClick={() => setCurrentPage(prev => ({ ...prev, [source]: Math.max(1, currentPageNum - 1) }))}
                            disabled={currentPageNum === 1}
                            className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="sr-only">Previous</span>
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (currentPageNum <= 3) {
                              pageNum = i + 1
                            } else if (currentPageNum >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = currentPageNum - 2 + i
                            }
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setCurrentPage(prev => ({ ...prev, [source]: pageNum }))}
                                className={`relative inline-flex items-center px-3 py-1.5 border text-xs font-medium ${
                                  currentPageNum === pageNum
                                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            )
                          })}
                          <button
                            onClick={() => setCurrentPage(prev => ({ ...prev, [source]: Math.min(totalPages, currentPageNum + 1) }))}
                            disabled={currentPageNum === totalPages}
                            className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="sr-only">Next</span>
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {filteredListings.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 text-sm sm:text-base">
              {searchQuery ? 'No listings found matching your search.' : 'No listings available.'}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-8 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-gray-500 text-xs">
              © {new Date().getFullYear()} All Listings Dashboard
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function AllListingsPage() {
  return (
    <AuthGuard>
      <AllListingsPageContent />
    </AuthGuard>
  )
}

