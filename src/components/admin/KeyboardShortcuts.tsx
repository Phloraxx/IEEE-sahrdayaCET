'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function AdminKeyboardShortcuts() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

      switch (e.key) {
        case '/':
          e.preventDefault()
          const searchInput = document.querySelector<HTMLInputElement>('input[type="text"][placeholder*="Search"]')
          if (searchInput) searchInput.focus()
          break
        case 'n':
          if (pathname.startsWith('/admin/events')) {
            e.preventDefault()
            router.push('/admin/events/new')
          }
          break
        case 'Escape':
          // Close any open dialogs — the dialog libraries handle this natively
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [router, pathname])

  return null
}
