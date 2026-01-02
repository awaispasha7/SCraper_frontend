import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const dbClient = supabaseAdmin || supabase

        if (!dbClient) {
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
        }

        // Fetch ALL enrichment attempts to match stats box counts
        // Removed checked_at filter to show all records (not just checked ones)
        // Using pagination to handle large datasets
        let allAttempts: any[] = []
        let page = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
            const { data: attempts, error } = await dbClient
                .from('property_owner_enrichment_state')
                .select(`
                    address_hash,
                    normalized_address,
                    status,
                    checked_at,
                    failure_reason,
                    listing_source,
                    source_used
                `)
                .order('created_at', { ascending: false })
                .range(page * pageSize, (page + 1) * pageSize - 1)

            if (error) {
                console.error('Error fetching enrichment history:', error)
                return NextResponse.json({ error: error.message }, { status: 500 })
            }

            if (!attempts || attempts.length === 0) {
                hasMore = false
            } else {
                allAttempts = allAttempts.concat(attempts)
                hasMore = attempts.length === pageSize
                page++
            }
        }

        // Sort by checked_at if available, otherwise by created_at
        allAttempts.sort((a, b) => {
            const aTime = a.checked_at || a.created_at || ''
            const bTime = b.checked_at || b.created_at || ''
            return bTime.localeCompare(aTime)
        })

        // Get address hashes for owner details (batch in chunks of 1000 for Supabase limit)
        const addressHashes = allAttempts.map(a => a.address_hash)
        const uniqueHashes = Array.from(new Set(addressHashes))
        
        // Fetch corresponding owner details in batches
        let allOwners: any[] = []
        for (let i = 0; i < uniqueHashes.length; i += 1000) {
            const batch = uniqueHashes.slice(i, i + 1000)
            const { data: owners } = await dbClient
                .from('property_owners')
                .select('address_hash, owner_name, owner_email, owner_phone, mailing_address, source')
                .in('address_hash', batch)
            
            if (owners) {
                allOwners = allOwners.concat(owners)
            }
        }

        const ownerMap = allOwners.reduce((acc: any, owner: any) => {
            acc[owner.address_hash] = owner
            return acc
        }, {})

        // Merge data
        const history = allAttempts.map(attempt => ({
            ...attempt,
            owner_info: ownerMap[attempt.address_hash] || null
        }))

        return NextResponse.json({ history })
    } catch (error: any) {
        console.error('Enrichment history API error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
