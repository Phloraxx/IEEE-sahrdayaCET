import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "react-router";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  CalendarDays,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
  X,
} from "lucide-react";
import { type NavItem } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { preferredWorkspacePath } from "@/lib/workspace-permissions";
import LoginModal from "./LoginModal";

const navItems: NavItem[] = [
  { label: "HOME", href: "/" },
  { label: "EVENTS", href: "/events" },
  { label: "SOCIETIES", href: "/societies" },
  { label: "BLOG", href: "/blog" },
  { label: "EXECOM", href: "/#execom" },
];

interface NavbarProps {
  mobileAlign?: "center" | "right";
}

export default function Navbar({ mobileAlign = "center" }: NavbarProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const [isVisible, setIsVisible] = useState(true);
  const [activeSection, setActiveSection] = useState("/");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const { user, status, signOut } = useAuth();
  const workspace = useQuery({
    queryKey: ["workspace-me", user?.id],
    queryFn: getWorkspaceMe,
    enabled: status === "authenticated" && Boolean(user?.id),
    staleTime: 30_000,
    retry: 1,
  });
  const loading = status === "loading";

  useEffect(() => {
    setActiveSection(pathname || "/");
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeDesktopMenu = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", closeDesktopMenu);
    return () => window.removeEventListener("resize", closeDesktopMenu);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleScrollEvent = () => {
      setIsVisible(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(true), 500);
    };
    window.addEventListener("scroll", handleScrollEvent, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScrollEvent);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleLogout = () => {
    signOut();
    setShowUserMenu(false);
  };

  const renderAuth = () => {
    if (loading) return null;
    if (!user) {
      return (
        <button
          onClick={() => setIsLoginModalOpen(true)}
          className="min-h-[44px] whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold tracking-wide text-blue-600 transition-all hover:bg-white/50 md:px-5 md:text-xs"
        >
          SIGN IN
        </button>
      );
    }
    return (
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          aria-expanded={showUserMenu}
          aria-haspopup="true"
          className="flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold tracking-wide text-blue-600 transition-all hover:bg-white/50 md:px-4 md:text-xs"
        >
          <User className="h-3 w-3 md:h-4 md:w-4" />
          <span className="hidden md:inline">{user.name?.split(" ")[0]}</span>
        </button>
        {showUserMenu && (
          <div className="pointer-events-auto absolute right-0 top-full z-[1000] mt-2 min-w-[200px] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
            <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-3">
              <p className="text-sm font-bold text-gray-900">{user.name}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-gray-500">
                {user.email}
              </p>
            </div>
            <Link
              to="/my-events"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs font-bold tracking-wide text-blue-600 transition-colors hover:bg-blue-50"
              onClick={() => setShowUserMenu(false)}
            >
              <CalendarDays className="h-4 w-4" />
              My Events
            </Link>
            {workspace.data?.hasWorkspace && (
              <>
                <div className="h-px bg-gray-100" />
                <Link
                  to={preferredWorkspacePath(workspace.data)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs font-bold tracking-wide text-blue-600 transition-colors hover:bg-blue-50"
                  onClick={() => setShowUserMenu(false)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  IEEE Workspace
                </Link>
              </>
            )}
            <div className="h-px bg-gray-100" />
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs font-bold tracking-wide text-red-500 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    );
  };

  const isNavItemActive = (item: NavItem) => {
    if (item.href.startsWith("/#")) {
      return (
        pathname === "/" && activeSection.includes(item.href.replace("/#", ""))
      );
    }
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const linkClass = (active: boolean) =>
    `relative whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold tracking-wide transition-all md:px-5 md:text-xs ${
      active
        ? "bg-white text-gray-900 shadow-xs"
        : "text-gray-500 hover:bg-white/50 hover:text-blue-600"
    }`;

  return (
    <>
      <DialogPrimitive.Root
        open={mobileMenuOpen}
        onOpenChange={(open) => {
          setMobileMenuOpen(open);
          if (open) setShowUserMenu(false);
        }}
      >
        <DialogPrimitive.Trigger asChild>
          <button
            className={`fixed top-3 z-[101] inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-white/[0.82] px-3.5 text-[11px] font-bold uppercase tracking-[0.13em] text-[#17202b] shadow-lg shadow-black/5 backdrop-blur-xl transition-all md:hidden ${mobileMenuOpen ? "pointer-events-none scale-95 opacity-0" : "opacity-100"} ${mobileAlign === "right" ? "right-3" : "left-1/2 -translate-x-1/2"}`}
            aria-label="Open menu"
            aria-controls="mobile-site-navigation"
          >
            <Menu className="h-4 w-4" />
            <span>Menu</span>
          </button>
        </DialogPrimitive.Trigger>

        <motion.div
          initial={reduceMotion ? false : { y: -100, opacity: 0 }}
          animate={{ y: isVisible ? 0 : -100, opacity: isVisible ? 1 : 0 }}
          transition={{
            duration: reduceMotion ? 0 : 0.5,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="pointer-events-none fixed left-0 right-0 top-6 z-[100] hidden justify-center px-4 md:flex"
        >
          <div className="pointer-events-auto flex max-w-[98vw] items-center gap-1 rounded-full border border-white/20 bg-white/70 px-2 py-1.5 shadow-lg shadow-black/5 backdrop-blur-md">
            <nav
              aria-label="Primary navigation"
              className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar"
            >
              {navItems.map((item) => {
                const isActive = isNavItemActive(item);
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    className={linkClass(isActive)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mx-1 h-4 w-px shrink-0 bg-gray-300" />
            {renderAuth()}
          </div>
        </motion.div>

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-[#06111d]/35 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none md:hidden" />
          <DialogPrimitive.Content
            id="mobile-site-navigation"
            className="fixed inset-x-3 top-3 z-[102] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[28px] border border-black/10 bg-white/[0.96] shadow-2xl shadow-black/20 backdrop-blur-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-3 motion-reduce:animate-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">
              Site navigation
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Navigate the IEEE Sahrdaya website and account areas.
            </DialogPrimitive.Description>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.08] bg-white/90 px-4 py-3 backdrop-blur-xl">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-w-0 items-center gap-3 rounded-xl pr-3"
              >
                <img
                  src="/emblem.png"
                  alt=""
                  aria-hidden="true"
                  className="h-9 w-9 shrink-0 object-contain"
                />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[13px] font-bold tracking-[-0.01em] text-[#111315]">
                    IEEE Sahrdaya
                  </p>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/40">
                    Student Branch
                  </p>
                </div>
              </Link>
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.045] text-[#17202b] transition-colors hover:bg-black/[0.08]"
                  aria-label="Close menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </DialogPrimitive.Close>
            </div>

            <div className="px-3 pb-4 pt-3">
              <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
                Explore
              </p>
              <nav
                className="grid gap-1"
                aria-label="Mobile primary navigation"
              >
                {navItems.map((item, index) => {
                  const isActive = isNavItemActive(item);
                  return (
                    <Link
                      key={item.label}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={`group flex min-h-[54px] items-center gap-3 rounded-2xl px-4 transition-colors ${isActive ? "bg-[#00629B] text-white" : "text-[#1e2732] hover:bg-black/[0.045]"}`}
                    >
                      <span
                        className={`w-5 font-mono text-[9px] ${isActive ? "text-white/55" : "text-black/30"}`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 text-sm font-bold tracking-[0.06em]">
                        {item.label}
                      </span>
                      {isActive ? (
                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/70">
                          Here
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-black/25 transition-transform group-hover:translate-x-0.5" />
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-3 border-t border-black/[0.08] pt-3">
                <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-black/35">
                  Account
                </p>
                {loading ? (
                  <div className="mx-1 h-12 animate-pulse rounded-2xl bg-black/[0.04]" />
                ) : !user ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setIsLoginModalOpen(true);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-between rounded-2xl bg-[#e9f6fc] px-4 text-left text-sm font-bold text-[#00629B] transition-colors hover:bg-[#dff1fa]"
                  >
                    <span className="flex items-center gap-3">
                      <User className="h-4 w-4" />
                      Sign in
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <div className="space-y-1">
                    <div className="mb-2 rounded-2xl bg-black/[0.035] px-4 py-3">
                      <p className="truncate text-sm font-bold text-[#111315]">
                        {user.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-black/45">
                        {user.email}
                      </p>
                    </div>
                    <Link
                      to="/my-events"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-[50px] items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-[#1e2732] hover:bg-black/[0.045]"
                    >
                      <CalendarDays className="h-4 w-4 text-[#00629B]" />
                      <span className="flex-1">My Events</span>
                      <ChevronRight className="h-4 w-4 text-black/25" />
                    </Link>
                    {workspace.data?.hasWorkspace && (
                      <Link
                        to={preferredWorkspacePath(workspace.data)}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex min-h-[50px] items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-[#1e2732] hover:bg-black/[0.045]"
                      >
                        <LayoutDashboard className="h-4 w-4 text-[#00629B]" />
                        <span className="flex-1">IEEE Workspace</span>
                        <ChevronRight className="h-4 w-4 text-black/25" />
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex min-h-[50px] w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </>
  );
}
