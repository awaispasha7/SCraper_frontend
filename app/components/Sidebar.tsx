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
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}

      {/* Toggle Button - Always visible */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={`
          fixed top-4 left-4 z-50
          transition-all duration-300
          bg-white shadow-md hover:shadow-lg
          border border-gray-200
          rounded-lg p-2.5
          hover:bg-gray-50
          active:scale-95
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${isOpen ? 'lg:left-[19rem]' : 'lg:left-4'}
        `}
        aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? (
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky lg:top-0
          left-0 top-0 h-full
          bg-white shadow-xl border-r border-gray-200
          z-40
          transition-all duration-300 ease-in-out
          overflow-y-auto
          ${isOpen 
            ? 'w-72 translate-x-0' 
            : 'w-0 -translate-x-full'
          }
        `}
      >
        <div className={`
          p-5 h-full flex flex-col
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0'}
        `}>
          {/* Header - Simplified */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
            {/* Close button inside sidebar */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className="lg:hidden p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation - Simplified, less clutter */}
          <nav className="space-y-1 flex-1">
            <Link
              href="/"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  onToggle()
                }
              }}
              className={`
                block px-4 py-2.5 rounded-lg
                transition-all duration-200
                ${
                  pathname === '/'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              For Sale By Owner
            </Link>

            <Link
              href="/trulia-listings"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  onToggle()
                }
              }}
              className={`
                block px-4 py-2.5 rounded-lg
                transition-all duration-200
                ${
                  pathname === '/trulia-listings'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              Trulia Listings
            </Link>

            <Link
              href="/redfin-listings"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  onToggle()
                }
              }}
              className={`
                block px-4 py-2.5 rounded-lg
                transition-all duration-200
                ${
                  pathname === '/redfin-listings'
                    ? 'bg-red-50 text-red-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              Redfin Listings
            </Link>
          </nav>
        </div>
      </aside>
    </>
  )
}
