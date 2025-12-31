import { NextResponse } from 'next/server'
import { supabase, supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const dbClient = supabaseAdmin || supabase

        if (!dbClient) {
            return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
        }

        // Fetch ALL enrichment attempts (up to 500) sorted by most recent
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
            .not('checked_at', 'is', null)
            .order('checked_at', { ascending: false })
            .limit(500)

        if (error) {
            console.error('Error fetching enrichment history:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Get address hashes for owner details
        const addressHashes = attempts.map(a => a.address_hash)

        // Fetch corresponding owner details
        const { data: owners } = await dbClient
            .from('property_owners')
            .select('address_hash, owner_name, owner_email, owner_phone, mailing_address, source')
            .in('address_hash', addressHashes)

        const ownerMap = (owners || []).reduce((acc: any, owner: any) => {
            acc[owner.address_hash] = owner
            return acc
        }, {})

        // Merge data
        const history = attempts.map(attempt => ({
            ...attempt,
            owner_info: ownerMap[attempt.address_hash] || null
        }))

        return NextResponse.json({ history })
    } catch (error: any) {
        console.error('Enrichment history API error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
