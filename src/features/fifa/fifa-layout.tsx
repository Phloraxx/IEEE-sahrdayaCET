import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import type { FifaNavKey } from '@/features/fifa/fifa-nav'

export function FifaLayout({
  active,
  children,
}: {
  active: FifaNavKey
  children: React.ReactNode
}) {
  return (
    <div className="fifa-theme min-h-screen bg-[#0a0a0b] text-[#f5f5f5]">
      <Navbar fifaActive={active} />
      <main>{children}</main>
      <Footer />
    </div>
  )
}