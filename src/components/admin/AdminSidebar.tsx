'use client'

import {
  LayoutDashboard,
  Calendar,
  ClipboardCheck,
  IndianRupee,
  Building2,
  Users,
  QrCode,
  ExternalLink,
  LogOut,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/lib/auth-context'

const navMain = [
  {
    title: 'Overview',
    url: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Events',
    url: '/admin/events',
    icon: Calendar,
  },
  {
    title: 'Check-in',
    url: '/admin/check-in',
    icon: QrCode,
  },
]

function NavItem({
  item,
  isActive,
}: {
  item: (typeof navMain)[number]
  isActive: boolean
}) {
  return (
    <SidebarMenuItem>
      <div className="relative">
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-ieee-blue transition-all duration-200" />
        )}
        <SidebarMenuButton
          isActive={isActive}
          tooltip={item.title}
          render={<Link href={item.url} />}
        >
          <item.icon />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </div>
    </SidebarMenuItem>
  )
}

export function AdminSidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const isChair = user?.role === 'chair'
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/admin" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg p-1">
                <img src="/favicon.svg" alt="IEEE" className="size-full object-contain" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold text-xs tracking-tight">IEEE SAHRDAYA SB</span>
                <span className="text-[10px] text-sidebar-foreground/50">Admin Panel</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1">
        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navMain.map((item) => {
                const isActive =
                  item.url === '/admin'
                    ? pathname === '/admin'
                    : pathname.startsWith(item.url)
                return <NavItem key={item.title} item={item} isActive={isActive} />
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role === 'admin' && (
          <>
            <SidebarSeparator />
            <SidebarGroup className="px-3 py-2">
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Users" render={<Link href="/admin/users" />}>
                      <Users />
                      <span>Users</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Societies" render={<Link href="/admin/societies" />}>
                      <Building2 />
                      <span>Societies</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Payments" render={<Link href="/admin/payments" />}>
                      <IndianRupee />
                      <span>Payments</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          {isChair && (
            <SidebarMenuItem>
              <div className="px-3 py-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-ieee-blue/10 px-2 py-0.5 text-[10px] font-medium text-ieee-blue">
                  <span className="size-1.5 rounded-full bg-ieee-blue" />
                  Chair
                </span>
              </div>
            </SidebarMenuItem>
          )}
          {user && (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="group-data-[collapsible=icon]:size-10!">
                <Avatar className="size-6 rounded-md">
                  <AvatarFallback className="bg-ieee-blue/10 text-[10px] text-ieee-blue font-medium rounded-md">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-0.5 leading-none text-left">
                  <span className="text-xs font-medium truncate max-w-[120px]">{user.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{user.email}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Back to Site" render={<Link href="/" />}>
              <ExternalLink className="size-4" />
              <span>Back to Site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign Out" onClick={signOut}>
              <LogOut className="size-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
