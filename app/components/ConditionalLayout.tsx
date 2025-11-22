'use client'

import { usePathname } from 'next/navigation'
import Navbar from './Navbar'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="w-full">
        {children}
      </main>
    </div>
  )
}

