import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import type { QueryClient } from '@tanstack/react-query'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster position="top-right" richColors />
    </>
  )
}
