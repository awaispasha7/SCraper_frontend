'use client'

import { usePathname } from 'next/navigation'
import Navbar from './Navbar'
import AuthGuard from './AuthGuard'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'
  const isHomePage = pathname === '/'

  // No navbar on login or home page
  if (isLoginPage || isHomePage) {
    return <>{children}</>
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="w-full">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}

