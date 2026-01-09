'use client'

import { useState, useEffect } from 'react'

interface ScraperRunButtonProps {
    scraperId: string
    scraperName: string
    endpoint: string
    color?: 'blue' | 'purple' | 'indigo' | 'teal' | 'cyan'
}

// Backend API URL - update this with your Railway backend URL
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

export default function ScraperRunButton({
    scraperId,
    scraperName,
    endpoint,
    color = 'blue'
}: ScraperRunButtonProps) {
    const [isRunning, setIsRunning] = useState(false)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [isSystemBusy, setIsSystemBusy] = useState(false)

    const colorClasses = {
        blue: 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100',
        purple: 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100',
        indigo: 'bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100',
        teal: 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100',
        cyan: 'bg-cyan-50 border-cyan-300 text-cyan-700 hover:bg-cyan-100'
    }

    // Poll status to sync with backend - only when scraper is running
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null

        const pollStatus = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/status-all`)
                if (res.ok) {
                    const data = await res.json()
                    const apiStatus = data[scraperId] // e.g. data['fsbo']
                    const isBackendRunning = apiStatus?.status === 'running'

                    // Check if ANY scraper is running
                    const systemCheck = data.all_scrapers?.running ||
                        Object.values(data).some((val: any) => val?.status === 'running')

                    setIsSystemBusy(systemCheck)

                    setIsRunning(prev => {
                        if (prev && !isBackendRunning && apiStatus?.last_run) {
                            // Just finished
                            if (apiStatus.last_result?.success) {
                                setToast({ message: `✅ ${scraperName} Scraper Completed!`, type: 'success' })
                            } else if (apiStatus.last_result?.error) {
                                setToast({ message: `❌ ${scraperName} Failed: ${apiStatus.last_result.error}`, type: 'error' })
                            }
                            setTimeout(() => setToast(null), 5000)
                        }
                        return isBackendRunning
                    })

                    // Start polling if any scraper is running and we're not already polling
                    if (systemCheck && !intervalId) {
                        intervalId = setInterval(pollStatus, 3000)
                    }
                    // Stop polling if no scrapers are running
                    else if (!systemCheck && intervalId) {
                        clearInterval(intervalId)
                        intervalId = null
                    }
                }
            } catch (e) {
                // ignore
            }
        }

        // Initial check - only poll if scrapers are running
        pollStatus()

        return () => {
            if (intervalId) {
                clearInterval(intervalId)
            }
        }
    }, [scraperId, scraperName]) // Only depend on scraperId and name, not running state


    const triggerScraper = async () => {
        try {
            // Optimistic update
            setIsRunning(true)
            setStatusMessage(`Starting ${scraperName}...`)

            const response = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'GET',
            })

            const data = await response.json()

            if (response.ok) {
                setStatusMessage(`✅ Request sent!`)
            } else {
                setStatusMessage(`❌ Error: ${data.error || 'Failed to start'}`)
                setIsRunning(false)
            }

            // Clear message after 3 seconds
            setTimeout(() => setStatusMessage(null), 3000)

        } catch (error) {
            console.error('Error triggering scraper:', error)
            setStatusMessage('❌ Connection Error')
            setIsRunning(false)
            setTimeout(() => setStatusMessage(null), 3000)
        }
    }

    const stopScraper = async () => {
        try {
            setStatusMessage(`Stopping ${scraperName}...`)
            const response = await fetch(`${BACKEND_URL}/api/stop-scraper?id=${scraperId}`, {
                method: 'GET',
            })
            const data = await response.json()
            if (response.ok) {
                setStatusMessage('🛑 Stopping...')
                // Wait for next poll to update status
            } else {
                setStatusMessage(`❌ Error: ${data.error}`)
            }
            setTimeout(() => setStatusMessage(null), 3000)
        } catch (error) {
            console.error('Error stopping scraper:', error)
            setStatusMessage('❌ Connection Error')
            setTimeout(() => setStatusMessage(null), 3000)
        }
    }

    const handleClick = () => {
        if (isRunning) {
            stopScraper()
        } else {
            triggerScraper()
        }
    }

    return (
        <div className="flex flex-col items-start gap-2 relative">
            <button
                onClick={handleClick}
                disabled={(!isRunning && isSystemBusy)}
                className={`flex items-center justify-center gap-2 px-4 sm:px-5 lg:px-6 py-2.5 sm:py-2.5 lg:py-3 border-2 rounded-lg transition-all duration-200 font-medium shadow-sm hover:shadow-md text-sm sm:text-base min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed ${isRunning
                    ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                    : colorClasses[color]
                    }`}
            >
                {isRunning ? (
                    <>
                        <span className="animate-spin">⏳</span>
                        <span className="hidden sm:inline">Stop Scraper</span>
                        <span className="sm:hidden">Stop</span>
                    </>
                ) : (
                    <>
                        <span>▶️</span>
                        <span className="hidden sm:inline">Run Scraper</span>
                        <span className="sm:hidden">Run</span>
                    </>
                )}
            </button>
            {statusMessage && (
                <div className={`text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg ${statusMessage.includes('✅') ? 'bg-green-100 text-green-800' :
                    statusMessage.includes('❌') ? 'bg-red-100 text-red-800' :
                        statusMessage.includes('🛑') ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                    }`}>
                    {statusMessage}
                </div>
            )}

            {/* Toast for Inner Pages */}
            {toast && (
                <div className={`fixed bottom-5 right-5 px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 z-50 transform transition-all duration-300 animate-in slide-in-from-right ${toast.type === 'success' ? 'bg-white border-green-200 text-green-800' : 'bg-white border-red-200 text-red-800'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${toast.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {toast.type === 'success' ? '✓' : '✕'}
                    </div>
                    <p className="font-semibold text-sm">{toast.message}</p>
                </div>
            )}
        </div>
    )
}
