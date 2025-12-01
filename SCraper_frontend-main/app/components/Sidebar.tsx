'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-white shadow-lg border-r border-gray-200 z-50">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
        <nav className="space-y-2">
          <Link
            href="/"
            className={`block px-4 py-3 rounded-lg transition-all duration-200 ${
              pathname === '/'
                ? 'bg-blue-50 text-blue-700 border-2 border-blue-300 font-semibold'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            For Sale By Owner
          </Link>
          <Link
            href="/trulia-listings"
            className={`block px-4 py-3 rounded-lg transition-all duration-200 ${
              pathname === '/trulia-listings'
                ? 'bg-blue-50 text-blue-700 border-2 border-blue-300 font-semibold'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            Trulia Listings
          </Link>
          <Link
            href="/redfin-listings"
            className={`block px-4 py-3 rounded-lg transition-all duration-200 ${
              pathname === '/redfin-listings'
                ? 'bg-red-50 text-red-700 border-2 border-red-300 font-semibold'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            Redfin Listings
          </Link>
        </nav>
      </div>
    </div>
  )
}
