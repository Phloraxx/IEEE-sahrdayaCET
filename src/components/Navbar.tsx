"use client";

import { useState, useEffect, useRef } from "react";
import { type NavItem } from "@/types";
import { motion } from "framer-motion";
import { useLocation, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { LayoutDashboard, LogOut, User, Menu, X } from "lucide-react";
import LoginModal from "./LoginModal";

const navItems: NavItem[] = [
  { label: "HOME", href: "/" },
  { label: "EVENTS", href: "/events" },
  { label: "SOCIETIES", href: "/societies" },
  { label: "EXECOM", href: "/#execom" },
];

export default function Navbar() {
  const [isVisible, setIsVisible] = useState(true);
  const [activeSection, setActiveSection] = useState("/");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const pathname = location.pathname;
  const { user, status, signOut } = useAuth();
  const loading = status === "loading";
  useEffect(() => {
    setActiveSection(pathname || "/");
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close user menu on click outside
  // Close user menu on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowUserMenu(false);
    };
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showUserMenu]);

  useEffect(() => {
    const handleScrollEvent = () => {
      setIsVisible(false);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsVisible(true);
      }, 500);
    };

    window.addEventListener("scroll", handleScrollEvent);
    return () => {
      window.removeEventListener("scroll", handleScrollEvent);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleLogout = () => {
    signOut();
    setShowUserMenu(false);
  };

  return (
    <>
      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden fixed top-4 left-1/2 -translate-x-1/2 z-[101] bg-white/70 backdrop-blur-md border border-white/20 shadow-lg shadow-black/5 rounded-full p-3 text-gray-700 hover:text-gray-900 transition-all"
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{
          y: isVisible ? 0 : -100,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-6 left-0 right-0 z-100 hidden md:flex justify-center pointer-events-none px-4"
      >
        <div className="pointer-events-auto bg-white/70 backdrop-blur-md border border-white/20 shadow-lg shadow-black/5 rounded-full px-2 py-1.5 flex items-center gap-1 max-w-[95vw]">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {/* Nav Links */}
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href.startsWith("/#") &&
                  pathname === "/" &&
                  activeSection.includes(item.href.replace("/#", "")));

              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`relative px-3 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap ${
                    isActive
                      ? "text-gray-900 bg-white shadow-xs"
                      : "text-gray-500 hover:text-blue-600 hover:bg-white/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="w-px h-4 bg-gray-300 mx-1 shrink-0" />

          {/* Auth Section */}
          {!loading &&
            (user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-expanded={showUserMenu}
                  aria-haspopup="true"
                  className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide text-blue-600 hover:bg-white/50 transition-all duration-300 whitespace-nowrap"
                >
                  <User className="w-3 h-3 md:w-4 md:h-4" />
                  <span className="hidden md:inline">
                    {user.name?.split(" ")[0]}
                  </span>
                </button>

                {/* User dropdown */}
                {/* Close on Escape */}
                {showUserMenu && (
                  <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[200px] overflow-hidden z-1000 pointer-events-auto">
                    <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                      <p className="text-sm font-bold text-gray-900">
                        {user.name}
                      </p>
                      <p className="text-[10px] font-mono text-gray-500 truncate mt-0.5">
                        {user.email}
                      </p>
                    </div>
                    {user.role === "admin" && (
                      <>
                        <div className="h-px bg-gray-100" />
                        <Link
                          to="/admin"
                          className="w-full px-4 py-3 text-left text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-3 tracking-wide"
                          onClick={() => setShowUserMenu(false)}
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          Dashboard
                        </Link>
                      </>
                    )}
                    <div className="h-px bg-gray-100" />
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-3 text-left text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3 tracking-wide"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="px-3 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide text-blue-600 hover:bg-blue-50 transition-all duration-300 whitespace-nowrap"
              >
                SIGN IN
              </button>
            ))}
        </div>
      </motion.div>

      {/* Mobile Overlay Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="md:hidden fixed inset-0 z-[100] bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center gap-8 px-8"
          onClick={() => setMobileMenuOpen(false)}
        >
          {/* Nav Links */}
          <nav className="flex flex-col items-center gap-6">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href.startsWith("/#") &&
                  pathname === "/" &&
                  activeSection.includes(item.href.replace("/#", "")));
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-2xl font-bold tracking-wide transition-all ${
                    isActive
                      ? "text-[#00629B]"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth Section */}
          <div className="mt-4">
            {!loading &&
              (user ? (
                <div className="flex flex-col items-center gap-4">
                  <span className="text-gray-900 font-semibold text-lg">{user.name}</span>
                  <div className="flex gap-3">
                    {user.role === "admin" && (
                      <Link
                        to="/admin"
                        onClick={() => setMobileMenuOpen(false)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-[#00629B] text-white rounded-full font-bold text-sm hover:bg-[#004a7c] transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        Dashboard
                      </Link>
                    )}
                    <button
                      onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-full font-bold text-sm hover:bg-red-600 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setIsLoginModalOpen(true); setMobileMenuOpen(false); }}
                  className="px-8 py-3 bg-[#00629B] text-white rounded-full font-bold text-sm hover:bg-[#004a7c] transition-colors"
                >
                  SIGN IN
                </button>
              ))}
          </div>
        </motion.div>
      )}

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </>
  );
}
