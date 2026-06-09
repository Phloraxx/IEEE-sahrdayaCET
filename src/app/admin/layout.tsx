import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Toaster } from '@/components/ui/sonner'
import AdminGuard from '@/components/admin/AdminGuard'
import { AdminKeyboardShortcuts } from '@/components/admin/KeyboardShortcuts'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminGuard>
      <TooltipProvider>
        <SidebarProvider defaultOpen={true}>
          <AdminKeyboardShortcuts />
          <AdminSidebar />
          <main className="flex-1">
            <div className="admin-glass flex items-center gap-2 px-4 py-2.5">
              <SidebarTrigger />
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono tracking-wider">
                <span className="text-ieee-blue font-medium">IEEE</span>
                <span className="text-muted-foreground/30">/</span>
                <span className="text-muted-foreground/70">admin</span>
              </div>
              <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground/40">
                <kbd className="rounded border border-border/50 px-1.5 py-0.5 font-mono">/</kbd>
                <span>search</span>
                <kbd className="rounded border border-border/50 px-1.5 py-0.5 font-mono ml-1">N</kbd>
                <span>new event</span>
              </div>
            </div>
            <div className="p-6">
              {children}
            </div>
          </main>
          <Toaster />
        </SidebarProvider>
      </TooltipProvider>
    </AdminGuard>
  )
}
