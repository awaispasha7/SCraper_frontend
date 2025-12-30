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
    owner_info: OwnerInfo | null
}

export default function EnrichmentLogPage() {
    const router = useRouter()
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [loading, setLoading] = useState(true)
    const [history, setHistory] = useState<EnrichmentAttempt[]>([])
    const [error, setError] = useState<string | null>(null)

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

        fetchHistory()
    }, [isAuthenticated])

    const triggerEnrichment = async () => {
        if (!confirm("Are you sure you want to trigger enrichment for the next 50 listings? This will incur costs.")) return

        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'
            const res = await fetch(`${backendUrl}/api/trigger-enrichment?limit=50`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            const data = await res.json()
            if (res.ok) {
                alert("✅ Started enrichment for 50 listings. Check logs in a few minutes.")
            } else {
                alert(`❌ Error: ${data.error}`)
            }
        } catch (e) {
            alert("❌ Failed to connect to backend")
            console.error(e)
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
            <nav className="bg-white shadow-sm border-b border-gray-200 mb-8 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2">
                            <span>←</span> Back to Dashboard
                        </Link>
                        <h1 className="text-xl font-bold text-gray-900 border-l border-gray-200 pl-4">
                            Enrichment Activity Log
                        </h1>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500 font-medium">
                        <button
                            onClick={triggerEnrichment}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2"
                        >
                            <span>▶️</span> Run Enrichment (50)
                        </button>
                        <span>Showing last 50 attempts</span>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6">
                        Error: {error}
                    </div>
                )}

                <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Time</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Address</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Owner Details</th>
                                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Source</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            No enrichment history found.
                                        </td>
                                    </tr>
                                ) : (
                                    history.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {new Date(item.checked_at).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-xs">
                                                <div className="truncate" title={item.normalized_address}>
                                                    {item.normalized_address}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <StatusBadge status={item.status} reason={item.failure_reason} />
                                            </td>
                                            <td className="px-6 py-4 text-sm">
                                                {item.owner_info ? (
                                                    <div className="space-y-1">
                                                        {item.owner_info.owner_name && (
                                                            <div className="font-bold text-gray-900">{item.owner_info.owner_name}</div>
                                                        )}
                                                        <div className="text-gray-500 text-xs">
                                                            {item.owner_info.owner_email && <div>✉️ {item.owner_info.owner_email}</div>}
                                                            {item.owner_info.owner_phone && <div>📞 {item.owner_info.owner_phone}</div>}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic">No details</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {item.listing_source || 'Unknown'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
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
