'use client'

import { useState, useEffect, useRef } from 'react'
import { validateAndDetectPlatform, getPlatformDisplayName, validateUrlFormat } from '@/lib/url-validation'

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

  // Poll backend status and logs when scraper is running
  useEffect(() => {
    if (scrapeStatus.status !== 'running' || !scrapeStatus.platform) {
      // Clear logs when scraper is not running
      if (scrapeStatus.status !== 'running') {
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
                // Reset to idle after 5 seconds
                setTimeout(() => {
                  setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
                  setLogs([])
                }, 5000)
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
              }
            } else {
              // No result info, just reset
              setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
              setValidationError(null)
              setLogs([])
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

    // Poll status and logs every 2 seconds while scraper is running
    const interval = setInterval(() => {
      pollStatus()
      fetchLogs()
    }, 2000)
    // Initial poll
    pollStatus()
    fetchLogs()

    return () => clearInterval(interval)
  }, [scrapeStatus.status, scrapeStatus.platform])

  // Ref to track validation timeout
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
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
    const trimmedUrl = url.trim()

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

  // Check if logs indicate data was saved or processed
  const hasDataBeenSaved = () => {
    if (logs.length === 0) return false
    
    const msg = logs.map(log => log.message.toLowerCase()).join(' ')
    
    // Explicit save indicators
    const explicitSaveIndicators = [
      'saved to supabase',
      'uploaded to supabase',
      'inserted',
      'updated',
      'listing saved',
      'saved listing'
    ]
    
    // Data processing indicators (from FSBO logs)
    const processingIndicators = [
      'new listings loaded',
      'count increased',
      'current unique listing links found',
      'listing links found',
      'total unique urls processed',
      'incremental check',
      'listings already exist',
      '[ok] listing',
      'unique listing links'
    ]
    
    // Check for explicit saves
    const hasExplicitSave = explicitSaveIndicators.some(indicator => msg.includes(indicator))
    
    // Check for processing indicators
    const hasProcessing = processingIndicators.some(indicator => msg.includes(indicator))
    
    // Check for numeric counts in messages (e.g., "found: 20", "count: 40", "520 listings")
    const hasNumericCount = logs.some(log => {
      const logMsg = log.message.toLowerCase()
      // Match patterns like "found: 520", "count increased from 500 to 520", "520 (Expected: 1314)"
      const patterns = [
        /count increased from \d+ to \d+/,
        /found:\s*\d+/,
        /links found:\s*\d+/,
        /listings found:\s*\d+/,
        /unique listing links found:\s*\d+/,
        /\d+\s*\(expected:\s*\d+\)/,
        /current unique listing links found:\s*\d+/
      ]
      return patterns.some(pattern => pattern.test(logMsg))
    })
    
    // If we have processing indicators OR numeric counts, consider it as data found
    return hasExplicitSave || (hasProcessing && hasNumericCount) || hasNumericCount
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

  const handleStopConfirmSave = () => {
    // Save it - stop scraper (data already saved)
    executeStopScraper()
  }

  const handleStopConfirmCancel = () => {
    // Cancel/Continue - don't stop, just close modal
    setShowStopConfirmModal(false)
  }

  const handleBlur = () => {
    // Validation is now handled automatically on input change
    // This handler is kept for potential future use but doesn't need to validate
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

  return (
    <div className={className}>
      <div className="relative">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={url}
              onChange={handleUrlChange}
              onBlur={handleBlur}
              placeholder={placeholder}
              className={`
                w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-10 text-sm sm:text-base border-2 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-offset-0
                transition-all duration-200
                ${getStatusColor()}
                ${validationError ? 'border-red-300' : ''}
                ${isValidating ? 'opacity-75' : ''}
              `}
              disabled={scrapeStatus.status === 'running' || isValidating}
            />
            {scrapeStatus.status !== 'idle' && (
              <div className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2">
                {getStatusIcon()}
              </div>
            )}
            {showDefaultValue && defaultUrl && !url && (
              <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs sm:text-sm pointer-events-none max-w-[calc(100%-80px)] truncate">
                Default: {defaultUrl}
              </div>
            )}
          </div>
          {scrapeStatus.status === 'running' ? (
            <button
              onClick={handleStopScraper}
              className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold text-sm sm:text-base bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg transition-all duration-200 whitespace-nowrap"
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
              disabled={!url.trim() || isValidating || scrapeStatus.status === 'starting'}
              className={`
                px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-semibold text-sm sm:text-base
                transition-all duration-200 whitespace-nowrap
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
      {showStopConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleStopConfirmCancel}>
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
                  Scraping has found new listings. What would you like to do?
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <button
                onClick={handleStopConfirmSave}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save It (Stop Scraping)
              </button>
              <button
                onClick={handleStopConfirmCancel}
                className="w-full px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-all duration-200 border border-gray-300 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel (Continue Scraping)
              </button>
            </div>

            <p className="text-xs text-gray-500 text-center">
              Note: Data is already saved. "Save It" will stop the scraper now.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

