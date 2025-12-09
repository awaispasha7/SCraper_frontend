import type { Metadata } from 'next'
import './globals.css'
import ConditionalLayout from './components/ConditionalLayout'

export const metadata: Metadata = {
  title: 'ForSaleByOwner - Dashboard',
  description: 'Property Listings Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ConditionalLayout>
          {children}
        </ConditionalLayout>
      </body>
    </html>
  )
}





