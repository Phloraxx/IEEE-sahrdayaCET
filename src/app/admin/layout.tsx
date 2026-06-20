import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminTopbar } from '@/components/admin/AdminTopbar'
import { Toaster } from '@/components/ui/sonner'
import AdminGuard from '@/components/admin/AdminGuard'
import { AdminKeyboardShortcuts } from '@/components/admin/KeyboardShortcuts'
import { PageTransition } from '@/components/admin/PageTransition'
import { SidebarStateProvider } from '@/components/admin/SidebarState'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminGuard>
      <AdminKeyboardShortcuts />
      <SidebarStateProvider>
        <div className="admin-editorial" style={{ display: 'flex', minHeight: '100vh' }}>
          <AdminSidebar />
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <AdminTopbar />
            <main className="main-content">
              <PageTransition>
                {children}
              </PageTransition>
            </main>
          </div>
        </div>
      </SidebarStateProvider>
      <Toaster />
    </AdminGuard>
  )
}
