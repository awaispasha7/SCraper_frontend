'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import ConsoleViewer from './components/ConsoleViewer'
import UrlScraperInput from './components/UrlScraperInput'

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
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Scraper control states
  const [scraperStatuses, setScraperStatuses] = useState<Record<string, ScraperStatus>>({
    fsbo: { running: false, name: 'FSBO' },
    apartments: { running: false, name: 'Apartments' },
    zillow_fsbo: { running: false, name: 'Zillow FSBO' },
    zillow_frbo: { running: false, name: 'Zillow FRBO' },
    hotpads: { running: false, name: 'Hotpads' },
    redfin: { running: false, name: 'Redfin' },
    trulia: { running: false, name: 'Trulia' }
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
          newStatuses.redfin.running = checkCompletion('redfin', 'Redfin')
          newStatuses.trulia.running = checkCompletion('trulia', 'Trulia')

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

  // Fetch last scrape time from backend status (non-blocking)
  useEffect(() => {
    if (!isAuthenticated) return

    // Set loading to false immediately (don't block page render)
    setLoading(false)

    // Fetch last scrape time in background (non-blocking)
    const fetchLastScrapeTime = async () => {
      try {
        const statusRes = await fetch(`${BACKEND_URL}/api/status-all`, { cache: 'no-store' })
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          
          // Get the most recent last_run from any individual scraper
          // (all_scrapers.finished_at is only set when running all scrapers sequentially)
          const scraperLastRuns = [
            statusData.fsbo?.last_run,
            statusData.apartments?.last_run,
            statusData.zillow_fsbo?.last_run,
            statusData.zillow_frbo?.last_run,
            statusData.hotpads?.last_run,
            statusData.redfin?.last_run,
            statusData.trulia?.last_run,
            statusData.all_scrapers?.finished_at
          ].filter(Boolean) // Remove null/undefined values
          
          if (scraperLastRuns.length > 0) {
            // Sort dates descending and take the most recent
            const sortedDates = scraperLastRuns
              .map(dateStr => new Date(dateStr))
              .sort((a, b) => b.getTime() - a.getTime())
            
            const mostRecent = sortedDates[0]
            setLastScrapeTime(mostRecent.toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }))
          }
        }
      } catch (err) {
        // Silently fail - don't block page
      }
    }

    fetchLastScrapeTime()
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

  // Stop individual scraper
  const stopScraper = async (scraperId: string) => {
    try {
      setTriggerMessage(`Stopping ${scraperStatuses[scraperId]?.name || scraperId}...`)

      const response = await fetch(`${BACKEND_URL}/api/stop-scraper?id=${scraperId}`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerMessage(`⏹️ ${scraperStatuses[scraperId]?.name || scraperId} stop request sent!`)
      } else {
        setTriggerMessage(`❌ Error: ${data.error || 'Failed to stop scraper'}`)
      }

      setTimeout(() => setTriggerMessage(null), 3000)

    } catch (error) {
      console.error('Error stopping scraper:', error)
      setTriggerMessage(`❌ Error: Could not connect to backend`)
      setTimeout(() => setTriggerMessage(null), 3000)
    }
  }

  // Stop all scrapers
  const stopAllScrapers = async () => {
    try {
      setTriggerMessage('🛑 Stopping all scrapers...')

      const response = await fetch(`${BACKEND_URL}/api/stop-all`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerMessage('⏹️ All scrapers stop request sent!')
      } else {
        setTriggerMessage(`❌ Error: ${data.error || 'Failed to stop sequential run'}`)
      }

      setTimeout(() => setTriggerMessage(null), 5000)

    } catch (error) {
      console.error('Error stopping all scrapers:', error)
      setTriggerMessage('❌ Error: Could not connect to backend')
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
                className="rounded-full shadow-lg w-16 h-16 sm:w-20 sm:h-20"
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

      {/* Universal URL Scraper Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 mb-6">
          <div className="px-6 sm:px-8 py-6 border-b border-gray-50">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Universal URL Scraper</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">Paste any property listing URL to automatically detect and scrape</p>
          </div>
          <div className="p-6 sm:p-8">
            <UrlScraperInput
              placeholder="https://www.apartments.com/chicago-il/for-rent-by-owner/ or any other platform URL..."
              onSuccess={(platform, url) => {
                setToast({ message: `✅ Scraper started for ${platform}`, type: 'success' })
                setTimeout(() => setToast(null), 5000)
              }}
              onError={(error) => {
                setToast({ message: `❌ ${error}`, type: 'error' })
                setTimeout(() => setToast(null), 5000)
              }}
            />
          </div>
        </div>
      </div>

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
                  N/A
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

      {/* Quick Actions Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 sm:mb-12">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          <div className="px-6 sm:px-8 py-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Quick Actions</h2>
              <p className="text-sm text-gray-500 font-medium">Manage and monitor scraper controls</p>
            </div>
            <Link
              href="/enrichment-log"
              className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-xl text-sm font-bold border border-blue-200 transition-all flex items-center gap-2"
            >
              <span>📋</span> View Enrichment Log
            </Link>
          </div>

          <div className="p-6 sm:p-8">
            {/* Status Message */}
            {triggerMessage && (
              <div className={`mb-5 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${triggerMessage.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' :
                triggerMessage.includes('❌') ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                {triggerMessage}
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {/* Row 1 */}
              {/* FSBO */}
              <button
                onClick={() => scraperStatuses.fsbo.running ? stopScraper('fsbo') : triggerScraper('fsbo', '/api/trigger')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.fsbo.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.fsbo.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.fsbo.running ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                  {scraperStatuses.fsbo.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.fsbo.running ? 'text-red-700' : 'text-indigo-600'}`}>{scraperStatuses.fsbo.running ? 'Stop FSBO' : 'FSBO'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.fsbo.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Apartments */}
              <button
                onClick={() => scraperStatuses.apartments.running ? stopScraper('apartments') : triggerScraper('apartments', '/api/trigger-apartments')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.apartments.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.apartments.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-emerald-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.apartments.running ? 'bg-red-100 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {scraperStatuses.apartments.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.apartments.running ? 'text-red-700' : 'text-emerald-600'}`}>{scraperStatuses.apartments.running ? 'Stop Apts' : 'Apartments'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.apartments.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Zillow FSBO */}
              <button
                onClick={() => scraperStatuses.zillow_fsbo.running ? stopScraper('zillow_fsbo') : triggerScraper('zillow_fsbo', '/api/trigger-zillow-fsbo')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.zillow_fsbo.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.zillow_fsbo.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.zillow_fsbo.running ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {scraperStatuses.zillow_fsbo.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.zillow_fsbo.running ? 'text-red-700' : 'text-blue-600'}`}>{scraperStatuses.zillow_fsbo.running ? 'Stop Z-FSBO' : 'Zillow FSBO'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.zillow_fsbo.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Zillow FRBO */}
              <button
                onClick={() => scraperStatuses.zillow_frbo.running ? stopScraper('zillow_frbo') : triggerScraper('zillow_frbo', '/api/trigger-zillow-frbo')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.zillow_frbo.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.zillow_frbo.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-violet-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.zillow_frbo.running ? 'bg-red-100 text-red-600' : 'bg-violet-50 text-violet-600'}`}>
                  {scraperStatuses.zillow_frbo.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.zillow_frbo.running ? 'text-red-700' : 'text-sky-600'}`}>{scraperStatuses.zillow_frbo.running ? 'Stop Z-FRBO' : 'Zillow FRBO'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.zillow_frbo.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Row 2 */}
              {/* Hotpads */}
              <button
                onClick={() => scraperStatuses.hotpads.running ? stopScraper('hotpads') : triggerScraper('hotpads', '/api/trigger-hotpads')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.hotpads.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.hotpads.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-teal-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.hotpads.running ? 'bg-red-100 text-red-600' : 'bg-teal-50 text-teal-600'}`}>
                  {scraperStatuses.hotpads.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.hotpads.running ? 'text-red-700' : 'text-teal-600'}`}>{scraperStatuses.hotpads.running ? 'Stop Hotpads' : 'Hotpads'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.hotpads.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Redfin */}
              <button
                onClick={() => scraperStatuses.redfin.running ? stopScraper('redfin') : triggerScraper('redfin', '/api/trigger-redfin')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.redfin.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.redfin.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-rose-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.redfin.running ? 'bg-red-100 text-red-600' : 'bg-rose-50 text-rose-600'}`}>
                  {scraperStatuses.redfin.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.redfin.running ? 'text-red-700' : 'text-rose-600'}`}>{scraperStatuses.redfin.running ? 'Stop Redfin' : 'Redfin'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.redfin.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Trulia */}
              <button
                onClick={() => scraperStatuses.trulia.running ? stopScraper('trulia') : triggerScraper('trulia', '/api/trigger-trulia')}
                disabled={runningAll || (Object.values(scraperStatuses).some((s) => s.running) && !scraperStatuses.trulia.running)}
                className={`group relative flex items-center gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${scraperStatuses.trulia.running
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-cyan-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${scraperStatuses.trulia.running ? 'bg-red-100 text-red-600' : 'bg-cyan-50 text-cyan-600'}`}>
                  {scraperStatuses.trulia.running ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${scraperStatuses.trulia.running ? 'text-red-700' : 'text-cyan-600'}`}>{scraperStatuses.trulia.running ? 'Stop Trulia' : 'Trulia'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{scraperStatuses.trulia.running ? 'Running' : 'Ready'}</span>
                </div>
              </button>

              {/* Run All Scrapers */}
              <button
                onClick={runningAll ? stopAllScrapers : triggerAllScrapers}
                disabled={!runningAll && Object.values(scraperStatuses).some((s) => s.running)}
                className={`group relative flex items-center h-[76px] gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${runningAll
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-100 hover:border-violet-200 hover:shadow-md'
                  }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${runningAll ? 'bg-red-100 text-red-600' : 'bg-violet-50 text-violet-600'}`}>
                  {runningAll ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12"></rect>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"></path>
                    </svg>
                  )}
                </div>
                <div className="flex flex-col items-start translate-y-[1px]">
                  <span className={`text-sm font-bold tracking-tight ${runningAll ? 'text-red-700' : 'text-violet-600'}`}>{runningAll ? 'Stop All' : 'Run All'}</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">{runningAll ? 'Cancelling' : 'Ready'}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scraper Cards Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6 tracking-tight">Select a Scraper</h2>
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
                <h3 className={`text-xl font-bold ${scraper.color} mb-1`}>
                  {scraper.name}
                </h3>
                <p className="text-gray-600 text-sm font-medium">
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
