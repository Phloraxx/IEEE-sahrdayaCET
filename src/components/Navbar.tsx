import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "react-router";
import { CalendarDays, LayoutDashboard, LogOut, Menu, User, X } from "lucide-react";
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
    if (!mobileMenuOpen || window.innerWidth >= 768) return;
    const routePath = pathname;
    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousRootOverflow = root.style.overflow;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      Object.assign(body.style, previousBody);
      if (window.location.pathname === routePath) window.scrollTo(0, scrollY);
    };
  }, [mobileMenuOpen, pathname]);

  useEffect(() => {
    const closeDesktopMenu = () => {
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener("resize", closeDesktopMenu);
    return () => window.removeEventListener("resize", closeDesktopMenu);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
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

  const renderAuth = (compact = false) => {
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
          {!compact && <span className="hidden md:inline">{user.name?.split(" ")[0]}</span>}
        </button>
        {showUserMenu && (
          <div className="pointer-events-auto absolute right-0 top-full z-[1000] mt-2 min-w-[200px] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
            <div className="border-b border-gray-50 bg-gray-50/50 px-4 py-3">
              <p className="text-sm font-bold text-gray-900">{user.name}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-gray-500">{user.email}</p>
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

  const linkClass = (active: boolean) =>
    `relative whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-bold tracking-wide transition-all md:px-5 md:text-xs ${
      active ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:bg-white/50 hover:text-blue-600"
    }`;

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`fixed top-4 z-[101] rounded-full border border-white/20 bg-white/70 p-3 text-gray-700 backdrop-blur-md transition-all hover:text-gray-900 md:hidden ${mobileAlign === "right" ? "right-4" : "left-1/2 -translate-x-1/2"}`}
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <motion.div
        initial={reduceMotion ? false : { y: -100, opacity: 0 }}
        animate={{ y: isVisible ? 0 : -100, opacity: isVisible ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none fixed left-0 right-0 top-6 z-[100] hidden justify-center px-4 md:flex"
      >
        <div className="pointer-events-auto flex max-w-[98vw] items-center gap-1 rounded-full border border-white/20 bg-white/70 px-2 py-1.5 shadow-lg shadow-black/5 backdrop-blur-md">
          <nav aria-label="Primary navigation" className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href.startsWith("/#") && pathname === "/" && activeSection.includes(item.href.replace("/#", "")));
              return <Link key={item.label} to={item.href} className={linkClass(isActive)}>{item.label}</Link>;
            })}
          </nav>
          <div className="mx-1 h-4 w-px shrink-0 bg-gray-300" />
          {renderAuth()}
        </div>
      </motion.div>

      {mobileMenuOpen && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-white/95 px-8 backdrop-blur-xl md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav className="flex flex-col items-center gap-5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-xl font-bold tracking-wide transition-all ${isActive ? "text-[#00629B]" : "text-gray-500 hover:text-gray-900"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-2">{renderAuth(true)}</div>
        </motion.div>
      )}

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  );
}
