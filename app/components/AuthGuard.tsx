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
        const supabase = createClient()
        
        // Get session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (!mounted) return
        
        if (error || !session) {
          // Only redirect if not already on login page
          if (pathname !== '/login') {
            router.replace('/login')
          }
          setIsAuthenticated(false)
          setCheckingAuth(false)
          return
        }
        
        // If authenticated and on login page, redirect to dashboard
        if (session && pathname === '/login') {
          router.replace('/')
          return
        }
        
        setIsAuthenticated(true)
      } catch (err) {
        if (!mounted) return
        // Only redirect if not already on login page
        if (pathname !== '/login') {
          router.push('/login')
        }
        setIsAuthenticated(false)
      } finally {
        if (mounted) {
          setCheckingAuth(false)
        }
      }
    }
    
    checkAuth()

    // Listen for auth state changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true)
        // Only redirect to dashboard if not just logged out
        const justLoggedOut = typeof window !== 'undefined' && localStorage.getItem('justLoggedOut') === 'true'
        if (pathname === '/login' && !justLoggedOut) {
          router.replace('/')
        }
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false)
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

