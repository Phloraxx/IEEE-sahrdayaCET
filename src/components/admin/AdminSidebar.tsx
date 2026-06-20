'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useSidebarState } from './SidebarState'

/* ── Inline SVG icons matching the prototype exactly ── */
const Icons = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  checkin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><polyline points="9 12 11 14 15 10" />
    </svg>
  ),
  registrations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  payments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  societies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  execom: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><line x1="12" y1="11" x2="12" y2="15" /><line x1="10" y1="13" x2="14" y2="13" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { section: 'Navigation', items: [
    { title: 'Overview', url: '/admin', icon: Icons.overview },
    { title: 'Events', url: '/admin/events', icon: Icons.events },
    { title: 'Check-in', url: '/admin/check-in', icon: Icons.checkin },
  ]},
  { section: 'Administration', adminOnly: true, items: [
    { title: 'Registrations', url: '/admin/registrations', icon: Icons.registrations },
    { title: 'Payments', url: '/admin/payments', icon: Icons.payments },
    { title: 'Societies', url: '/admin/societies', icon: Icons.societies },
    { title: 'Execom', url: '/admin/execom', icon: Icons.execom },
    { title: 'Users', url: '/admin/users', icon: Icons.users },
  ]},
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { mobileOpen, setMobileOpen, toggleMobile } = useSidebarState()
  const [collapsed, setCollapsed] = useState(false)

  const isActive = (url: string) =>
    url === '/admin' ? pathname === '/admin' : pathname.startsWith(url)

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      toggleMobile()
    } else {
      setCollapsed((prev) => !prev)
    }
  }

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="sidebar-overlay open"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' open' : ''}`}
      >
        {/* ── Brand Header ── */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <img src="/favicon.svg" alt="IEEE" width="22" height="22" style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">IEEE SAHRDAYA</span>
              <span className="sidebar-brand-sub">Student Branch</span>
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((group) => {
            if (group.adminOnly && user?.role !== 'admin') return null
            return (
              <div key={group.section} className="sidebar-section">
                <div className="sidebar-section-label">{group.section}</div>
                {group.items.map((item) => {
                  const active = isActive(item.url)
                  return (
                    <Link
                      key={item.title}
                      href={item.url}
                      title={item.title}
                      className={`sidebar-item${active ? ' active' : ''}`}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* ── Footer: User + Links ── */}
        <div className="sidebar-footer">
          {/* Chair badge */}
          {user?.role === 'chair' && (
            <div style={{ padding: '0 0.5rem 0.5rem' }}>
              <span className="sidebar-badge" style={{ display: collapsed ? 'none' : 'inline-block' }}>
                Chair
              </span>
            </div>
          )}

          {/* User info */}
          {user && (
            <div className="sidebar-user">
              <div className="sidebar-avatar">{initials}</div>
              <div className="sidebar-user-info sidebar-footer-text">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-role">{user.role}</div>
              </div>
            </div>
          )}

          {/* Back to Site */}
          <Link
            href="/"
            title="Back to Site"
            className="sidebar-item"
            style={{ marginTop: '0.25rem' }}
          >
            <ExternalLink className="size-4" />
            <span>Back to Site</span>
          </Link>

          {/* Sign Out */}
          <button
            onClick={signOut}
            title="Sign Out"
            className="sidebar-item"
            style={{ width: '100%' }}
          >
            <LogOut className="size-4" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* ── Collapse toggle ── */}
        <div className="sidebar-toggle" onClick={toggleSidebar} title="Toggle sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </div>
      </aside>
    </>
  )
}
