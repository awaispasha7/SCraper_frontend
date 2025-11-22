'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="bg-white shadow-md border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        {/* Mobile Layout - Stacked */}
        <div className="flex flex-col md:hidden py-2">
          <div className="flex items-center justify-center mb-2">
            <h1 className="text-base font-bold text-gray-900">Dashboard</h1>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <Link
              href="/"
              className={`
                px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  pathname === '/'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              FSBO
            </Link>
            <Link
              href="/trulia-listings"
              className={`
                px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  pathname === '/trulia-listings'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              Trulia
            </Link>
            <Link
              href="/redfin-listings"
              className={`
                px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  pathname === '/redfin-listings'
                    ? 'bg-red-50 text-red-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              Redfin
            </Link>
          </div>
        </div>

        {/* Desktop Layout - Horizontal */}
        <div className="hidden md:flex items-center h-14 lg:h-16">
          {/* Logo/Brand */}
          <div className="flex items-center flex-shrink-0">
            <h1 className="text-lg lg:text-xl xl:text-2xl font-bold text-gray-900">Dashboard</h1>
          </div>

          {/* Navigation Links - Centered */}
          <div className="flex items-center gap-2 lg:gap-3 xl:gap-4 flex-1 justify-center">
            <Link
              href="/"
              className={`
                px-3 lg:px-4 xl:px-5 py-2 rounded-lg text-sm lg:text-base font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  pathname === '/'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              For Sale By Owner
            </Link>

            <Link
              href="/trulia-listings"
              className={`
                px-3 lg:px-4 xl:px-5 py-2 rounded-lg text-sm lg:text-base font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  pathname === '/trulia-listings'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              Trulia
            </Link>

            <Link
              href="/redfin-listings"
              className={`
                px-3 lg:px-4 xl:px-5 py-2 rounded-lg text-sm lg:text-base font-medium whitespace-nowrap
                transition-all duration-200
                ${
                  pathname === '/redfin-listings'
                    ? 'bg-red-50 text-red-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              Redfin
            </Link>
          </div>

          {/* Spacer to balance layout */}
          <div className="flex-shrink-0 w-20 lg:w-24 xl:w-28"></div>
        </div>
      </div>
    </nav>
  )
}

