'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [adminName, setAdminName] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch user email from Supabase
  useEffect(() => {
    const fetchUserEmail = async () => {
      try {
        const { createClient } = await import('@/lib/supabase-client')
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user?.email) {
          const email = session.user.email
          setUserEmail(email)
          
          // Check if user is admin (Omar Bucio Brivano)
          const adminEmail = 'omarbuciofgr@gmail.com'
          if (email.toLowerCase() === adminEmail.toLowerCase()) {
            setAdminName('Omar Bucio Brivano')
          }
        }
      } catch (error) {
        console.error('Error fetching user email:', error)
      }
    }
    fetchUserEmail()
  }, [])

  // Handle logout
  const handleLogout = async () => {
    try {
      const { createClient } = await import('@/lib/supabase-client')
      const supabase = createClient()

      // Set flag to prevent auto-redirect on login page
      localStorage.setItem('justLoggedOut', 'true')

      // Sign out from Supabase
      await supabase.auth.signOut()

      // Clear all auth-related data
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')

      // Wait a moment to ensure session is cleared
      await new Promise(resolve => setTimeout(resolve, 200))

      // Redirect to login page
      window.location.href = '/login'
    } catch (err) {
      // Still redirect even if logout fails
      localStorage.setItem('justLoggedOut', 'true')
      localStorage.removeItem('isAuthenticated')
      localStorage.removeItem('userEmail')
      window.location.href = '/login'
    }
  }

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

  // Mapping of paths to page names for header display
  const pageNames: Record<string, string> = {
    '/fsbo': 'FSBO',
    '/trulia-listings': 'Trulia',
    '/redfin-listings': 'Redfin',
    '/zillow-fsbo': 'Zillow FSBO',
    '/zillow-frbo': 'Zillow FRBO',
    '/hotpads': 'Hotpads',
    '/apartments': 'Apartments',
    '/all-listings': 'All Listings',
    '/enrichment-log': 'Enrichment Activity Log',
    '/owner-info': 'Owner Information',
    '/': 'Dashboard',
  }

  // Get the page name for current path, or default to 'Dashboard'
  const pageTitle = pageNames[currentPath] || 'Dashboard'
  const isDashboard = currentPath === '/'

  const navLinks = [
    { href: '/', label: 'Dashboard', activeColor: 'bg-blue-600' },
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

            {/* Page Title - Centered (static on listing pages, link on dashboard) */}
            {isDashboard ? (
              <Link href="/" className="text-lg sm:text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
                {pageTitle}
              </Link>
            ) : (
              <span className="text-lg sm:text-xl font-bold text-gray-900">
                {pageTitle}
              </span>
            )}

            {/* Spacer for balance */}
            <div className="w-10 h-10"></div>
          </div>

          {/* Desktop Layout - Horizontal (1024px+) */}
          <div className="hidden lg:flex items-center h-16 lg:h-20">
            {/* Logo/Brand */}
            <div className="flex items-center flex-shrink-0 mr-4 lg:mr-6 xl:mr-8">
              {isDashboard ? (
                <Link href="/" className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
                  {pageTitle}
                </Link>
              ) : (
                <span className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-900">
                  {pageTitle}
                </span>
              )}
            </div>

            {/* Navigation Links - Centered */}
            <div className="flex items-center gap-1.5 lg:gap-2 xl:gap-3 flex-1 justify-center">
              {navLinks
                .filter((link) => link.href !== currentPath)
                .map((link) => {
                  const isDashboardLink = link.href === '/'
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`
                        px-2.5 lg:px-3.5 xl:px-5 py-2 rounded-lg text-xs lg:text-sm xl:text-base font-semibold whitespace-nowrap
                        transition-all duration-200
                        ${isDashboardLink
                          ? 'text-gray-900 hover:bg-blue-50 bg-blue-50/50 border-2 border-blue-200 font-bold'
                          : 'text-gray-700 hover:bg-gray-100 bg-gray-50'
                        }
                      `}
                    >
                      {link.label}
                    </Link>
                  )
                })}
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
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 flex-shrink-0">
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

            {/* Navigation Links - Scrollable */}
            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-2">
              {navLinks
                .filter((link) => link.href !== currentPath)
                .map((link) => {
                  const isDashboardLink = link.href === '/'
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsMenuOpen(false)}
                      className={`
                        flex items-center px-4 py-3 rounded-xl text-base font-semibold
                        transition-all duration-200
                        ${isDashboardLink
                          ? 'text-gray-900 hover:bg-blue-50 active:bg-blue-100 border-2 border-blue-200 bg-blue-50/50'
                          : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                        }
                        ${isDashboardLink ? 'font-bold' : ''}
                      `}
                    >
                      {isDashboardLink && (
                        <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      )}
                      {link.label}
                    </Link>
                  )
                })}
            </div>

              {/* User Info and Logout - Fixed at Bottom */}
            {userEmail && (
              <div className="border-t border-gray-200 px-4 py-4 bg-gray-50 flex-shrink-0">
                <div className="px-4 py-3 bg-white rounded-lg border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-[10px] sm:text-xs text-gray-500 font-medium mb-0.5">Signed in as</p>
                      {adminName ? (
                        <p className="text-[9px] sm:text-xs text-blue-700 font-semibold truncate whitespace-nowrap">
                          {adminName}
                        </p>
                      ) : (
                        <p className="text-[9px] sm:text-xs text-gray-900 font-medium truncate whitespace-nowrap">
                          {userEmail}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false)
                      handleLogout()
                    }}
                    className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 font-medium text-sm whitespace-nowrap"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

