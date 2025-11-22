'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Toggle Button - Always visible */}
      <button
        onClick={onToggle}
        className={`fixed top-4 z-[60] transition-all duration-300 bg-white shadow-lg border border-gray-200 rounded-r-lg p-2 hover:bg-gray-50 ${
          isOpen ? 'left-64' : 'left-0'
        }`}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full bg-white shadow-lg border-r border-gray-200 z-50 transition-all duration-300 overflow-hidden ${
          isOpen ? 'w-64' : 'w-0 -translate-x-full'
        }`}
      >
        <div className={`p-6 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
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
    </>
  )
}
