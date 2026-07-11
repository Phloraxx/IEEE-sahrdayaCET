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
    <div className="fifa-theme min-h-screen bg-[#0a0a0b] text-[#f5f5f5] flex flex-col">
      <Navbar fifaActive={active} />
      <main className="flex-1 flex flex-col pt-20 md:pt-28">{children}</main>
      <Footer />
    </div>
  )
}