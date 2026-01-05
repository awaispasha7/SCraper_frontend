'use client'

import { useState, useEffect } from 'react'
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

          // Debug logging
          if (!isBackendRunning && scrapeStatus.status === 'running') {
            console.log(`[UrlScraperInput] Backend reports scraper stopped for ${statusKey}:`, apiStatus)
          }

          // If backend says scraper is no longer running, reset status
          if (!isBackendRunning) {
            setScrapeStatus({ status: 'idle', message: '', platform: scrapeStatus.platform })
            setValidationError(null)
            setLogs([])
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

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    setValidationError(null)
    if (scrapeStatus.status === 'error') {
      setScrapeStatus({ status: 'idle', message: '' })
    }
  }

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

    // Validate with backend
    const isValid = await validateUrl(trimmedUrl)
    if (!isValid) {
      return
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

  const handleStopScraper = async () => {
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
        // Status will be updated by the polling effect
      } else {
        setValidationError(data.error || 'Failed to stop scraper')
      }
    } catch (error: any) {
      setValidationError(error.message || 'Failed to stop scraper')
    }
  }

  const handleBlur = () => {
    if (url.trim() && url.trim() !== defaultUrl) {
      validateUrl(url.trim())
    }
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
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={url}
              onChange={handleUrlChange}
              onBlur={handleBlur}
              placeholder={placeholder}
              className={`
                w-full px-4 py-3 pr-10 border-2 rounded-lg
                focus:outline-none focus:ring-2 focus:ring-offset-0
                transition-all duration-200
                ${getStatusColor()}
                ${validationError ? 'border-red-300' : ''}
                ${isValidating ? 'opacity-75' : ''}
              `}
              disabled={scrapeStatus.status === 'running' || isValidating}
            />
            {scrapeStatus.status !== 'idle' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getStatusIcon()}
              </div>
            )}
            {showDefaultValue && defaultUrl && !url && (
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                Default: {defaultUrl}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {scrapeStatus.status === 'running' ? (
              <button
                onClick={handleStopScraper}
                className="px-6 py-3 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
              >
                <span className="flex items-center gap-2">
                  <span>🛑</span>
                  <span>Stop Scraper</span>
                </span>
              </button>
            ) : (
              <button
                onClick={handleScrape}
                disabled={!url.trim() || isValidating || scrapeStatus.status === 'starting'}
                className={`
                  px-6 py-3 rounded-lg font-semibold
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${scrapeStatus.status === 'starting'
                    ? 'bg-blue-600 text-white cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                  }
                `}
              >
                {scrapeStatus.status === 'starting' ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⏳</span>
                    Starting...
                  </span>
                ) : (
                  'Start Scraping'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Status Message (exclude error status - errors shown separately) */}
        {scrapeStatus.message && scrapeStatus.status !== 'idle' && scrapeStatus.status !== 'error' && (
          <div className={`
            mt-2 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-top-2
            ${scrapeStatus.status === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
            }
          `}>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span>{scrapeStatus.message}</span>
            </div>
          </div>
        )}

        {/* Validation Error */}
        {validationError && (
          <div className="mt-2 px-4 py-2 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{validationError}</span>
            </div>
          </div>
        )}

        {/* Platform Detection Hint */}
        {scrapeStatus.status === 'idle' && scrapeStatus.platform && !validationError && (
          <div className="mt-2 px-4 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200">
            <span className="font-medium">Platform detected:</span> {getPlatformDisplayName(scrapeStatus.platform)}
          </div>
        )}

        {/* Log Viewer - Show when scraper is running (show even if empty to indicate polling) */}
        {scrapeStatus.status === 'running' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-700">Scraper Logs</h4>
              <span className="text-xs text-gray-500">{logs.length} log entries</span>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-700" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <div className="font-mono text-xs space-y-1">
                {logs.length === 0 ? (
                  <div className="text-gray-500 italic">Waiting for logs...</div>
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
                    <div key={index} className={`${color} flex gap-2`}>
                      <span className="text-gray-500 flex-shrink-0">{timestamp}</span>
                      <span className="flex-1 break-words">{log.message}</span>
                    </div>
                  )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

