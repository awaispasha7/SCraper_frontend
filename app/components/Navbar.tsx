'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Close menu when route changes
  useEffect(() => {
    setIsMenuOpen(false)
  }, [pathname])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMenuOpen])

  // Use pathname or fallback to empty string to prevent hydration issues
  const currentPath = mounted ? pathname : ''

  const navLinks = [
    { href: '/fsbo', label: 'FSBO', activeColor: 'bg-blue-600' },
    { href: '/trulia-listings', label: 'Trulia', activeColor: 'bg-blue-600' },
    { href: '/redfin-listings', label: 'Redfin', activeColor: 'bg-red-600' },
    { href: '/zillow-fsbo', label: 'Zillow FSBO', activeColor: 'bg-purple-600' },
    { href: '/zillow-frbo', label: 'Zillow FRBO', activeColor: 'bg-indigo-600' },
    { href: '/hotpads', label: 'Hotpads', activeColor: 'bg-teal-600' },
    { href: '/apartments', label: 'Apartments', activeColor: 'bg-cyan-600' },
    { href: '/all-listings', label: 'All Listings', activeColor: 'bg-blue-600' },
  ]

  return (
    <>
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
          {/* Mobile/Tablet Layout - Hamburger + Dashboard Title (up to 1024px) */}
          <div className="flex lg:hidden items-center justify-between h-14 sm:h-16">
            {/* Hamburger Button */}
            <button
              onClick={() => setIsMenuOpen(true)}
              className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Dashboard Title - Centered */}
            <Link href="/" className="text-lg sm:text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
              Dashboard
            </Link>

            {/* Spacer for balance */}
            <div className="w-10 h-10"></div>
          </div>

          {/* Desktop Layout - Horizontal (1024px+) */}
          <div className="hidden lg:flex items-center h-16 lg:h-20">
            {/* Logo/Brand */}
            <div className="flex items-center flex-shrink-0 mr-4 lg:mr-6 xl:mr-8">
              <Link href="/" className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
                Dashboard
              </Link>
            </div>

            {/* Navigation Links - Centered */}
            <div className="flex items-center gap-1.5 lg:gap-2 xl:gap-3 flex-1 justify-center">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`
                    px-2.5 lg:px-3.5 xl:px-5 py-2 rounded-lg text-xs lg:text-sm xl:text-base font-semibold whitespace-nowrap
                    transition-all duration-200
                    ${currentPath === link.href
                      ? `${link.activeColor} text-white shadow-md`
                      : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                    }
                  `}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Spacer to balance layout */}
            <div className="flex-shrink-0 w-16 lg:w-20 xl:w-24"></div>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Sidebar */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl transform transition-transform duration-300 ease-out">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Scrapers</h2>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 active:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Navigation Links */}
            <div className="py-4 px-3 space-y-2 overflow-y-auto max-h-[calc(100vh-80px)]">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`
                    flex items-center px-4 py-3 rounded-xl text-base font-semibold
                    transition-all duration-200
                    ${currentPath === link.href
                      ? `${link.activeColor} text-white shadow-md`
                      : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                    }
                  `}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

