'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // Check if already logged in using Supabase client
    const checkAuth = async () => {
      try {
        // Check if we just logged out (from localStorage flag)
        const justLoggedOut = localStorage.getItem('justLoggedOut') === 'true'
        if (justLoggedOut) {
          // Clear the flag and stay on login page - don't redirect
          localStorage.removeItem('justLoggedOut')
          // Clear any existing session to prevent auto-redirect
          const supabase = createClient()
          await supabase.auth.signOut()
          return
        }
        
        // Wait a bit before checking to ensure page is ready
        await new Promise(resolve => setTimeout(resolve, 300))
        
        const supabase = createClient()
        const { data: { session }, error } = await supabase.auth.getSession()
        
        // Only redirect if we have a valid session AND we didn't just log out
        // Add additional check to ensure we're not in a logout state
        const stillLoggedOut = localStorage.getItem('justLoggedOut') === 'true'
        if (!error && session && session.user && !stillLoggedOut) {
          // Redirect to dashboard if authenticated
          router.replace('/')
        }
      } catch (err) {
        // Not logged in, stay on login page
        console.error('Auth check error:', err)
      }
    }
    
    // Delay check to allow login page to render first
    const timeout = setTimeout(checkAuth, 100)
    return () => clearTimeout(timeout)
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // Sign in with Supabase Auth
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password: password,
      })

      if (authError) {
        throw new Error(authError.message || 'Invalid email or password')
      }

      if (!data.user || !data.session) {
        throw new Error('Login failed. Please try again.')
      }

      // Wait a moment for session to be fully established
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Verify session is set
      const { data: { session: verifySession } } = await supabase.auth.getSession()
      if (!verifySession) {
        throw new Error('Session not established. Please try again.')
      }

      // Check if user is admin (Omar Bucio Brivano)
      const adminEmail = 'omarbuciofgr@gmail.com'
      const isAdmin = data.user.email?.toLowerCase() === adminEmail.toLowerCase()
      
      // Show success message
      setSuccess(true)
      setError(null)
      
      // Set flag to show welcome message on dashboard
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('showWelcomeMessage', 'true')
        if (isAdmin) {
          sessionStorage.setItem('adminName', 'Omar Bucio Brivano')
        }
      }
      
      // Wait 1.5 seconds to show welcome message, then redirect
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Successfully logged in - redirect to dashboard using replace
      router.replace('/')
    } catch (err: any) {
      console.error('Login error:', err)
      const errorMessage = err.message || 'Login failed. Please check your credentials.'
      setError(errorMessage)
      
      // If it's a network error, suggest checking connection
      if (err.message?.includes('fetch') || err.message?.includes('network')) {
        setError('Network error. Please check your connection and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 sm:px-8 py-8 sm:py-10 text-center border-b border-gray-200">
            <div className="bg-white rounded-full w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-md">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Dashboard Login</h1>
            <p className="text-gray-600 text-sm sm:text-base">Please sign in to access your account</p>
          </div>

          {/* Success Toast Notification with Welcome Message */}
          {success && (
            <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top fade-in">
              <div className="bg-white rounded-lg shadow-lg border border-green-200 p-4 sm:p-5 max-w-sm w-full">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="h-6 w-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 mb-1">Login successful!</p>
                    {email.toLowerCase() === 'omarbuciofgr@gmail.com' && (
                      <p className="text-sm text-gray-700 font-medium">
                        Welcome back, <span className="text-blue-600 font-bold">Omar Bucio Brivano</span>!
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <div className="px-6 sm:px-8 py-6 sm:py-8 bg-white">
            {error && !success && (
              <div className="mb-5 bg-red-50 border-l-4 border-red-500 rounded-lg p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L10 9.586a1 1 0 00-1.414-1.414L8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-red-700 text-sm sm:text-base font-medium flex-1">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 placeholder-gray-400 bg-white text-sm sm:text-base"
                    placeholder="Enter your email"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-900 placeholder-gray-400 bg-white text-sm sm:text-base"
                    placeholder="Enter your password"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 sm:py-3.5 rounded-lg font-semibold hover:bg-blue-700 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Logging in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-6 sm:px-8 py-4 bg-gray-50 border-t border-gray-200 text-center">
            <p className="text-xs sm:text-sm text-gray-500">
              Private Dashboard - Authorized Access Only
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

