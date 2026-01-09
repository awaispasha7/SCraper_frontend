'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
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
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [adminName, setAdminName] = useState<string | null>(null)
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false)
  const [lastScrapeTime, setLastScrapeTime] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [totalListings, setTotalListings] = useState<number | null>(null)
  const [loadingTotalListings, setLoadingTotalListings] = useState(true)
  const [displayCount, setDisplayCount] = useState(0)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Ref to track polling interval
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Ref to track count polling interval (separate, more frequent)
  const countPollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMenuOpen])

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
  const [stoppingAll, setStoppingAll] = useState(false)
  const [scrapedCount, setScrapedCount] = useState<number | null>(null)
  const [baselineCount, setBaselineCount] = useState<number | null>(null) // Count when session started
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

  // Check authentication and get user info
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
        const email = session.user?.email || null
        setUserEmail(email)
        
        // Check if user is admin
        const adminEmail = 'omarbuciofgr@gmail.com'
        if (email?.toLowerCase() === adminEmail.toLowerCase()) {
          setAdminName('Omar Bucio Brivano')
        }
        
        // Check for welcome message flag after login
        if (typeof window !== 'undefined') {
          const showWelcome = sessionStorage.getItem('showWelcomeMessage')
          const storedAdminName = sessionStorage.getItem('adminName')
          if (showWelcome === 'true') {
            setShowWelcomeMessage(true)
            // Clear the flag
            sessionStorage.removeItem('showWelcomeMessage')
            // Hide message after 5 seconds
            setTimeout(() => {
              setShowWelcomeMessage(false)
            }, 5000)
          }
          if (storedAdminName) {
            setAdminName(storedAdminName)
            sessionStorage.removeItem('adminName')
          }
        }
        
        setCheckingAuth(false)
      } catch (err) {
        router.replace('/login')
      }
    }

    checkAuth()
  }, [router])

  // Poll for scraper status - only when scrapers are running
  useEffect(() => {
    if (!isAuthenticated) return

    const pollStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/status-all`)
        if (res.ok) {
          const data = await res.json()

          // Update All Scrapers status
          const allRunning = data.all_scrapers?.running || false
          setRunningAll(prev => {
            if (prev && !allRunning && data.all_scrapers?.last_run) {
              // Just finished running all
              setToast({ message: '🚀 All Scrapers Completed Successfully!', type: 'success' })
              setTimeout(() => setToast(null), 5000)
              setStoppingAll(false) // Clear stopping state when done
            }
            return allRunning
          })

          // Update individual statuses using functional updates to avoid stale closures
          setScraperStatuses(prevStatuses => {
            const newStatuses: Record<string, ScraperStatus> = { ...prevStatuses }

            // Helper to check completion for toast
            const checkCompletion = (key: string, name: string) => {
              const wasRunning = prevStatuses[key]?.running
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

            // Check if any scraper is running
            const anyRunning = allRunning || Object.values(newStatuses).some(s => s.running)
            
            // Start/stop count polling (more frequent - every 1.5 seconds)
            if (anyRunning && !countPollingIntervalRef.current) {
              // Fetch immediately when scraper starts
              fetchScrapedCount()
              // Then poll every 1.5 seconds for real-time updates
              countPollingIntervalRef.current = setInterval(fetchScrapedCount, 1500)
            } else if (!anyRunning && countPollingIntervalRef.current) {
              clearInterval(countPollingIntervalRef.current)
              countPollingIntervalRef.current = null
              // Reset counts when scrapers stop
              setScrapedCount(null)
              setBaselineCount(null)
            }
            
            // Start status polling if any scraper is running and we're not already polling
            if (anyRunning && !pollingIntervalRef.current) {
              pollingIntervalRef.current = setInterval(pollStatus, 3000)
            }
            // Stop status polling if no scrapers are running
            else if (!anyRunning && pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }

            return newStatuses
          })
        }
      } catch (err) {
        // console.error('Polling error', err)
      }
    }

    // Fetch scraped listings count
    const fetchScrapedCount = async () => {
      try {
        // Add timestamp for cache busting to ensure real-time updates
        const timestamp = new Date().getTime()
        const [fsboRes, truliaRes, redfinRes, apartmentsRes, zillowFsboRes, zillowFrboRes, hotpadsRes] = await Promise.all([
          fetch(`/api/listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/trulia-listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/redfin-listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/apartments-listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/zillow-fsbo-listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/zillow-frbo-listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null),
          fetch(`/api/hotpads-listings?t=${timestamp}`, { cache: 'no-store' }).catch(() => null)
        ])

        const results = await Promise.all([
          fsboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          truliaRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          redfinRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          apartmentsRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          zillowFsboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          zillowFrboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          hotpadsRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 })
        ])

        const total = results.reduce((sum, data) => {
          return sum + (data?.total_listings || data?.listings?.length || 0)
        }, 0)

        setScrapedCount(total)
      } catch (err) {
        // Silently fail - don't block status updates
      }
    }

    // Initial check on mount - only poll if scrapers are running
    pollStatus()

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      if (countPollingIntervalRef.current) {
        clearInterval(countPollingIntervalRef.current)
        countPollingIntervalRef.current = null
      }
    }
  }, [isAuthenticated]) // Only depend on authentication, not status changes

  // Animate counting effect
  useEffect(() => {
    if (totalListings === null) return

    const duration = 1500 // Animation duration in ms
    const steps = 60
    const increment = totalListings / steps
    let currentStep = 0

    const timer = setInterval(() => {
      currentStep++
      if (currentStep >= steps) {
        setDisplayCount(totalListings)
        clearInterval(timer)
      } else {
        setDisplayCount(Math.floor(increment * currentStep))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [totalListings])

  // Fetch total listings count and last scrape time (non-blocking)
  useEffect(() => {
    if (!isAuthenticated) return

    // Set loading to false immediately (don't block page render)
    setLoading(false)

    // Fetch total listings count from all platforms
    const fetchTotalListings = async () => {
      try {
        setLoadingTotalListings(true)
        // Fetch from all listing APIs in parallel to get counts
        const [fsboRes, truliaRes, redfinRes, apartmentsRes, zillowFsboRes, zillowFrboRes, hotpadsRes] = await Promise.all([
          fetch('/api/listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/trulia-listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/redfin-listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/apartments-listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/zillow-fsbo-listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/zillow-frbo-listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null),
          fetch('/api/hotpads-listings?' + new Date().getTime(), { cache: 'no-store' }).catch(() => null)
        ])

        const results = await Promise.all([
          fsboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          truliaRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          redfinRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          apartmentsRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          zillowFsboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          zillowFrboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
          hotpadsRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 })
        ])

        const total = results.reduce((sum, data) => {
          return sum + (data?.total_listings || data?.listings?.length || 0)
        }, 0)

        setTotalListings(total)
      } catch (err) {
        console.error('Error fetching total listings:', err)
        setTotalListings(0)
      } finally {
        setLoadingTotalListings(false)
      }
    }

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

    fetchTotalListings()
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
      
      // Get baseline count before scraping starts
      const getBaselineCount = async () => {
        try {
          const [fsboRes, truliaRes, redfinRes, apartmentsRes, zillowFsboRes, zillowFrboRes, hotpadsRes] = await Promise.all([
            fetch('/api/listings?', { cache: 'no-store' }).catch(() => null),
            fetch('/api/trulia-listings?', { cache: 'no-store' }).catch(() => null),
            fetch('/api/redfin-listings?', { cache: 'no-store' }).catch(() => null),
            fetch('/api/apartments-listings?', { cache: 'no-store' }).catch(() => null),
            fetch('/api/zillow-fsbo-listings?', { cache: 'no-store' }).catch(() => null),
            fetch('/api/zillow-frbo-listings?', { cache: 'no-store' }).catch(() => null),
            fetch('/api/hotpads-listings?', { cache: 'no-store' }).catch(() => null)
          ])

          const results = await Promise.all([
            fsboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
            truliaRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
            redfinRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
            apartmentsRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
            zillowFsboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
            zillowFrboRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 }),
            hotpadsRes?.json().catch(() => ({ total_listings: 0 })) || Promise.resolve({ total_listings: 0 })
          ])

          const baseline = results.reduce((sum, data) => {
            return sum + (data?.total_listings || data?.listings?.length || 0)
          }, 0)

          setBaselineCount(baseline)
          setScrapedCount(baseline) // Initialize current count
        } catch (err) {
          // Set to 0 if fetch fails
          setBaselineCount(0)
          setScrapedCount(0)
        }
      }
      
      // Get baseline count
      await getBaselineCount()

      const response = await fetch(`${BACKEND_URL}/api/trigger-all`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerMessage('✅ All scrapers started! Running sequentially in background.')
      } else {
        setTriggerMessage(`❌ Error: ${data.error || 'Failed to start scrapers'}`)
        setRunningAll(false)
        setBaselineCount(null) // Reset baseline on error
      }

      setTimeout(() => setTriggerMessage(null), 5000)

    } catch (error) {
      console.error('Error triggering all scrapers:', error)
      setTriggerMessage('❌ Error: Could not connect to backend')
      setRunningAll(false)
      setBaselineCount(null) // Reset baseline on error
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
      setStoppingAll(true) // Set stopping state

      const response = await fetch(`${BACKEND_URL}/api/stop-all`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setTriggerMessage('⏹️ All scrapers stop request sent!')
        // Immediately refresh status to sync with backend
        try {
          const statusRes = await fetch(`${BACKEND_URL}/api/status-all`)
          if (statusRes.ok) {
            const statusData = await statusRes.json()
            const stillRunning = statusData.all_scrapers?.running || false
            setRunningAll(stillRunning)
            if (!stillRunning) {
              setStoppingAll(false) // Clear stopping state if fully stopped
            }
          }
        } catch (e) {
          // Ignore status check errors
        }
      } else {
        setTriggerMessage(`❌ Error: ${data.error || 'Failed to stop sequential run'}`)
        setStoppingAll(false) // Clear stopping state on error
      }

      setTimeout(() => setTriggerMessage(null), 5000)

    } catch (error) {
      console.error('Error stopping all scrapers:', error)
      setTriggerMessage('❌ Error: Could not connect to backend')
      setStoppingAll(false) // Clear stopping state on error
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
            {/* Mobile: Hamburger Menu and Logo/Title with justify-between */}
            <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start sm:gap-4">
              {/* Hamburger Menu Button - Mobile Only */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="sm:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              {/* Logo and Title - Right aligned on mobile */}
              <Link 
                href="/"
                className="flex items-center gap-2 sm:gap-4 group cursor-pointer hover:opacity-90 transition-all duration-200 sm:flex-initial min-w-0"
              >
                {/* Logo Container - Borderless */}
                <div className="flex-shrink-0">
                  <Image
                    src="/Scraper_logo.jpg"
                    alt="Scraper Logo"
                    width={80}
                    height={80}
                    className="rounded-lg w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 group-hover:shadow-md transition-shadow duration-200"
                  />
                </div>
                {/* Title Section - Better mobile typography */}
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight group-hover:text-blue-600 transition-colors duration-200 break-words">
                    <span className="block">Scrapers</span>
                    <span className="block text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 font-medium mt-0.5 sm:mt-1">Dashboard</span>
                  </h1>
                  <p className="text-gray-600 text-xs sm:text-sm md:text-base mt-1 sm:mt-1.5 group-hover:text-gray-700 transition-colors duration-200">
                    Property Listings Management
                  </p>
                </div>
              </Link>
            </div>

            {/* User Info and Logout - Desktop Only */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-gray-200 shadow-md">
                {adminName ? (
                  <div className="flex items-center gap-2 px-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-sm text-blue-700 font-semibold truncate max-w-[200px]">
                      {adminName}
                    </span>
                  </div>
                ) : userEmail ? (
                  <div className="flex items-center gap-2 px-2">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-sm text-gray-700 font-medium truncate max-w-[200px]">
                      {userEmail}
                    </span>
                  </div>
                ) : null}
                <div className="h-6 w-px bg-gray-300"></div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-200 font-medium text-sm whitespace-nowrap"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Welcome Message Banner */}
      {showWelcomeMessage && adminName && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4 flex-1">
                <div className="flex-shrink-0">
                  <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                    <svg className="h-6 w-6 sm:h-7 sm:w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1">
                    Welcome back, {adminName}!
                  </h2>
                  <p className="text-sm sm:text-base text-blue-100">
                    Ready to manage your property listings?
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWelcomeMessage(false)}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Close welcome message"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl transform transition-transform duration-300 ease-out overflow-y-auto">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-gray-900">Menu</h2>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="py-4 px-4 space-y-4">
              {/* User Info and Logout in Sidebar */}
              {userEmail && (
                <div className="px-4 py-3 bg-gray-50 rounded-lg border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-xs text-gray-500 font-medium mb-0.5">Signed in as</p>
                      {adminName ? (
                        <p className="text-xs text-blue-700 font-semibold truncate whitespace-nowrap">
                          {adminName}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-900 font-semibold truncate whitespace-nowrap">
                          {userEmail}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false)
                      handleLogout()
                    }}
                    className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-sm whitespace-nowrap"
                  >
                    Logout
                  </button>
                </div>
              )}

              {/* Quick Actions Section Header */}
              <div className="px-2 py-2 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-1">Quick Actions</h3>
                <p className="text-xs text-gray-500 font-medium">Manage and monitor scraper controls</p>
              </div>

              {/* Quick Actions Buttons */}
              <div className="space-y-3">
                {/* Run All Scrapers - Sidebar */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      if (runningAll) {
                        stopAllScrapers()
                      } else {
                        triggerAllScrapers()
                      }
                      setIsMenuOpen(false)
                    }}
                    disabled={!runningAll && Object.values(scraperStatuses).some((s) => s.running)}
                    className={`w-full group relative flex items-center h-[76px] gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed min-w-0 ${stoppingAll
                      ? 'bg-red-50 border-red-200'
                      : runningAll
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-gray-100 hover:border-violet-200 hover:shadow-md'
                      }`}
                  >
                    <div className={`w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${stoppingAll ? 'bg-red-100 text-red-600' : runningAll ? 'bg-green-100 text-green-600' : 'bg-violet-50 text-violet-600'}`}>
                      {stoppingAll || runningAll ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="6" width="12" height="12"></rect>
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"></path>
                        </svg>
                      )}
                    </div>
                    <div className="flex flex-col items-start translate-y-[1px] min-w-0 flex-1">
                      <span className={`text-sm font-bold tracking-tight truncate w-full text-left ${stoppingAll ? 'text-red-700' : runningAll ? 'text-green-700' : 'text-violet-600'}`}>{stoppingAll ? 'Stop All' : runningAll ? 'Stop All' : 'Run All Scrapers'}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-widest truncate w-full text-left ${stoppingAll ? 'text-red-500' : runningAll ? 'text-green-600' : 'text-gray-400'}`}>{stoppingAll ? 'CANCELLING' : runningAll ? 'RUNNING' : 'READY'}</span>
                    </div>
                  </button>
                  {/* Scraped listings count - shown when running (session count only) */}
                  {(runningAll || Object.values(scraperStatuses).some((s) => s.running)) && scrapedCount !== null && baselineCount !== null && (
                    <p className="text-sm font-bold text-red-600 text-center">
                      +{Math.max(0, scrapedCount - baselineCount).toLocaleString()} listings scraped this session
                    </p>
                  )}
                </div>

                {/* Manage Enrichment - Sidebar */}
                <Link
                  href="/enrichment-log"
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full group relative flex items-center h-[76px] gap-3 p-4 rounded-xl border-2 bg-white border-gray-100 hover:border-blue-200 hover:shadow-md transition-all duration-300 min-w-0"
                >
                  <div className="w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 bg-blue-50 text-blue-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex flex-col items-start translate-y-[1px] min-w-0 flex-1">
                    <span className="text-sm font-bold tracking-tight text-blue-600 truncate w-full text-left">Manage Enrichment</span>
                    <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest truncate w-full text-left">Logs</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Total Listings */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 flex-shrink-0 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">📊</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-gray-500 text-xs sm:text-sm font-medium truncate">Total Listings</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                  {loadingTotalListings ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="animate-bounce [animation-delay:-0.3s]">.</span>
                      <span className="animate-bounce [animation-delay:-0.15s]">.</span>
                      <span className="animate-bounce">.</span>
                    </span>
                  ) : totalListings !== null ? (
                    displayCount.toLocaleString()
                  ) : (
                    'N/A'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Last Scrape Time */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 flex-shrink-0 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🕐</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-gray-500 text-xs sm:text-sm font-medium truncate">Last Scrape</p>
                <p className="text-sm sm:text-base md:text-lg font-bold text-gray-900 truncate">
                  {loading ? '...' : lastScrapeTime || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Quick Actions</h2>
              <p className="text-sm text-gray-500 font-medium">Manage and monitor scraper controls</p>
            </div>
          </div>

          <div className="px-6 sm:px-8 pb-6 sm:pb-8">
            {/* Status Message */}
            {triggerMessage && (
              <div className={`mb-5 px-4 py-3 rounded-lg text-sm flex items-center gap-2 ${triggerMessage.includes('✅') ? 'bg-green-50 text-green-700 border border-green-200' :
                triggerMessage.includes('❌') ? 'bg-red-50 text-red-700 border border-red-200' :
                  'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                {triggerMessage}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* Individual scraper buttons (FSBO, Apartments, Zillow FSBO, Zillow FRBO, Hotpads, Redfin, Trulia) have been removed - using URL-based extraction instead */}

              {/* Run All Scrapers - runs all scrapers with default URLs */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={runningAll ? stopAllScrapers : triggerAllScrapers}
                  disabled={!runningAll && Object.values(scraperStatuses).some((s) => s.running)}
                  className={`group relative flex items-center h-[76px] gap-3 p-4 rounded-xl border-2 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed min-w-0 ${stoppingAll
                    ? 'bg-red-50 border-red-200'
                    : runningAll
                    ? 'bg-green-50 border-green-200'
                    : 'bg-white border-gray-100 hover:border-violet-200 hover:shadow-md'
                    }`}
                >
                  <div className={`w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 ${stoppingAll ? 'bg-red-100 text-red-600' : runningAll ? 'bg-green-100 text-green-600' : 'bg-violet-50 text-violet-600'}`}>
                    {stoppingAll || runningAll ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12"></rect>
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"></path>
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col items-start translate-y-[1px] min-w-0 flex-1">
                    <span className={`text-sm font-bold tracking-tight truncate w-full text-left ${stoppingAll ? 'text-red-700' : runningAll ? 'text-green-700' : 'text-violet-600'}`}>{stoppingAll ? 'Stop All' : runningAll ? 'Stop All' : 'Run All Scrapers'}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-widest truncate w-full text-left ${stoppingAll ? 'text-red-500' : runningAll ? 'text-green-600' : 'text-gray-400'}`}>{stoppingAll ? 'CANCELLING' : runningAll ? 'RUNNING' : 'READY'}</span>
                  </div>
                </button>
                {/* Scraped listings count - shown when running (session count only) */}
                {(runningAll || Object.values(scraperStatuses).some((s) => s.running)) && scrapedCount !== null && baselineCount !== null && (
                  <p className="text-sm font-bold text-red-600 text-center">
                    +{Math.max(0, scrapedCount - baselineCount).toLocaleString()} listings scraped this session
                  </p>
                )}
              </div>

              {/* Manage Enrichment - button card style */}
              <Link
                href="/enrichment-log"
                className="group relative flex items-center h-[76px] gap-3 p-4 rounded-xl border-2 bg-white border-gray-100 hover:border-blue-200 hover:shadow-md transition-all duration-300 min-w-0"
              >
                <div className="w-10 h-10 flex-shrink-0 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110 bg-blue-50 text-blue-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex flex-col items-start translate-y-[1px] min-w-0 flex-1">
                  <span className="text-sm font-bold tracking-tight text-blue-600 truncate w-full text-left">Manage Enrichment</span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest truncate w-full text-left">Logs</span>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Universal URL Scraper Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 mb-6">
          <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Universal URL Scraper</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">Paste any property listing URL to automatically detect and scrape</p>
          </div>
          <div className="px-6 sm:px-8 pb-6 sm:pb-8">
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

    </div>
  )
}
