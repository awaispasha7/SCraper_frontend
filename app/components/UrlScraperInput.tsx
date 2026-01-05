'use client'

import { useState } from 'react'
import { validateAndDetectPlatform, getPlatformDisplayName, validateUrlFormat } from '@/lib/url-validation'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

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
        throw new Error(data.error || 'Failed to start scraper')
      }

      setScrapeStatus({
        status: 'running',
        message: `Scraper started for ${getPlatformDisplayName(data.platform || scrapeStatus.platform)}`,
        platform: data.platform || scrapeStatus.platform
      })

      if (onSuccess && data.platform) {
        onSuccess(data.platform, trimmedUrl)
      }

      // Reset status after 5 seconds
      setTimeout(() => {
        setScrapeStatus({ status: 'idle', message: '' })
      }, 5000)
    } catch (error: any) {
      const errorMsg = error.message || 'Failed to start scraper'
      setScrapeStatus({ status: 'error', message: errorMsg })
      setValidationError(errorMsg)
      if (onError) onError(errorMsg)
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
          <button
            onClick={handleScrape}
            disabled={!url.trim() || scrapeStatus.status === 'running' || isValidating || scrapeStatus.status === 'starting'}
            className={`
              px-6 py-3 rounded-lg font-semibold
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${scrapeStatus.status === 'running' || scrapeStatus.status === 'starting'
                ? 'bg-blue-600 text-white cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
              }
            `}
          >
            {scrapeStatus.status === 'running' || scrapeStatus.status === 'starting' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Starting...
              </span>
            ) : (
              'Start Scraping'
            )}
          </button>
        </div>

        {/* Status Message */}
        {scrapeStatus.message && scrapeStatus.status !== 'idle' && (
          <div className={`
            mt-2 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-top-2
            ${scrapeStatus.status === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : scrapeStatus.status === 'success'
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
        {validationError && scrapeStatus.status === 'error' && (
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
        {scrapeStatus.status === 'idle' && scrapeStatus.platform && (
          <div className="mt-2 px-4 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 border border-blue-200">
            <span className="font-medium">Platform detected:</span> {getPlatformDisplayName(scrapeStatus.platform)}
          </div>
        )}
      </div>
    </div>
  )
}

