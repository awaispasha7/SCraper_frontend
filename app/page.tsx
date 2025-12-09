'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'

interface ScraperCard {
  href: string
  name: string
  description: string
  logo: string
  color: string
  bgColor: string
  borderColor: string
}

export default function HomePage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [totalListings, setTotalListings] = useState(0)
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const scrapers: ScraperCard[] = [
    {
      href: '/fsbo',
      name: 'FSBO',
      description: 'For Sale By Owner Listings',
      logo: '/fsbo-default.2328aad2.svg',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200'
    },
    {
      href: '/trulia-listings',
      name: 'Trulia',
      description: 'Trulia Property Listings',
      logo: '/trulia_logo.png',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200'
    },
    {
      href: '/redfin-listings',
      name: 'Redfin',
      description: 'Redfin FSBO Listings',
      logo: '/redfin_logo.png',
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200'
    },
    {
      href: '/zillow-fsbo',
      name: 'Zillow FSBO',
      description: 'Zillow For Sale By Owner',
      logo: '/Zillow.jpg',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200'
    },
    {
      href: '/zillow-frbo',
      name: 'Zillow FRBO',
      description: 'Zillow For Rent By Owner',
      logo: '/Zillow.jpg',
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200'
    },
    {
      href: '/hotpads',
      name: 'Hotpads',
      description: 'Hotpads Rental Listings',
      logo: '/hotpads_logo.png',
      color: 'text-teal-700',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-200'
    },
    {
      href: '/apartments',
      name: 'Apartments',
      description: 'Apartment Rental Listings',
      logo: '/apartments_logo.png',
      color: 'text-cyan-700',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200'
    },
    {
      href: '/all-listings',
      name: 'All Listings',
      description: 'View All Combined Listings',
      logo: '/Scraper_logo.jpg',
      color: 'text-gray-700',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200'
    }
  ]

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error || !session) {
          router.replace('/login')
          return
        }

        setIsAuthenticated(true)
        setCheckingAuth(false)
      } catch (err) {
        router.replace('/login')
      }
    }

    checkAuth()
  }, [router])

  // Fetch total listings count
  useEffect(() => {
    if (!isAuthenticated) return

    const fetchStats = async () => {
      try {
        setLoading(true)

        // Fetch from all APIs in parallel
        const [fsboRes, truliaRes, redfinRes, apartmentsRes, zillowFsboRes, zillowFrboRes, hotpadsRes] = await Promise.all([
          fetch('/api/listings?' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/trulia-listings?' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/redfin-listings?' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/apartments-listings?' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/zillow-fsbo-listings?' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/zillow-frbo-listings?' + Date.now(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/hotpads-listings?' + Date.now(), { cache: 'no-store' }).catch(() => null)
        ])

        let total = 0
        let latestScrape: Date | null = null

        const parseResponse = async (res: Response | null) => {
          if (!res || !res.ok) return { count: 0, timestamp: null }
          try {
            const data = await res.json()
            const count = data.total_listings || data.listings?.length || 0
            const timestamp = data.scrape_timestamp || data.scrape_date || null
            return { count, timestamp }
          } catch {
            return { count: 0, timestamp: null }
          }
        }

        const results = await Promise.all([
          parseResponse(fsboRes),
          parseResponse(truliaRes),
          parseResponse(redfinRes),
          parseResponse(apartmentsRes),
          parseResponse(zillowFsboRes),
          parseResponse(zillowFrboRes),
          parseResponse(hotpadsRes)
        ])

        results.forEach(({ count, timestamp }) => {
          total += count
          if (timestamp) {
            const date = new Date(timestamp)
            if (!latestScrape || date > latestScrape) {
              latestScrape = date
            }
          }
        })

        setTotalListings(total)
        if (latestScrape) {
          setLastScrapeTime(latestScrape.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }))
        }
      } catch (err) {
        console.error('Error fetching stats:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [isAuthenticated])

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      localStorage.setItem('justLoggedOut', 'true')
      await supabase.auth.signOut()
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')
      window.location.href = '/login'
    } catch (err) {
      localStorage.setItem('justLoggedOut', 'true')
      window.location.href = '/login'
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <Image
                src="/Scraper_logo.jpg"
                alt="Scraper Logo"
                width={80}
                height={80}
                className="rounded-xl shadow-lg w-16 h-16 sm:w-20 sm:h-20"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                  Scrapers Dashboard
                </h1>
                <p className="text-gray-600 text-sm sm:text-base">
                  Property Listings Management
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="bg-gray-100 text-gray-700 border border-gray-300 px-6 py-2.5 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium shadow-sm hover:shadow-md min-h-[44px]"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Stats Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Total Listings */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Total Listings</p>
                <p className="text-3xl font-bold text-gray-900">
                  {loading ? '...' : totalListings.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Last Scrape Time */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🕐</span>
              </div>
              <div>
                <p className="text-gray-500 text-sm font-medium">Last Scrape</p>
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  {loading ? '...' : lastScrapeTime || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scraper Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Select a Scraper</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {scrapers.map((scraper) => (
            <Link
              key={scraper.href}
              href={scraper.href}
              className={`${scraper.bgColor} ${scraper.borderColor} border-2 rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 group`}
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-xl overflow-hidden shadow-md mb-4 bg-white p-2 group-hover:scale-110 transition-transform duration-300">
                  <Image
                    src={scraper.logo}
                    alt={`${scraper.name} Logo`}
                    width={80}
                    height={80}
                    className="w-full h-full object-contain"
                  />
                </div>
                <h3 className={`text-lg font-bold ${scraper.color} mb-1`}>
                  {scraper.name}
                </h3>
                <p className="text-gray-600 text-sm">
                  {scraper.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
