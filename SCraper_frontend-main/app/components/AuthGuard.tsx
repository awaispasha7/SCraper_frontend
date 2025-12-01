'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        // Keep checking state true until we verify auth - this prevents any content from showing
        setCheckingAuth(true)
        
        const supabase = createClient()
        
        // Get session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (!mounted) return
        
        if (error || !session) {
          // Immediately redirect to login if not authenticated - don't wait
          if (pathname !== '/login') {
            // Use replace to prevent back button issues and ensure login shows first
            if (typeof window !== 'undefined') {
              window.location.href = '/login'
            } else {
            router.replace('/login')
            }
          }
          setIsAuthenticated(false)
          if (mounted) {
          setCheckingAuth(false)
          }
          return
        }
        
        // If authenticated and on login page, redirect to dashboard
        // But only if we didn't just log out
        const justLoggedOut = typeof window !== 'undefined' && localStorage.getItem('justLoggedOut') === 'true'
        if (session && pathname === '/login' && !justLoggedOut) {
          // Clear the flag if it exists before redirecting
          if (typeof window !== 'undefined') {
            localStorage.removeItem('justLoggedOut')
          }
          router.replace('/')
          if (mounted) {
            setCheckingAuth(false)
          }
          return
        }
        
        // If we just logged out, clear the flag and stay on login page
        if (justLoggedOut && pathname === '/login') {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('justLoggedOut')
          }
          setIsAuthenticated(false)
          if (mounted) {
            setCheckingAuth(false)
          }
          return
        }
        
        // Only set authenticated and stop checking if we're on a protected page
        if (pathname !== '/login') {
        setIsAuthenticated(true)
          if (mounted) {
            setCheckingAuth(false)
          }
        } else {
          // On login page but authenticated - will redirect above
          if (mounted) {
            setCheckingAuth(false)
          }
        }
      } catch (err) {
        if (!mounted) return
        // Immediately redirect to login on error
        if (pathname !== '/login') {
          router.replace('/login')
        }
        setIsAuthenticated(false)
        if (mounted) {
          setCheckingAuth(false)
        }
      }
    }
    
    // Check auth immediately without any delay to prevent flash
    checkAuth()

    // Listen for auth state changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true)
        setCheckingAuth(false)
        // Only redirect to dashboard if not just logged out
        const justLoggedOut = typeof window !== 'undefined' && localStorage.getItem('justLoggedOut') === 'true'
        if (pathname === '/login' && !justLoggedOut) {
          router.replace('/')
        }
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false)
        setCheckingAuth(false)
        // Set flag to prevent auto-redirect
        if (typeof window !== 'undefined') {
          localStorage.setItem('justLoggedOut', 'true')
        }
        if (pathname !== '/login') {
          router.replace('/login')
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router, pathname])

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-gray-200 border-t-blue-600 mx-auto mb-6"></div>
          <p className="text-gray-900 text-xl font-semibold">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}

