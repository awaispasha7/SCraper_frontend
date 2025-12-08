'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Use pathname or fallback to empty string to prevent hydration issues
  const currentPath = mounted ? pathname : ''

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        {/* Mobile Layout - Stacked */}
        <div className="flex flex-col md:hidden py-3">
          <div className="flex items-center justify-center mb-3">
            <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Link
              href="/"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              FSBO
            </Link>
            <Link
              href="/trulia-listings"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/trulia-listings'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Trulia
            </Link>
            <Link
              href="/redfin-listings"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/redfin-listings'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Red
            </Link>
            <Link
              href="/zillow-fsbo"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/zillow-fsbo'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Zillow FSBO
            </Link>
            <Link
              href="/zillow-frbo"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/zillow-frbo'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Zillow FRBO
            </Link>
            <Link
              href="/hotpads"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/hotpads'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Hotpads
            </Link>
            <Link
              href="/apartments"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/apartments'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Apartments
            </Link>
            <Link
              href="/all-listings"
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/all-listings'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              All Listings
            </Link>
          </div>
        </div>

        {/* Desktop Layout - Horizontal */}
        <div className="hidden md:flex items-center h-16 lg:h-18">
          {/* Logo/Brand */}
          <div className="flex items-center flex-shrink-0">
            <h1 className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-900">Dashboard</h1>
          </div>

          {/* Navigation Links - Centered */}
          <div className="flex items-center gap-3 lg:gap-4 xl:gap-5 flex-1 justify-center">
            <Link
              href="/"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              FSBO
            </Link>

            <Link
              href="/trulia-listings"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/trulia-listings'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Trulia
            </Link>

            <Link
              href="/redfin-listings"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/redfin-listings'
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Red
            </Link>

            <Link
              href="/zillow-fsbo"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/zillow-fsbo'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Zillow FSBO
            </Link>

            <Link
              href="/zillow-frbo"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/zillow-frbo'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Zillow FRBO
            </Link>

            <Link
              href="/hotpads"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/hotpads'
                    ? 'bg-teal-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Hotpads
            </Link>

            <Link
              href="/apartments"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/apartments'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              Apartments
            </Link>

            <Link
              href="/all-listings"
              className={`
                px-4 lg:px-5 xl:px-6 py-2.5 rounded-lg text-sm lg:text-base font-semibold whitespace-nowrap
                transition-all duration-200
                ${
                  currentPath === '/all-listings'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                }
              `}
            >
              All Listings
            </Link>
          </div>

          {/* Spacer to balance layout */}
          <div className="flex-shrink-0 w-20 lg:w-24 xl:w-28"></div>
        </div>
      </div>
    </nav>
  )
}

