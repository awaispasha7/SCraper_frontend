'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import ConsoleViewer from './components/ConsoleViewer'

interface ScraperCard {
  href: string
  name: string
  description: string
  logo: string
  color: string
  bgColor: string
  borderColor: string
}

interface ScraperStatus {
  running: boolean
  name: string
}

// Backend API URL - update this with your Railway backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

export default function HomePage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [totalListings, setTotalListings] = useState(0)
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Scraper control states
  const [scraperStatuses, setScraperStatuses] = useState<Record<string, ScraperStatus>>({
    fsbo: { running: false, name: 'FSBO' },
    apartments: { running: false, name: 'Apartments' },
    zillow_fsbo: { running: false, name: 'Zillow FSBO' },
    zillow_frbo: { running: false, name: 'Zillow FRBO' },
    hotpads: { running: false, name: 'Hotpads' }
  })
  const [runningAll, setRunningAll] = useState(false)
  // Simple trigger message (inline)
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null)
  // Success Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

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

  // Poll for scraper status
  useEffect(() => {
    if (!isAuthenticated) return

    const pollStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/status-all`)
        if (res.ok) {
          const data = await res.json()

          // Update All Scrapers status
          const allRunning = data.all_scrapers?.running || false
          if (runningAll && !allRunning && data.all_scrapers?.last_run) {
            // Just finished running all
            setToast({ message: '🚀 All Scrapers Completed Successfully!', type: 'success' })
            setTimeout(() => setToast(null), 5000)
          }
          setRunningAll(allRunning)

          // Update individual statuses
          const newStatuses: Record<string, ScraperStatus> = { ...scraperStatuses }
          let changed = false

          // Helper to check completion for toast
          const checkCompletion = (key: string, name: string) => {
            const wasRunning = scraperStatuses[key]?.running
            const isRunning = data[key]?.status === 'running'
            const lastResult = data[key]?.last_result

            // Log status changes
            if (wasRunning !== isRunning) {
              console.log(`[Dashboard] ${name} status changed: ${wasRunning ? 'Running' : 'Idle'} -> ${isRunning ? 'Running' : 'Idle'}`)
            }

            if (wasRunning && !isRunning) {
              // Scraper just finished
              if (lastResult?.success) {
                console.log(`[Dashboard] ✅ ${name} Scraper Completed Successfully`)
                setToast({ message: `✅ ${name} Scraper Completed Successfully!`, type: 'success' })
              } else if (lastResult?.error) {
                console.error(`[Dashboard] ❌ ${name} Scraper Failed: ${lastResult.error}`)
                setToast({ message: `❌ ${name} Scraper Failed: ${lastResult.error}`, type: 'error' })
              }
              setTimeout(() => setToast(null), 5000)
            }
            return isRunning
          }

          newStatuses.fsbo.running = checkCompletion('fsbo', 'FSBO')
          newStatuses.apartments.running = checkCompletion('apartments', 'Apartments')
          newStatuses.zillow_fsbo.running = checkCompletion('zillow_fsbo', 'Zillow FSBO')
          newStatuses.zillow_frbo.running = checkCompletion('zillow_frbo', 'Zillow FRBO')
          newStatuses.hotpads.running = checkCompletion('hotpads', 'Hotpads')

          setScraperStatuses(newStatuses)
        }
      } catch (err) {
        // console.error('Polling error', err)
      }
    }

    // Initial check
    pollStatus()
    // Poll every 3 seconds
    const interval = setInterval(pollStatus, 3000)
    return () => clearInterval(interval)
  }, [isAuthenticated, runningAll]) // Depend on runningAll to detect transitions

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
          const scrapeDate = latestScrape as Date
          setLastScrapeTime(scrapeDate.toLocaleString('en-US', {
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

  // Trigger individual scraper
  const triggerScraper = async (scraperId: string, endpoint: string) => {
    try {
      // Optimistic update
      setScraperStatuses((prev: Record<string, ScraperStatus>) => ({
        ...prev,
        [scraperId]: { ...prev[scraperId], running: true }
      }))
      setTriggerMessage(`Starting ${scraperStatuses[scraperId]?.name || scraperId}...`)

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerMessage(`✅ ${scraperStatuses[scraperId]?.name || scraperId} request sent!`)
      } else {
        setTriggerMessage(`❌ Error: ${data.error || 'Failed to start scraper'}`)
        // Revert status if failed immediate
        setScraperStatuses((prev: Record<string, ScraperStatus>) => ({
          ...prev,
          [scraperId]: { ...prev[scraperId], running: false }
        }))
      }

      // Clear message after 3 seconds
      setTimeout(() => setTriggerMessage(null), 3000)

    } catch (error) {
      console.error('Error triggering scraper:', error)
      setTriggerMessage(`❌ Error: Could not connect to backend`)
      setScraperStatuses((prev: Record<string, ScraperStatus>) => ({
        ...prev,
        [scraperId]: { ...prev[scraperId], running: false }
      }))
      setTimeout(() => setTriggerMessage(null), 3000)
    }
  }

  // Trigger all scrapers
  const triggerAllScrapers = async () => {
    try {
      setRunningAll(true)
      setTriggerMessage('🚀 Starting all scrapers...')

      const response = await fetch(`${BACKEND_URL}/api/trigger-all`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerMessage('✅ All scrapers started! Running sequentially in background.')
      } else {
        setTriggerMessage(`❌ Error: ${data.error || 'Failed to start scrapers'}`)
        setRunningAll(false)
      }

      setTimeout(() => setTriggerMessage(null), 5000)

    } catch (error) {
      console.error('Error triggering all scrapers:', error)
      setTriggerMessage('❌ Error: Could not connect to backend')
      setRunningAll(false)
      setTimeout(() => setTriggerMessage(null), 5000)
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

      {/* Scraper Control Panel - Professional Design */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
              <span className="text-xs text-gray-500">Manual scraper controls</span>
            </div>
          </div>

          <div className="p-6">
            {/* Status Message */}
            {triggerMessage && (
              <div className={`mb-5 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${triggerMessage.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' :
                triggerMessage.includes('❌') ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                {triggerMessage}
              </div>
            )}

            {/* Individual Scraper Buttons - Clean Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <button
                onClick={() => triggerScraper('fsbo', '/api/trigger')}
                disabled={runningAll || Object.values(scraperStatuses).some((s) => s.running)}
                className="w-full h-full group flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraperStatuses.fsbo.running ? (
                  <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                <span className="text-xs sm:text-sm font-medium text-gray-700">FSBO</span>
              </button>

              <button
                onClick={() => triggerScraper('apartments', '/api/trigger-apartments')}
                disabled={runningAll || Object.values(scraperStatuses).some((s) => s.running)}
                className="w-full h-full group flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraperStatuses.apartments.running ? (
                  <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                <span className="text-xs sm:text-sm font-medium text-gray-700">Apts</span>
              </button>

              <button
                onClick={() => triggerScraper('zillow_fsbo', '/api/trigger-zillow-fsbo')}
                disabled={runningAll || Object.values(scraperStatuses).some((s) => s.running)}
                className="w-full h-full group flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraperStatuses.zillow_fsbo.running ? (
                  <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                <span className="text-xs sm:text-sm font-medium text-gray-700 text-center leading-tight">Z-FSBO</span>
              </button>

              <button
                onClick={() => triggerScraper('zillow_frbo', '/api/trigger-zillow-frbo')}
                disabled={runningAll || Object.values(scraperStatuses).some((s) => s.running)}
                className="w-full h-full group flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraperStatuses.zillow_frbo.running ? (
                  <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                <span className="text-xs sm:text-sm font-medium text-gray-700 text-center leading-tight">Z-FRBO</span>
              </button>

              <button
                onClick={() => triggerScraper('hotpads', '/api/trigger-hotpads')}
                disabled={runningAll || Object.values(scraperStatuses).some((s) => s.running)}
                className="w-full h-full group flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraperStatuses.hotpads.running ? (
                  <svg className="w-5 h-5 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
                <span className="text-xs sm:text-sm font-medium text-gray-700">Hotpads</span>
              </button>
            </div>

            {/* Run All Button */}
            <div className="mt-5 pt-5 border-t border-gray-100 flex justify-center">
              <button
                onClick={triggerAllScrapers}
                disabled={runningAll || Object.values(scraperStatuses).some((s) => s.running)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {runningAll ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <span>Running all scrapers...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Run All Scrapers</span>
                  </>
                )}
              </button>
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

      {/* Console Viewer (Hidden Logic) */}
      <ConsoleViewer />
    </div>
  )
}
