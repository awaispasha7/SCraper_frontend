'use client'

import { useEffect, useRef, useState } from 'react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

interface LogEntry {
    timestamp: string
    message: string
    type: 'info' | 'error' | 'success'
}

export default function ConsoleViewer() {
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [autoScroll, setAutoScroll] = useState(true)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Poll for logs
    useEffect(() => {
        let lastTimestamp = ''

        const fetchLogs = async () => {
            try {
                const url = lastTimestamp
                    ? `${BACKEND_URL}/api/logs?since=${lastTimestamp}`
                    : `${BACKEND_URL}/api/logs`

                const res = await fetch(url)
                if (res.ok) {
                    const newLogs: LogEntry[] = await res.json()

                    if (newLogs.length > 0) {
                        // Update timestamp for next poll
                        lastTimestamp = newLogs[newLogs.length - 1].timestamp

                        setLogs(prev => {
                            // Merge and deduplicate just in case, though 'since' should handle it
                            const combined = [...prev, ...newLogs]
                            // Keep only last 1000 for verify performance
                            return combined.slice(-1000)
                        })

                        // Log to browser console as requested
                        newLogs.forEach(log => {
                            const prefix = `[Server ${log.timestamp}]`
                            if (log.type === 'error') console.error(prefix, log.message)
                            else if (log.type === 'success') console.log(`%c${prefix} ${log.message}`, 'color: green; font-weight: bold')
                            else console.log(prefix, log.message)
                        })
                    }
                }
            } catch (err) {
                // Silent fail
            }
        }

        const interval = setInterval(fetchLogs, 2000)
        fetchLogs() // Initial call

        return () => clearInterval(interval)
    }, [])

    // Auto-scroll logic removed as UI is hidden

    return null
}
