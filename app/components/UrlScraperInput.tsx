'use client'

import { useState, useEffect, useRef } from 'react'
import { validateAndDetectPlatform, getPlatformDisplayName, validateUrlFormat, getAvailablePlatforms, searchLocationOnPlatform } from '@/lib/url-validation'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

// Map platform names from URL detector to backend status keys
const PLATFORM_TO_STATUS_KEY: Record<string, string> = {
  'apartments.com': 'apartments',
  'hotpads': 'hotpads',
  'redfin': 'redfin',
  'trulia': 'trulia',
  'zillow_fsbo': 'zillow_fsbo',
  'zillow_frbo': 'zillow_frbo',
  'fsbo': 'fsbo'
}

interface UrlScraperInputProps {
  defaultUrl?: string
  expectedPlatform?: string
  onSuccess?: (platform: string, url: string) => void
  onError?: (error: string) => void
  placeholder?: string
  showDefaultValue?: boolean
  className?: string
}

interface ScrapeStatus {
  status: 'idle' | 'validating' | 'starting' | 'running' | 'success' | 'error'
  message: string
  platform?: string | null
}

export default function UrlScraperInput({
  defaultUrl = '',
  expectedPlatform,
  onSuccess,
  onError,
  placeholder = 'Paste any property listing URL here...',
  showDefaultValue = true,
  className = ''
}: UrlScraperInputProps) {
  const [url, setUrl] = useState(defaultUrl)
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>({ status: 'idle', message: '' })
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [logs, setLogs] = useState<Array<{ timestamp: string; message: string; type: string }>>([])
  const [showStopConfirmModal, setShowStopConfirmModal] = useState(false)
  const [hasCheckedInitialStatus, setHasCheckedInitialStatus] = useState(false)
  const [scrapeStartTime, setScrapeStartTime] = useState<Date | null>(null) // Track when current scrape started
  const [scrapedCount, setScrapedCount] = useState<number | null>(null)
  
  // Helper function to get sessionStorage key for progress tracking
  const getProgressStorageKey = (platform: string | null) => {
    if (!platform) return null
    return `scraper_progress_${platform}`
  }
  
  // Initialize state from sessionStorage if available (persists across refreshes)
  const [baselineCount, setBaselineCount] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && expectedPlatform) {
      const key = getProgressStorageKey(expectedPlatform)
      if (key) {
        const stored = sessionStorage.getItem(key)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            return data.baselineCount ?? null
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    return null
  })
  
  const [expectedTotal, setExpectedTotal] = useState<number | null>(() => {
    if (typeof window !== 'undefined' && expectedPlatform) {
      const key = getProgressStorageKey(expectedPlatform)
      if (key) {
        const stored = sessionStorage.getItem(key)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            return data.expectedTotal ?? null
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    return null
  })
  
  // Track count of processed listings from logs (both saved and updated)
  const [processedCount, setProcessedCount] = useState<number>(() => {
    if (typeof window !== 'undefined' && expectedPlatform) {
      const key = getProgressStorageKey(expectedPlatform)
      if (key) {
        const stored = sessionStorage.getItem(key)
        if (stored) {
          try {
            const data = JSON.parse(stored)
            return data.processedCount ?? 0
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    return 0
  })
  
  // savedCount is calculated from logs (processedCount) - prefer processedCount from logs
  // Fall back to database difference only if processedCount is not available
  const savedCount = processedCount > 0
    ? processedCount
    : (baselineCount !== null && scrapedCount !== null
      ? Math.max(0, scrapedCount - baselineCount)
      : null)
  
  // New state for manual input method
  // If expectedPlatform is provided, auto-select it but allow both manual and URL input methods
  const [selectedPlatform, setSelectedPlatform] = useState<string>(expectedPlatform || '')
  const [locationInput, setLocationInput] = useState<string>('')
  const [inputMethod, setInputMethod] = useState<'manual' | 'url'>('manual') // Track which input method is being used - default to manual
  const [retrievedUrl, setRetrievedUrl] = useState<string | null>(null) // Store the URL retrieved from location search

  // Check initial status on mount to restore state if scraper is already running
  useEffect(() => {
    if (hasCheckedInitialStatus) return

    const checkInitialStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/status-all`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          
          // Check all platforms to see if any scraper is running
          for (const [platform, statusKey] of Object.entries(PLATFORM_TO_STATUS_KEY)) {
            const apiStatus = data[statusKey]
            const isBackendRunning = apiStatus?.status === 'running'
            
            if (isBackendRunning) {
              // Found a running scraper - restore state
              setScrapeStatus({
                status: 'running',
                message: `Scraper is running for ${getPlatformDisplayName(platform)}`,
                platform: platform
              })
              setHasCheckedInitialStatus(true)
              
              // Fetch initial logs
              const logsRes = await fetch(`${BACKEND_URL}/api/logs?scraper=${statusKey}&limit=100`, { cache: 'no-store' })
              if (logsRes.ok) {
                const logsData = await logsRes.json()
                setLogs(logsData.logs || [])
              }
              
              // Fetch initial scraped count to restore progress
              const endpointMap: Record<string, string> = {
                'fsbo': '/api/listings?',
                'apartments': '/api/apartments-listings?',
                'zillow_fsbo': '/api/zillow-fsbo-listings?',
                'zillow_frbo': '/api/zillow-frbo-listings?',
                'hotpads': '/api/hotpads-listings?',
                'redfin': '/api/redfin-listings?',
                'trulia': '/api/trulia-listings?'
              }
              const endpoint = endpointMap[statusKey]
              if (endpoint) {
                const countRes = await fetch(endpoint, { cache: 'no-store' }).catch(() => null)
                if (countRes?.ok) {
                  const countData = await countRes.json()
                  const count = countData?.total_listings || countData?.listings?.length || 0
                  setScrapedCount(count)
                }
              }
              
              // Only restore the first running scraper found
              break
            }
          }
        }
      } catch (e) {
        console.error('[UrlScraperInput] Error checking initial status:', e)
      } finally {
        setHasCheckedInitialStatus(true)
      }
    }

    checkInitialStatus()
  }, [hasCheckedInitialStatus])

  // Poll backend status and logs when scraper is running
  useEffect(() => {
    if (scrapeStatus.status !== 'running' || !scrapeStatus.platform) {
      // Only clear logs when scraper is not running AND we've checked initial status
      // This prevents clearing logs during initial state restoration
      if (scrapeStatus.status !== 'running' && hasCheckedInitialStatus) {
        setLogs([])
      }
      return
    }

    const statusKey = PLATFORM_TO_STATUS_KEY[scrapeStatus.platform]
    if (!statusKey) return

    const pollStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/status-all`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          const apiStatus = data[statusKey]
          const isBackendRunning = apiStatus?.status === 'running'

          // Fallback: If backend is idle but local status is still running, reset it
          // This handles cases where status polling might have missed the completion
          if (!isBackendRunning && scrapeStatus.status === 'running' && apiStatus?.last_run) {
            // Backend has finished but we haven't updated yet - check if we have result info
            const lastResult = apiStatus?.last_result
            if (!lastResult) {
              // No result yet, but backend is idle - reset to allow re-scraping
              setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
              setValidationError(null)
            }
          }
          
          // If backend says scraper is no longer running, check result and show message
          if (!isBackendRunning && scrapeStatus.status === 'running') {
            const lastResult = apiStatus?.last_result
            if (lastResult) {
              if (lastResult.success) {
                setScrapeStatus({ 
                  status: 'success', 
                  message: `✅ Scraping completed successfully!`, 
                  platform: scrapeStatus.platform 
                })
                if (onSuccess && scrapeStatus.platform) {
                  onSuccess(scrapeStatus.platform, url)
                }
                // Reset to idle after 2 seconds (reduced from 5) so user can scrape again sooner
                setTimeout(() => {
                  setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
                  setLogs([])
                  setScrapedCount(null)
                  setBaselineCount(null)
                  setExpectedTotal(null)
                  setProcessedCount(0)
                  setValidationError(null) // Clear any validation errors
                  // Clear sessionStorage
                  if (scrapeStatus.platform && typeof window !== 'undefined') {
                    const key = getProgressStorageKey(scrapeStatus.platform)
                    if (key) {
                      sessionStorage.removeItem(key)
                    }
                  }
                  // Keep retrievedUrl visible even after scraping completes so user can see what was scraped
                }, 2000) // Reduced to 2 seconds for faster re-scraping
              } else {
                const errorMsg = lastResult.error || `Scraping failed with return code ${lastResult.returncode || 'unknown'}`
                setScrapeStatus({ 
                  status: 'error', 
                  message: errorMsg,
                  platform: scrapeStatus.platform 
                })
                setValidationError(`❌ ${errorMsg}`)
                if (onError) {
                  onError(errorMsg)
                }
                // Reset to idle after 5 seconds even on error so user can try again
                setTimeout(() => {
                  setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
                  setValidationError(null)
                }, 5000)
              }
            } else {
              // No result info, just reset immediately so user can scrape again
              setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
              setValidationError(null)
              setLogs([])
              setScrapedCount(null)
              setBaselineCount(null)
              setExpectedTotal(null)
              setProcessedCount(0)
              // Clear sessionStorage
              if (scrapeStatus.platform && typeof window !== 'undefined') {
                const key = getProgressStorageKey(scrapeStatus.platform)
                if (key) {
                  sessionStorage.removeItem(key)
                }
              }
            }
          }
        }
      } catch (e) {
        // Log polling errors for debugging
        console.error('[UrlScraperInput] Error polling status:', e)
      }
    }

    const fetchLogs = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/logs?scraper=${statusKey}&limit=100`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs || [])
        } else {
          // Log error for debugging
          console.error('Failed to fetch logs:', res.status, res.statusText)
        }
      } catch (e) {
        // Log error for debugging
        console.error('Error fetching logs:', e)
      }
    }

    // Fetch scraped listings count for current platform
    const fetchScrapedCount = async () => {
      if (!scrapeStatus.platform) return
      
      try {
        const statusKey = PLATFORM_TO_STATUS_KEY[scrapeStatus.platform]
        if (!statusKey) return

        // Map status key to API endpoint
        const endpointMap: Record<string, string> = {
          'fsbo': '/api/listings?',
          'apartments': '/api/apartments-listings?',
          'zillow_fsbo': '/api/zillow-fsbo-listings?',
          'zillow_frbo': '/api/zillow-frbo-listings?',
          'hotpads': '/api/hotpads-listings?',
          'redfin': '/api/redfin-listings?',
          'trulia': '/api/trulia-listings?'
        }

        const endpoint = endpointMap[statusKey]
        if (!endpoint) return

        // Add timestamp for cache busting to ensure real-time updates
        const timestamp = new Date().getTime()
        const urlWithTimestamp = endpoint.includes('?') ? `${endpoint}&t=${timestamp}` : `${endpoint}?t=${timestamp}`
        const res = await fetch(urlWithTimestamp, { cache: 'no-store' }).catch(() => null)
        if (res?.ok) {
          const data = await res.json()
          const count = data?.total_listings || data?.listings?.length || 0
          setScrapedCount(count)
        }
      } catch (err) {
        // Silently fail
      }
    }

    // Poll status and logs every 2.5 seconds while scraper is running (reduced frequency to prevent excessive polling)
    const interval = setInterval(() => {
      pollStatus()
      fetchLogs()
      fetchScrapedCount()
    }, 2500) // Increased to 2.5s to reduce load and log spam
    // Initial poll
    pollStatus()
    fetchLogs()
    fetchScrapedCount()

    return () => clearInterval(interval)
  }, [scrapeStatus.status, scrapeStatus.platform, hasCheckedInitialStatus, url]) // Removed logs dependency to prevent interval recreation

  // Separate effect to parse logs when they update (doesn't recreate polling interval)
  useEffect(() => {
    if (scrapeStatus.status === 'running' && scrapeStatus.platform && logs.length > 0) {
      let foundExpectedTotal = false
      let newProcessedCount = 0
      
      // Parse all logs to extract expected total and count processed listings
      for (const log of logs) {
        const msg = log.message || ''
        
        // Extract expected total count from logs
        if (!foundExpectedTotal) {
          // Pattern 1: "Found X unique listing URLs (Expected: Y)"
          const expectedMatch1 = msg.match(/Found\s+\d+\s+unique\s+listing\s+URLs\s+\(Expected:\s+(\d+)\)/i)
          if (expectedMatch1 && expectedMatch1[1]) {
            const count = parseInt(expectedMatch1[1], 10)
            if (!isNaN(count) && count > 0) {
              setExpectedTotal(count)
              foundExpectedTotal = true
              // Persist to sessionStorage
              if (scrapeStatus.platform && typeof window !== 'undefined') {
                try {
                  const key = getProgressStorageKey(scrapeStatus.platform)
                  if (key) {
                    const stored = sessionStorage.getItem(key)
                    const progressData = stored ? JSON.parse(stored) : {}
                    progressData.expectedTotal = count
                    sessionStorage.setItem(key, JSON.stringify(progressData))
                  }
                } catch (e) {
                  // Ignore storage errors
                }
              }
            }
          }
          
          // Pattern 2: "Expected total listings from website: Y"
          if (!foundExpectedTotal) {
            const expectedMatch2 = msg.match(/Expected\s+total\s+listings\s+from\s+website:\s+(\d+)/i)
            if (expectedMatch2 && expectedMatch2[1]) {
              const count = parseInt(expectedMatch2[1], 10)
              if (!isNaN(count) && count > 0) {
                setExpectedTotal(count)
                foundExpectedTotal = true
                // Persist to sessionStorage
                if (scrapeStatus.platform && typeof window !== 'undefined') {
                  try {
                    const key = getProgressStorageKey(scrapeStatus.platform)
                    if (key) {
                      const stored = sessionStorage.getItem(key)
                      const progressData = stored ? JSON.parse(stored) : {}
                      progressData.expectedTotal = count
                      sessionStorage.setItem(key, JSON.stringify(progressData))
                    }
                  } catch (e) {
                    // Ignore storage errors
                  }
                }
              }
            }
          }
          
          // Pattern 3 (Hotpads): "Found X unique listing URLs to process (filtered from Y total URLs)"
          // Extract X (the number of unique listing URLs to process)
          if (!foundExpectedTotal) {
            const expectedMatch3 = msg.match(/Found\s+(\d+)\s+unique\s+listing\s+URLs\s+to\s+process/i)
            if (expectedMatch3 && expectedMatch3[1]) {
              const count = parseInt(expectedMatch3[1], 10)
              if (!isNaN(count) && count > 0) {
                setExpectedTotal(count)
                foundExpectedTotal = true
                // Persist to sessionStorage
                if (scrapeStatus.platform && typeof window !== 'undefined') {
                  try {
                    const key = getProgressStorageKey(scrapeStatus.platform)
                    if (key) {
                      const stored = sessionStorage.getItem(key)
                      const progressData = stored ? JSON.parse(stored) : {}
                      progressData.expectedTotal = count
                      sessionStorage.setItem(key, JSON.stringify(progressData))
                    }
                  } catch (e) {
                    // Ignore storage errors
                  }
                }
              }
            }
          }
        }
        
        // Count processed listings (both saved and updated) - Platform-specific parsing
        const msgLower = msg.toLowerCase()
        const platform = scrapeStatus.platform?.toLowerCase() || ''
        
        // Platform-specific log message parsing
        if (platform === 'hotpads') {
          // Hotpads: "SUPABASE BATCH SAVED: X items written to database"
          if (msgLower.includes('supabase batch saved') && msgLower.includes('items written to database')) {
            const match = msg.match(/SUPABASE BATCH SAVED:\s*(\d+)\s+items?\s+written\s+to\s+database/i)
            if (match && match[1]) {
              const count = parseInt(match[1], 10)
              if (!isNaN(count)) {
                newProcessedCount += count
              }
            }
          }
        } else if (platform === 'fsbo') {
          // FSBO: "Saved to Supabase: {address}" or "Updated in Supabase: {address}"
          if (msgLower.includes('saved to supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          } else if (msgLower.includes('updated in supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        } else if (platform === 'trulia') {
          // Trulia: "[OK] Saved to Supabase: {address}"
          if ((msgLower.includes('saved to supabase') || msgLower.includes('[ok] saved to supabase')) 
              && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        } else if (platform === 'zillow_frbo') {
          // Zillow FRBO: "✅ Saved to Supabase: {address}"
          if (msgLower.includes('saved to supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        } else if (platform === 'zillow_fsbo') {
          // Zillow FSBO: "Successfully uploaded: {address}"
          if (msgLower.includes('successfully uploaded') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        } else if (platform === 'redfin') {
          // Redfin: "Uploaded to Supabase (ID: {id}): {address}"
          if (msgLower.includes('uploaded to supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        } else if (platform === 'apartments') {
          // Apartments: "📤 Uploaded X items to Supabase" (batch) or individual saves
          if (msgLower.includes('uploaded') && msgLower.includes('items to supabase')) {
            const match = msg.match(/(\d+)\s+items?\s+to\s+supabase/i)
            if (match && match[1]) {
              const count = parseInt(match[1], 10)
              if (!isNaN(count)) {
                newProcessedCount += count
              }
            }
          } else if (msgLower.includes('saved to supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        } else {
          // Fallback for unknown platforms - try common patterns
          if (msgLower.includes('saved to supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          } else if (msgLower.includes('updated in supabase') && !msgLower.includes('failed') && !msgLower.includes('error') && !msgLower.includes('warning')) {
            newProcessedCount++
          }
        }
      }
      
      // Update processed count if it changed
      if (newProcessedCount > processedCount) {
        setProcessedCount(newProcessedCount)
        // Persist to sessionStorage
        if (scrapeStatus.platform && typeof window !== 'undefined') {
          try {
            const key = getProgressStorageKey(scrapeStatus.platform)
            if (key) {
              const stored = sessionStorage.getItem(key)
              const progressData = stored ? JSON.parse(stored) : {}
              progressData.processedCount = newProcessedCount
              sessionStorage.setItem(key, JSON.stringify(progressData))
            }
          } catch (e) {
            // Ignore storage errors
          }
        }
      }
    }
  }, [logs, scrapeStatus.status, scrapeStatus.platform, processedCount]) // Added processedCount to prevent unnecessary updates

  // Ref to track validation timeout
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle platform selection change
  const handlePlatformChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // Don't allow changes if expectedPlatform is set (platform is locked on individual pages)
    if (expectedPlatform) return
    setSelectedPlatform(e.target.value)
    // Don't auto-switch input method - user controls via toggle switch
    setValidationError(null)
    setScrapeStatus({ status: 'idle', message: '' })
  }

  // Handle location input change
  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocationInput(e.target.value)
    // Don't auto-switch input method - user controls via toggle switch
    setValidationError(null)
    setScrapeStatus({ status: 'idle', message: '' })
  }

  // Determine if we can start scraping based on selected input method
  const canStartScraping = (): boolean => {
    if (inputMethod === 'manual') {
      // Manual mode: both platform and location must be filled
      return !!(selectedPlatform && locationInput.trim())
    } else {
      // URL mode: URL field must have content
      return !!url.trim()
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    // Don't auto-switch input method - user controls via toggle switch
    setValidationError(null)
    if (scrapeStatus.status === 'error') {
      setScrapeStatus({ status: 'idle', message: '' })
    }

    // Clear previous timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current)
    }

    // Debounce validation - validate after user stops typing for 500ms
    const trimmedUrl = newUrl.trim()
    if (trimmedUrl && trimmedUrl.length > 10) { // Only validate if URL looks valid (at least 10 chars)
      validationTimeoutRef.current = setTimeout(() => {
        validateUrl(trimmedUrl).catch(() => {
          // Error handling is done in validateUrl
        })
      }, 500)
    } else {
      // Clear validation status if URL is too short
      setScrapeStatus({ status: 'idle', message: '', platform: null })
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current)
      }
    }
  }, [])

  const validateUrl = async (urlToValidate: string): Promise<boolean> => {
    setIsValidating(true)
    setValidationError(null)
    setScrapeStatus({ status: 'validating', message: 'Validating URL...' })

    try {
      const result = await validateAndDetectPlatform(urlToValidate, expectedPlatform)

      if (!result.isValid) {
        setValidationError(result.error || 'Invalid URL')
        setScrapeStatus({ status: 'error', message: result.error || 'Validation failed' })
        if (onError) onError(result.error || 'Validation failed')
        return false
      }

      setScrapeStatus({
        status: 'idle',
        message: result.platform ? `Detected: ${getPlatformDisplayName(result.platform)}` : '',
        platform: result.platform
      })
      return true
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to validate URL'
      setValidationError(errorMsg)
      setScrapeStatus({ status: 'error', message: errorMsg })
      if (onError) onError(errorMsg)
      return false
    } finally {
      setIsValidating(false)
    }
  }

  const handleScrape = async () => {
    // Determine which URL to use
    let trimmedUrl = ''
    
    if (inputMethod === 'manual') {
      if (!selectedPlatform || !locationInput.trim()) {
        setValidationError('Please select a platform and enter a location')
        return
      }
      
      // Search the platform for the location to get the actual listing URL
      setScrapeStatus({ status: 'validating', message: `Searching ${getPlatformDisplayName(selectedPlatform)} for "${locationInput.trim()}"...` })
      setIsValidating(true)
      
      try {
        const searchResult = await searchLocationOnPlatform(selectedPlatform, locationInput.trim())
        
        if (!searchResult || !searchResult.url) {
          setValidationError(`Could not find listing URL for "${locationInput.trim()}" on ${getPlatformDisplayName(selectedPlatform)}. Please try a different location or paste a URL directly.`)
          setScrapeStatus({ status: 'error', message: 'Location search failed' })
          setIsValidating(false)
          return
        }
        
        trimmedUrl = searchResult.url
        // Update the URL state for display purposes
        setUrl(trimmedUrl)
        // Store the retrieved URL to display it visually
        setRetrievedUrl(trimmedUrl)
        // Update platform if detected
        if (searchResult.platform) {
          setScrapeStatus({ 
            status: 'idle', 
            message: `Found: ${getPlatformDisplayName(searchResult.platform)}`,
            platform: searchResult.platform
          })
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to search location'
        setValidationError(errorMsg)
        setScrapeStatus({ status: 'error', message: errorMsg })
        setIsValidating(false)
        return
      } finally {
        setIsValidating(false)
      }
    } else {
      trimmedUrl = url.trim()
    }

    // Basic format validation
    const formatCheck = validateUrlFormat(trimmedUrl)
    if (!formatCheck.isValid) {
      setValidationError(formatCheck.error || 'Invalid URL format')
      setScrapeStatus({ status: 'error', message: formatCheck.error || 'Invalid URL format' })
      if (onError) onError(formatCheck.error || 'Invalid URL format')
      return
    }

    // If we're already validating, wait for it to complete
    if (isValidating) {
      return
    }

    // If platform is not detected yet, validate now (synchronous check)
    if (!scrapeStatus.platform || scrapeStatus.status === 'idle') {
      const isValid = await validateUrl(trimmedUrl)
      if (!isValid) {
        return
      }
    }

    // Trigger scraper
    setScrapeStatus({ status: 'starting', message: 'Starting scraper...' })
    setValidationError(null)

    try {
      const response = await fetch(`${BACKEND_URL}/api/trigger-from-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: trimmedUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Check if scraper is already running
        if (data.error && data.error.toLowerCase().includes('already running')) {
          setScrapeStatus({ status: 'running', message: data.error || 'Scraper is already running' })
          setValidationError(data.error || 'Scraper is already running')
          // Don't reset status - keep it as 'running' so button stays disabled
          return
        } else {
          throw new Error(data.error || 'Failed to start scraper')
        }
      }

      setScrapeStatus({
        status: 'running',
        message: `Scraper started for ${getPlatformDisplayName(data.platform || scrapeStatus.platform)}`,
        platform: data.platform || scrapeStatus.platform
      })
      setValidationError(null)
      
      // Keep retrievedUrl visible during scraping so user can see what URL is being scraped
      // If we don't have a retrievedUrl yet (e.g., from URL input method), use trimmedUrl
      if (!retrievedUrl && trimmedUrl) {
        setRetrievedUrl(trimmedUrl)
      }
      
      // Clear logs and track when scraping started for this session
      setLogs([])
      setScrapeStartTime(new Date())
      // Reset processed count for new scrape session
      setProcessedCount(0)
      
      // Get baseline count for this session
      const platform = data.platform || scrapeStatus.platform || ''
      if (platform) {
        const statusKey = PLATFORM_TO_STATUS_KEY[platform]
        if (statusKey) {
          const endpointMap: Record<string, string> = {
            'fsbo': '/api/listings?',
            'apartments': '/api/apartments-listings?',
            'zillow_fsbo': '/api/zillow-fsbo-listings?',
            'zillow_frbo': '/api/zillow-frbo-listings?',
            'hotpads': '/api/hotpads-listings?',
            'redfin': '/api/redfin-listings?',
            'trulia': '/api/trulia-listings?'
          }
          const endpoint = endpointMap[statusKey]
          if (endpoint) {
            try {
              const res = await fetch(endpoint, { cache: 'no-store' }).catch(() => null)
              if (res?.ok) {
                const countData = await res.json()
                const baseline = countData?.total_listings || countData?.listings?.length || 0
                setBaselineCount(baseline)
                setScrapedCount(baseline)
                
                // Persist baseline count to sessionStorage
                if (platform && typeof window !== 'undefined') {
                  try {
                    const key = getProgressStorageKey(platform)
                    if (key) {
                      const stored = sessionStorage.getItem(key)
                      const progressData = stored ? JSON.parse(stored) : {}
                      progressData.baselineCount = baseline
                      sessionStorage.setItem(key, JSON.stringify(progressData))
                    }
                  } catch (e) {
                    // Ignore storage errors
                  }
                }
              } else {
                setBaselineCount(0)
                setScrapedCount(0)
              }
            } catch (err) {
              setBaselineCount(0)
              setScrapedCount(0)
            }
          }
        }
      }

      if (onSuccess && data.platform) {
        onSuccess(data.platform, trimmedUrl)
      }

      // Don't auto-reset status - let it stay as 'running' so button stays disabled
      // The parent component or user interaction can reset it when appropriate
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start scraper'
      setScrapeStatus({ status: 'error', message: errorMsg })
      setValidationError(errorMsg)
      if (onError) onError(errorMsg)
    }
  }

  // Count listings found from logs (only since current scrape started)
  const countListingsFound = (): number => {
    if (logs.length === 0) return 0
    
    // Filter logs to only include those after scrape started
    // If no scrape start time is set, use all logs (backwards compatibility)
    const relevantLogs = scrapeStartTime 
      ? logs.filter(log => {
          try {
            const logTime = new Date(log.timestamp)
            return logTime >= scrapeStartTime
          } catch {
            // If timestamp parsing fails, include it (better to overcount than undercount)
            return true
          }
        })
      : logs
    
    if (relevantLogs.length === 0) return 0
    
    const msg = relevantLogs.map(log => log.message.toLowerCase()).join(' ')
    
    // Patterns to extract listing counts
    const countPatterns = [
      /scraped.*?(\d+)\s*items?/i,
      /(\d+)\s*items? scraped/i,
      /scraped:\s*(\d+)/i,
      /total.*?(\d+)\s*listings?/i,
      /(\d+)\s*listings? found/i,
      /found:\s*(\d+)/i,
      /count increased from \d+ to (\d+)/i,
      /current unique listing links found:\s*(\d+)/i,
      /listing links found:\s*(\d+)/i,
      /total unique urls processed:\s*(\d+)/i
    ]
    
    // Try to extract count from patterns
    for (const pattern of countPatterns) {
      const match = msg.match(pattern)
      if (match && match[1]) {
        const count = parseInt(match[1], 10)
        if (!isNaN(count) && count > 0) {
          return count
        }
      }
    }
    
    // Fallback: Count "SCRAPED:" or "Saved to Supabase" messages in relevant logs
    const scrapedCount = relevantLogs.filter(log => {
      const logMsg = log.message.toLowerCase()
      return logMsg.includes('scraped:') || 
             logMsg.includes('saved to supabase') || 
             logMsg.includes('[ok] saved to supabase')
    }).length
    
    return scrapedCount
  }

  // Check if logs indicate data was saved or processed
  const hasDataBeenSaved = () => {
    return countListingsFound() > 0
  }

  const handleStopScraper = async () => {
    if (!scrapeStatus.platform) return

    // Check if data has been saved or found
    const hasData = hasDataBeenSaved()
    
    // Debug logging (can be removed later)
    if (process.env.NODE_ENV === 'development') {
      console.log('[Stop Scraper] Checking for data:', {
        hasData,
        logCount: logs.length,
        sampleLogs: logs.slice(-5).map(l => l.message.substring(0, 100))
      })
    }
    
    if (hasData) {
      // Show confirmation modal
      setShowStopConfirmModal(true)
      return
    }

    // No data saved, stop immediately
    await executeStopScraper()
  }

  const executeStopScraper = async () => {
    if (!scrapeStatus.platform) return

    const statusKey = PLATFORM_TO_STATUS_KEY[scrapeStatus.platform]
    if (!statusKey) return

    try {
      const response = await fetch(`${BACKEND_URL}/api/stop-scraper?id=${statusKey}`, {
        method: 'GET',
      })

      const data = await response.json()

      if (response.ok) {
        setScrapeStatus({ status: 'idle', message: 'Scraper stop requested', platform: scrapeStatus.platform })
        setValidationError(null)
        setShowStopConfirmModal(false)
        // Status will be updated by the polling effect
      } else {
        setValidationError(data.error || 'Failed to stop scraper')
      }
    } catch (error: any) {
      setValidationError(error.message || 'Failed to stop scraper')
    }
  }

  const handleStopConfirmStop = () => {
    // Stop scraper
    executeStopScraper()
  }

  const handleStopConfirmContinue = () => {
    // Continue scraping - just close modal
    setShowStopConfirmModal(false)
  }

  const handleBlur = () => {
    // Validation is now handled automatically on input change
    // User controls input method via toggle switch, no auto-switching needed
  }

  const getStatusIcon = () => {
    switch (scrapeStatus.status) {
      case 'validating':
        return (
          <div className="animate-spin">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        )
      case 'starting':
      case 'running':
        return (
          <div className="animate-pulse">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" className="opacity-25" />
              <path d="M12 2a10 10 0 0110 10h-4a6 6 0 00-6-6V2z" className="opacity-75" />
            </svg>
          </div>
        )
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      default:
        return null
    }
  }
  
  // Separate function for input field icon (properly sized to prevent overflow)
  const getInputStatusIcon = () => {
    switch (scrapeStatus.status) {
      case 'validating':
        return (
          <svg className="w-full h-full animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )
      case 'starting':
      case 'running':
        return (
          <svg className="w-full h-full text-blue-600 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" className="opacity-25" />
            <path d="M12 2a10 10 0 0110 10h-4a6 6 0 00-6-6V2z" className="opacity-75" />
          </svg>
        )
      case 'success':
        return (
          <svg className="w-full h-full text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-full h-full text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (scrapeStatus.status) {
      case 'validating':
        return 'border-blue-300 focus:border-blue-500 focus:ring-blue-500'
      case 'starting':
      case 'running':
        return 'border-blue-400 focus:border-blue-600 focus:ring-blue-600'
      case 'success':
        return 'border-green-300 focus:border-green-500 focus:ring-green-500'
      case 'error':
        return 'border-red-300 focus:border-red-500 focus:ring-red-500'
      default:
        return 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
    }
  }

  // Handle toggle switch for input method
  const handleInputMethodToggle = (method: 'manual' | 'url') => {
    setInputMethod(method)
    setValidationError(null)
    setRetrievedUrl(null) // Clear retrieved URL when switching methods
    if (scrapeStatus.status === 'error') {
      setScrapeStatus({ status: 'idle', message: '' })
    }
  }
  
  // Copy URL to clipboard
  const copyUrlToClipboard = async () => {
    if (retrievedUrl) {
      try {
        await navigator.clipboard.writeText(retrievedUrl)
        // Show brief feedback
        const originalUrl = retrievedUrl
        setRetrievedUrl('✓ Copied!')
        setTimeout(() => {
          setRetrievedUrl(originalUrl)
        }, 1500)
      } catch (err) {
        console.error('Failed to copy URL:', err)
      }
    }
  }

  return (
    <div className={className}>
      <div className="relative">
        {/* Input Method Toggle Switch - Always show, even on individual scraper pages */}
        <div className="mb-6">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 w-full shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => handleInputMethodToggle('manual')}
              className={`
                flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 min-w-0
                ${
                  inputMethod === 'manual'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-900 hover:text-gray-700 bg-transparent'
                }
                ${scrapeStatus.status === 'running' || isValidating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              disabled={scrapeStatus.status === 'running' || isValidating}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
              <span className="whitespace-nowrap truncate">Search by Location</span>
            </button>
            <button
              type="button"
              onClick={() => handleInputMethodToggle('url')}
              className={`
                flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 min-w-0
                ${
                  inputMethod === 'url'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-900 hover:text-gray-700 bg-transparent'
                }
                ${scrapeStatus.status === 'running' || isValidating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
              disabled={scrapeStatus.status === 'running' || isValidating}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="whitespace-nowrap truncate">Paste URL</span>
            </button>
          </div>
        </div>

        {/* Manual Input Method: Platform + Location - Only show when selected */}
        {inputMethod === 'manual' && (
          <div className="space-y-3 mb-4">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex-1">
                <label htmlFor="platform-select" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Platform
                </label>
                <select
                  id="platform-select"
                  value={selectedPlatform}
                  onChange={handlePlatformChange}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  disabled={scrapeStatus.status === 'running' || isValidating || !!expectedPlatform}
                >
                  <option value="">Select Platform</option>
                  {getAvailablePlatforms().map(platform => (
                    <option key={platform.value} value={platform.value}>
                      {platform.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="location-input" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  City/Region/Neighborhood/County/Zip
                </label>
                <input
                  id="location-input"
                  type="text"
                  value={locationInput}
                  onChange={handleLocationChange}
                  placeholder="e.g., Chicago IL, 60601, Washington DC"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                  disabled={scrapeStatus.status === 'running' || isValidating}
                />
              </div>
            </div>
            
            {/* Display Retrieved URL - Show when URL is found from location search or during scraping */}
            {retrievedUrl && (inputMethod === 'manual' || scrapeStatus.status === 'running') && (
              <div className={`mt-4 p-4 rounded-lg shadow-sm border-2 ${
                scrapeStatus.status === 'running' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {scrapeStatus.status === 'running' ? (
                      <svg className="w-5 h-5 text-green-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs sm:text-sm font-semibold mb-1.5 ${
                      scrapeStatus.status === 'running' ? 'text-green-900' : 'text-blue-900'
                    }`}>
                      {scrapeStatus.status === 'running' ? 'Scraping URL:' : 'Found Listing URL:'}
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={retrievedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex-1 text-xs sm:text-sm break-all font-mono truncate hover:underline ${
                          scrapeStatus.status === 'running' 
                            ? 'text-green-700 hover:text-green-900' 
                            : 'text-blue-700 hover:text-blue-900'
                        }`}
                        title={retrievedUrl}
                      >
                        {retrievedUrl === '✓ Copied!' ? retrievedUrl : retrievedUrl}
                      </a>
                      {retrievedUrl !== '✓ Copied!' && (
                        <button
                          onClick={copyUrlToClipboard}
                          className={`flex-shrink-0 px-2 py-1.5 text-xs font-medium border rounded hover:bg-opacity-80 transition-colors duration-200 ${
                            scrapeStatus.status === 'running'
                              ? 'text-green-700 bg-white border-green-300 hover:bg-green-50'
                              : 'text-blue-700 bg-white border-blue-300 hover:bg-blue-50'
                          }`}
                          title="Copy URL"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Action Button for Manual Mode - Centered and decent sized */}
            <div className="flex flex-col items-center mt-6 gap-2">
              <div className="flex justify-center">
                {scrapeStatus.status === 'running' ? (
                  <button
                    onClick={handleStopScraper}
                    className="px-8 sm:px-10 py-3 sm:py-3.5 rounded-lg font-semibold text-base sm:text-lg bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap min-w-[140px] sm:min-w-[160px]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>🛑</span>
                      <span className="hidden sm:inline">Stop Scraper</span>
                      <span className="sm:hidden">Stop</span>
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handleScrape}
                    disabled={!canStartScraping() || isValidating || scrapeStatus.status === 'starting'}
                    className={`
                      px-8 sm:px-10 py-3 sm:py-3.5 rounded-lg font-semibold text-base sm:text-lg
                      transition-all duration-200 whitespace-nowrap min-w-[140px] sm:min-w-[160px]
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${scrapeStatus.status === 'starting'
                        ? 'bg-blue-600 text-white cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                      }
                    `}
                  >
                    {scrapeStatus.status === 'starting' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span>
                        <span className="hidden sm:inline">Starting...</span>
                        <span className="sm:hidden">Starting</span>
                      </span>
                    ) : (
                      <>
                        <span className="hidden sm:inline">Start Scraping</span>
                        <span className="sm:hidden">Start</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {/* Session scraped count - shown when running */}
              {scrapeStatus.status === 'running' && (
                <>
                  {/* Show progress with expected total if available, otherwise show count from logs */}
                  {expectedTotal !== null && savedCount !== null && savedCount >= 0 ? (
                    <p className="text-sm font-bold text-red-600 text-center">
                      {savedCount}/{expectedTotal} scraped this session
                    </p>
                  ) : savedCount !== null && savedCount >= 0 ? (
                    <p className="text-sm font-bold text-red-600 text-center">
                      +{savedCount.toLocaleString()} listings scraped this session
                    </p>
                  ) : scrapedCount !== null && baselineCount !== null ? (
                    <p className="text-sm font-bold text-red-600 text-center">
                      +{Math.max(0, scrapedCount - baselineCount).toLocaleString()} listings scraped this session
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}

        {/* URL Input Method - Only show when selected */}
        {inputMethod === 'url' && (
          <div className="space-y-4">
            <div className="relative overflow-hidden">
              <label htmlFor="url-input" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Paste any property listing URL to automatically detect and scrape
              </label>
              <input
                id="url-input"
                type="text"
                value={url}
                onChange={handleUrlChange}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={`
                  w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-10 sm:pr-12 text-sm sm:text-base border-2 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-offset-0
                  transition-all duration-200
                  ${getStatusColor()}
                  ${validationError ? 'border-red-300' : ''}
                  ${isValidating ? 'opacity-75' : ''}
                `}
                disabled={scrapeStatus.status === 'running' || isValidating}
              />
              {scrapeStatus.status !== 'idle' && (
                <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
                  <div className="w-4 h-4 sm:w-5 sm:h-5 overflow-hidden flex-shrink-0">
                    {getInputStatusIcon()}
                  </div>
                </div>
              )}
              {showDefaultValue && defaultUrl && !url && (
                <div className="absolute left-3 sm:left-4 top-9 sm:top-10 -translate-y-1/2 text-gray-400 text-xs sm:text-sm pointer-events-none max-w-[calc(100%-80px)] truncate">
                  Default: {defaultUrl}
                </div>
              )}
            </div>
            {/* Action Button for URL Mode - Centered and decent sized */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex justify-center">
                {scrapeStatus.status === 'running' ? (
                  <button
                    onClick={handleStopScraper}
                    className="px-8 sm:px-10 py-3 sm:py-3.5 rounded-lg font-semibold text-base sm:text-lg bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap min-w-[140px] sm:min-w-[160px]"
                  >
                    <span className="flex items-center justify-center gap-2">
                      <span>🛑</span>
                      <span className="hidden sm:inline">Stop Scraper</span>
                      <span className="sm:hidden">Stop</span>
                    </span>
                  </button>
                ) : (
                  <button
                    onClick={handleScrape}
                    disabled={!canStartScraping() || isValidating || scrapeStatus.status === 'starting'}
                    className={`
                      px-8 sm:px-10 py-3 sm:py-3.5 rounded-lg font-semibold text-base sm:text-lg
                      transition-all duration-200 whitespace-nowrap min-w-[140px] sm:min-w-[160px]
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${scrapeStatus.status === 'starting'
                        ? 'bg-blue-600 text-white cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                      }
                    `}
                  >
                    {scrapeStatus.status === 'starting' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span>
                        <span className="hidden sm:inline">Starting...</span>
                        <span className="sm:hidden">Starting</span>
                      </span>
                    ) : (
                      <>
                        <span className="hidden sm:inline">Start Scraping</span>
                        <span className="sm:hidden">Start</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {/* Session scraped count - shown when running */}
              {scrapeStatus.status === 'running' && (
                <>
                  {/* Show progress with expected total if available, otherwise show count from logs */}
                  {expectedTotal !== null && savedCount !== null && savedCount >= 0 ? (
                    <p className="text-sm font-bold text-red-600 text-center">
                      {savedCount}/{expectedTotal} scraped this session
                    </p>
                  ) : savedCount !== null && savedCount >= 0 ? (
                    <p className="text-sm font-bold text-red-600 text-center">
                      +{savedCount.toLocaleString()} listings scraped this session
                    </p>
                  ) : scrapedCount !== null && baselineCount !== null ? (
                    <p className="text-sm font-bold text-red-600 text-center">
                      +{Math.max(0, scrapedCount - baselineCount).toLocaleString()} listings scraped this session
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}

        {/* Status Message (exclude error status - errors shown separately) */}
        {scrapeStatus.message && scrapeStatus.status !== 'idle' && scrapeStatus.status !== 'error' && (
          <div className={`
            mt-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm animate-in fade-in slide-in-from-top-2
            ${scrapeStatus.status === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
            }
          `}>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="break-words">{scrapeStatus.message}</span>
            </div>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="mt-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm bg-red-50 text-red-700 border border-red-200 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="break-words flex-1">{validationError}</span>
            </div>
          </div>
        )}

        {/* Platform Detection Hint */}
        {scrapeStatus.status === 'idle' && scrapeStatus.platform && !validationError && (
          <div className="mt-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm bg-blue-50 text-blue-700 border border-blue-200">
            <span className="font-medium">Platform detected:</span> {getPlatformDisplayName(scrapeStatus.platform)}
          </div>
        )}

        {/* Log Viewer - Show when scraper is running (show even if empty to indicate polling) */}
        {scrapeStatus.status === 'running' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
              <h4 className="text-xs sm:text-sm font-semibold text-gray-700">Scraper Logs</h4>
              <span className="text-xs text-gray-500">{logs.length} log entries</span>
            </div>
            <div className="bg-gray-900 rounded-lg p-2 sm:p-4 border border-gray-700" style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <div className="font-mono text-[10px] sm:text-xs space-y-0.5 sm:space-y-1">
                {logs.length === 0 ? (
                  <div className="text-gray-500 italic text-xs sm:text-sm">Waiting for logs...</div>
                ) : (
                  logs.map((log, index) => {
                  const logType = log.type || 'info'
                  const typeColors: Record<string, string> = {
                    info: 'text-gray-300',
                    error: 'text-red-400',
                    success: 'text-green-400',
                    warning: 'text-yellow-400'
                  }
                  const color = typeColors[logType] || 'text-gray-300'
                  
                  // Format timestamp (show only time part for readability)
                  const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''
                  
                  return (
                    <div key={index} className={`${color} flex gap-1 sm:gap-2 flex-wrap sm:flex-nowrap`}>
                      <span className="text-gray-500 flex-shrink-0 text-[10px] sm:text-xs">{timestamp}</span>
                      <span className="flex-1 break-words min-w-0">{log.message}</span>
                    </div>
                  )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stop Confirmation Modal */}
      {showStopConfirmModal && (() => {
        const listingsCount = countListingsFound()
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleStopConfirmContinue}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">New Data Found</h3>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">
                    {listingsCount > 0 
                      ? `${listingsCount} listing${listingsCount !== 1 ? 's' : ''} found so far. What would you like to do?`
                      : 'New listings have been found. What would you like to do?'
                    }
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleStopConfirmStop}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Stop
                </button>
                <button
                  onClick={handleStopConfirmContinue}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Continue Scraping
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

