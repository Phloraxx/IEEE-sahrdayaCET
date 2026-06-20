'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface SidebarState {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  toggleMobile: () => void
}

const SidebarContext = createContext<SidebarState>({
  mobileOpen: false,
  setMobileOpen: () => {},
  toggleMobile: () => {},
})

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleMobile = () => setMobileOpen((prev) => !prev)

  return (
    <SidebarContext.Provider value={{ mobileOpen, setMobileOpen, toggleMobile }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarState() {
  return useContext(SidebarContext)
}
