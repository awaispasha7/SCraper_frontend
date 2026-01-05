'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'

interface OwnerInfo {
    owner_name: string | null
    owner_email: string | null
    owner_phone: string | null
    mailing_address: string | null
    source: string | null
}

interface EnrichmentAttempt {
    address_hash: string
    normalized_address: string
    status: 'enriched' | 'no_owner_data' | 'failed' | 'never_checked'
    checked_at: string
    failure_reason: string | null
    listing_source: string | null
    source_used: string | null
    owner_info: OwnerInfo | null
}

export default function EnrichmentLogPage() {
    const router = useRouter()
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [loading, setLoading] = useState(true)
    const [history, setHistory] = useState<EnrichmentAttempt[]>([])
    const [error, setError] = useState<string | null>(null)
    const [stats, setStats] = useState<{ pending: number, enriched: number, enriched_owners: number, no_data: number, smart_skipped: number, api_calls: number, is_running: boolean } | null>(null)
    const [isTriggering, setIsTriggering] = useState(false)
    const [activeTab, setActiveTab] = useState<'all' | 'enriched' | 'no_data' | 'skipped'>('all')

    useEffect(() => {
        const checkAuth = async () => {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                router.replace('/login')
                return
            }
            setIsAuthenticated(true)
        }
        checkAuth()
    }, [router])

    // Fetch stats from backend
    const fetchStats = async () => {
        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
            const res = await fetch(`${backendUrl}/api/enrichment-stats`)
            if (res.ok) {
                const data = await res.json()
                setStats(data)
            }
        } catch (e) {
            console.error('Failed to fetch stats:', e)
        }
    }

    useEffect(() => {
        if (!isAuthenticated) return

        const fetchHistory = async () => {
            try {
                setLoading(true)
                const res = await fetch('/api/enrichment-history')
                if (!res.ok) throw new Error('Failed to fetch enrichment history')
                const data = await res.json()
                setHistory(data.history || [])
            } catch (err: any) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }

        // Fetch both history and stats on page load/reload
        fetchHistory()
        fetchStats()
    }, [isAuthenticated])

    // Auto-refresh every 10 seconds when enrichment is running
    useEffect(() => {
        if (!isAuthenticated) return

        const refreshData = async () => {
            try {
                const res = await fetch('/api/enrichment-history')
                if (res.ok) {
                    const data = await res.json()
                    setHistory(data.history || [])
                }
            } catch (e) {
                console.error('Refresh failed:', e)
            }
            fetchStats()
        }

        const interval = setInterval(() => {
            fetchStats()
            // Always refresh history every 10 seconds to catch any updates
            refreshData()
        }, 10000)

        return () => clearInterval(interval)
    }, [isAuthenticated, stats?.is_running])

    // Map listing source to route
    const getSourceRoute = (source: string | null): string => {
        if (!source) return '/all-listings'
        const sourceMap: Record<string, string> = {
            'forsalebyowner': '/fsbo',
            'fsbo': '/fsbo',
            'zillow-fsbo': '/zillow-fsbo',
            'zillow fsbo': '/zillow-fsbo',
            'zillow-frbo': '/zillow-frbo',
            'zillow frbo': '/zillow-frbo',
            'hotpads': '/hotpads',
            'apartments': '/apartments',
            'apartments.com': '/apartments',
            'trulia': '/trulia-listings',
            'trulia-listings': '/trulia-listings',
            'redfin': '/redfin-listings',
            'redfin-listings': '/redfin-listings'
        }
        return sourceMap[source.toLowerCase()] || '/all-listings'
    }

    const filteredHistory = history.filter(item => {
        if (activeTab === 'all') return true
        if (activeTab === 'enriched') return item.status === 'enriched'  // Show ALL enriched, not just batchdata
        if (activeTab === 'no_data') return item.status === 'no_owner_data'
        if (activeTab === 'skipped') return item.status === 'enriched' && item.source_used === 'scraped'
        return true
    })

    const formatESTTime = (dateStr: string) => {
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).format(new Date(dateStr))
    }

    const triggerEnrichment = async () => {
        if (!confirm("Are you sure you want to trigger enrichment for the next 50 listings? This will incur costs.")) return

        try {
            setIsTriggering(true)
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
            const url = new URL(`${backendUrl}/api/trigger-enrichment`)
            url.searchParams.append('limit', '50')

            const res = await fetch(url.toString(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()
            if (res.ok) {
                alert(`✅ Started enrichment for 50 listings. Data will appear here automatically.`)
            } else {
                alert(`❌ Error: ${data.error}`)
            }
        } catch (e) {
            alert("❌ Failed to connect to backend")
            console.error(e)
        } finally {
            setIsTriggering(false)
            fetchStats()
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <nav className="bg-white shadow-sm border-b border-gray-200 mb-8 px-3 sm:px-6 py-4">
                <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto">
                        <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2 text-sm sm:text-base">
                            <span>←</span> <span className="hidden sm:inline">Back to Dashboard</span><span className="sm:hidden">Back</span>
                        </Link>
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900 border-l border-gray-200 pl-3 sm:pl-4">
                            Enrichment Activity Log
                        </h1>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
                        <button
                            onClick={triggerEnrichment}
                            disabled={isTriggering || stats?.is_running}
                            className={`${(isTriggering || stats?.is_running) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white px-3 sm:px-4 py-2 rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-2 text-sm sm:text-base`}
                        >
                            {(isTriggering || stats?.is_running) ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <span>▶️</span> <span className="hidden sm:inline">Run Enrichment (50)</span><span className="sm:hidden">Run (50)</span>
                                </>
                            )}
                        </button>
                        {stats && (
                            <div className="flex flex-wrap gap-2 text-xs">
                                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded whitespace-nowrap">Pending: {stats.pending}</span>
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded whitespace-nowrap" title="From property_owners table (actual addresses with owner data)">Enriched: {stats.enriched_owners || stats.enriched}</span>
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded whitespace-nowrap">Skipped: {stats.smart_skipped}</span>
                                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded whitespace-nowrap">API: {stats.api_calls}</span>
                            </div>
                        )}
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6 mb-6">
                    <div className="overflow-x-auto w-full md:w-auto">
                        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 min-w-fit">
                            <button
                                onClick={() => setActiveTab('all')}
                                className={`px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                All ({history.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('enriched')}
                                className={`px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'enriched' ? 'bg-green-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Enriched ({stats ? (stats.enriched_owners || stats.enriched) : history.filter(i => i.status === 'enriched').length})
                            </button>
                            <button
                                onClick={() => setActiveTab('no_data')}
                                className={`px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'no_data' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                No Data ({stats ? stats.no_data : history.filter(i => i.status === 'no_owner_data').length})
                            </button>
                            <button
                                onClick={() => setActiveTab('skipped')}
                                className={`px-3 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'skipped' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                                Skipped ({stats ? stats.smart_skipped : history.filter(i => i.status === 'enriched' && i.source_used === 'scraped').length})
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full md:w-auto">
                        {/* <p className="text-gray-500 text-xs sm:text-sm hidden sm:block">
                            💡 Tip: Click on an address to view it in the dashboard.
                        </p> */}
                        {stats?.is_running && (
                            <p className="text-blue-600 text-xs sm:text-sm font-medium animate-pulse flex items-center gap-2">
                                <span className="h-2 w-2 bg-blue-600 rounded-full"></span>
                                Live Updates
                            </p>
                        )}
                    </div>
                </div>

                <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                                    <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Address</th>
                                    <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Owner Details</th>
                                    <th className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Source</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-3 sm:px-6 py-12 text-center text-gray-500 text-sm">
                                            No enrichment history found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredHistory.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                                                <span className="hidden sm:inline">{formatESTTime(item.checked_at)}</span>
                                                <span className="sm:hidden">{new Date(item.checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            </td>
                                            <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium text-gray-900 max-w-[150px] sm:max-w-xs">
                                                <span className="truncate block" title={item.normalized_address}>
                                                    {item.normalized_address}
                                                </span>
                                            </td>
                                            <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap">
                                                <StatusBadge status={item.status} reason={item.failure_reason} />
                                            </td>
                                            <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 text-xs sm:text-sm min-w-[200px]">
                                                {item.owner_info && (item.owner_info.owner_name || item.owner_info.owner_email || item.owner_info.owner_phone || item.owner_info.mailing_address) ? (
                                                    <div className="space-y-1">
                                                        {item.owner_info.owner_name && (
                                                            <div className="font-bold text-gray-900 truncate">{item.owner_info.owner_name}</div>
                                                        )}
                                                        {item.owner_info.mailing_address && (
                                                            <div className="text-gray-600 text-[10px] sm:text-xs truncate">📍 {item.owner_info.mailing_address}</div>
                                                        )}
                                                        <div className="text-gray-500 text-[10px] sm:text-xs">
                                                            {item.owner_info.owner_email && <div className="truncate">✉️ {item.owner_info.owner_email}</div>}
                                                            {item.owner_info.owner_phone && <div className="truncate">📞 {item.owner_info.owner_phone}</div>}
                                                        </div>
                                                        <Link
                                                            href={`/owner-info?address=${encodeURIComponent(item.normalized_address)}`}
                                                            className="text-blue-600 hover:text-blue-800 text-[10px] sm:text-xs underline mt-1 inline-block"
                                                        >
                                                            View Full Details →
                                                        </Link>
                                                    </div>
                                                ) : item.status === 'enriched' ? (
                                                    <Link
                                                        href={`/owner-info?address=${encodeURIComponent(item.normalized_address)}`}
                                                        className="text-blue-600 hover:text-blue-800 text-[10px] sm:text-xs underline inline-block"
                                                    >
                                                        Check Owner Info →
                                                    </Link>
                                                ) : (
                                                    <span className="text-gray-400 italic text-xs">No details</span>
                                                )}
                                            </td>
                                            <td className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 whitespace-nowrap text-xs sm:text-sm">
                                                <Link
                                                    href={getSourceRoute(item.listing_source)}
                                                    className="text-blue-600 hover:text-blue-800 hover:underline"
                                                >
                                                    {item.listing_source || 'Unknown'}
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div >
    )
}

function StatusBadge({ status, reason }: { status: string, reason: string | null }) {
    const styles = {
        enriched: 'bg-green-100 text-green-800 border-green-200',
        no_owner_data: 'bg-amber-100 text-amber-800 border-amber-200',
        failed: 'bg-red-100 text-red-800 border-red-200',
        never_checked: 'bg-gray-100 text-gray-800 border-gray-200'
    }

    const labels = {
        enriched: '✅ Enriched',
        no_owner_data: '⚠️ No Data',
        failed: '❌ Failed',
        never_checked: '⏳ Pending'
    }

    const currentStyle = styles[status as keyof typeof styles] || styles.never_checked
    const currentLabel = labels[status as keyof typeof labels] || status

    return (
        <div className="flex flex-col">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${currentStyle} inline-block w-fit`}>
                {currentLabel}
            </span>
            {status === 'failed' && reason && (
                <span className="text-[10px] text-red-500 mt-1 max-w-[120px] truncate" title={reason}>
                    {reason}
                </span>
            )}
        </div>
    )
}
