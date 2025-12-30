'use client'

interface EnrichmentBadgeProps {
    status: string | null | undefined
}

export default function EnrichmentBadge({ status }: EnrichmentBadgeProps) {
    // Normalize status
    const normalizedStatus = status?.toLowerCase() || 'never_checked'

    // Define badge styles based on status
    const getBadgeStyle = () => {
        switch (normalizedStatus) {
            case 'enriched':
                return {
                    bg: 'bg-green-100',
                    text: 'text-green-800',
                    border: 'border-green-300',
                    label: '✓ Enriched'
                }
            case 'no_owner_data':
            case 'no_data':
                return {
                    bg: 'bg-red-100',
                    text: 'text-red-800',
                    border: 'border-red-300',
                    label: '✗ No Data'
                }
            case 'checking':
                return {
                    bg: 'bg-blue-100',
                    text: 'text-blue-800',
                    border: 'border-blue-300',
                    label: '⟳ Processing'
                }
            case 'failed':
                return {
                    bg: 'bg-orange-100',
                    text: 'text-orange-800',
                    border: 'border-orange-300',
                    label: '⚠ Failed'
                }
            case 'orphaned':
                return {
                    bg: 'bg-gray-100',
                    text: 'text-gray-600',
                    border: 'border-gray-300',
                    label: '⊘ Orphaned'
                }
            case 'never_checked':
            default:
                return {
                    bg: 'bg-yellow-100',
                    text: 'text-yellow-800',
                    border: 'border-yellow-300',
                    label: '◯ Pending'
                }
        }
    }

    const style = getBadgeStyle()

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
            {style.label}
        </span>
    )
}
