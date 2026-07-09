"use client";

import { useState, useEffect, useRef } from "react";
import { type NavItem } from "@/types";
import { motion } from "framer-motion";
import { useLocation, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { LayoutDashboard, LogOut, User, Menu, X, ChevronDown } from "lucide-react";
import LoginModal from "./LoginModal";
import {
  FIFA_NAV_ITEMS,
  isFifaHomePath,
  isFifaPath,
  type FifaNavKey,
} from "@/features/fifa/fifa-nav";

const navItems: NavItem[] = [
  { label: "HOME", href: "/" },
  { label: "EVENTS", href: "/events" },
  { label: "SOCIETIES", href: "/societies" },
  { label: "BLOG", href: "/blog" },
  { label: "EXECOM", href: "/#execom" },
];

interface NavbarProps {
  fifaActive?: FifaNavKey;
}

export default function Navbar({ fifaActive }: NavbarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [activeSection, setActiveSection] = useState("/");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFifaDrop, setShowFifaDrop] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const fifaDropRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const pathname = location.pathname;
  const { user, status, signOut } = useAuth();
  const loading = status === "loading";

  const inFifa = isFifaPath(pathname);
  const fifaHome = isFifaHomePath(pathname);
  const transparentFifaNav = inFifa && fifaHome && !scrolled;

  useEffect(() => {
    setActiveSection(pathname || "/");
    setMobileMenuOpen(false);
    setShowFifaDrop(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (fifaDropRef.current && !fifaDropRef.current.contains(e.target as Node)) {
        setShowFifaDrop(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowUserMenu(false);
        setShowFifaDrop(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handleScrollEvent = () => {
      setIsVisible(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(true), 500);
    };
    window.addEventListener("scroll", handleScrollEvent);
    return () => {
      window.removeEventListener("scroll", handleScrollEvent);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleLogout = () => {
    signOut();
    setShowUserMenu(false);
  };

  const pillClass = inFifa
    ? transparentFifaNav
      ? "bg-black/25 backdrop-blur-xl border-white/12 text-white shadow-lg shadow-black/20"
      : "bg-black/70 backdrop-blur-xl border-white/12 text-white shadow-lg shadow-black/30"
    : "bg-white/70 backdrop-blur-md border-white/20 shadow-lg shadow-black/5";

  const mobileBtnClass = inFifa
    ? transparentFifaNav
      ? "bg-black/40 backdrop-blur-xl border-white/15 text-white"
      : "bg-black/70 backdrop-blur-xl border-white/15 text-white"
    : "bg-white/70 backdrop-blur-md border-white/20 text-gray-700 hover:text-gray-900";

  const fifaLinkClass = (active: boolean) =>
    `relative px-2.5 md:px-3 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap min-h-[44px] flex items-center ${
      active
        ? inFifa
          ? "text-white bg-ieee-blue shadow-xs"
          : "text-gray-900 bg-white shadow-xs"
        : inFifa
          ? "text-white/70 hover:text-white hover:bg-white/10"
          : "text-gray-500 hover:text-blue-600 hover:bg-white/50"
    }`;

  const mainLinkClass = (active: boolean) =>
    `relative px-3 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap ${
      active
        ? "text-gray-900 bg-white shadow-xs"
        : "text-gray-500 hover:text-blue-600 hover:bg-white/50"
    }`;

  const authBtnClass = inFifa
    ? "text-ieee-light-blue hover:bg-white/10"
    : "text-blue-600 hover:bg-white/50";

  const renderAuth = (compact = false) => {
    if (loading) return null;
    if (user) {
      return (
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-expanded={showUserMenu}
            aria-haspopup="true"
            className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap ${authBtnClass}`}
          >
            <User className="w-3 h-3 md:w-4 md:h-4" />
            {!compact && <span className="hidden md:inline">{user.name?.split(" ")[0]}</span>}
          </button>
          {showUserMenu && (
            <div
              className={`absolute top-full right-0 mt-2 rounded-xl shadow-xl min-w-[200px] overflow-hidden z-1000 pointer-events-auto ${
                inFifa
                  ? "bg-[#131519] border border-white/10 text-[#f5f5f5]"
                  : "bg-white border border-gray-100"
              }`}
            >
              <div
                className={`px-4 py-3 border-b ${
                  inFifa ? "border-white/10 bg-white/5" : "border-gray-50 bg-gray-50/50"
                }`}
              >
                <p className={`text-sm font-bold ${inFifa ? "text-white" : "text-gray-900"}`}>
                  {user.name}
                </p>
                <p className="text-[10px] font-mono text-gray-500 truncate mt-0.5">{user.email}</p>
              </div>
              {inFifa && (
                <>
                  <Link
                    to="/FIFA/dashboard/"
                    className="w-full px-4 py-3 text-left text-xs font-bold text-ieee-light-blue hover:bg-white/5 transition-colors flex items-center gap-3 tracking-wide"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    FIFA Dashboard
                  </Link>
                  <div className={`h-px ${inFifa ? "bg-white/10" : "bg-gray-100"}`} />
                </>
              )}
              <Link
                to="/admin/dashboard"
                className={`w-full px-4 py-3 text-left text-xs font-bold transition-colors flex items-center gap-3 tracking-wide ${
                  inFifa
                    ? "text-ieee-light-blue hover:bg-white/5"
                    : "text-blue-600 hover:bg-blue-50"
                }`}
                onClick={() => setShowUserMenu(false)}
              >
                <LayoutDashboard className="w-4 h-4" />
                Admin
              </Link>
              <div className={`h-px ${inFifa ? "bg-white/10" : "bg-gray-100"}`} />
              <button
                onClick={handleLogout}
                className="w-full px-4 py-3 text-left text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors flex items-center gap-3 tracking-wide"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      );
    }
    return (
      <button
        onClick={() => setIsLoginModalOpen(true)}
        className={`px-3 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap min-h-[44px] ${authBtnClass}`}
      >
        SIGN IN
      </button>
    );
  };

  return (
    <>
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`md:hidden fixed top-4 left-1/2 -translate-x-1/2 z-[101] rounded-full p-3 transition-all ${mobileBtnClass}`}
        aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: isVisible ? 0 : -100, opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fixed top-6 left-0 right-0 z-[100] hidden md:flex justify-center pointer-events-none px-4"
      >
        <div
          className={`pointer-events-auto rounded-full px-2 py-1.5 flex items-center gap-1 max-w-[98vw] border transition-colors duration-300 ${pillClass}`}
        >
          {inFifa ? (
            <>
              <Link
                to="/"
                className="px-2.5 py-2 rounded-full text-[10px] font-bold tracking-wide text-white/60 hover:text-white hover:bg-white/10 transition-all whitespace-nowrap"
              >
                IEEE ←
              </Link>
              <div className="w-px h-4 bg-white/15 mx-0.5 shrink-0" />
              <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                {FIFA_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.key}
                    to={item.to}
                    className={fifaLinkClass(fifaActive === item.key)}
                  >
                    {item.label}
                  </Link>
                ))}
                {user && (
                  <Link
                    to="/FIFA/dashboard/"
                    className={fifaLinkClass(fifaActive === "dashboard")}
                  >
                    Dashboard
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href.startsWith("/#") &&
                    pathname === "/" &&
                    activeSection.includes(item.href.replace("/#", "")));
                return (
                  <Link key={item.label} to={item.href} className={mainLinkClass(isActive)}>
                    {item.label}
                  </Link>
                );
              })}
              <div className="relative" ref={fifaDropRef}>
                <button
                  type="button"
                  onClick={() => setShowFifaDrop(!showFifaDrop)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all whitespace-nowrap ${
                    isFifaPath(pathname)
                      ? "text-gray-900 bg-white shadow-xs"
                      : "text-ieee-blue hover:bg-ieee-blue/10"
                  }`}
                >
                  WC PREDICT &apos;26
                  <ChevronDown
                    className={`w-3 h-3 transition-transform ${showFifaDrop ? "rotate-180" : ""}`}
                  />
                </button>
                {showFifaDrop && (
                  <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[180px] overflow-hidden z-1000">
                    {FIFA_NAV_ITEMS.map((item) => (
                      <Link
                        key={item.key}
                        to={item.to}
                        onClick={() => setShowFifaDrop(false)}
                        className="block px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-ieee-blue/5 hover:text-ieee-blue transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                    {user && (
                      <Link
                        to="/FIFA/dashboard/"
                        onClick={() => setShowFifaDrop(false)}
                        className="block px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-ieee-blue/5 hover:text-ieee-blue transition-colors border-t border-gray-100"
                      >
                        Dashboard
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={`w-px h-4 mx-1 shrink-0 ${inFifa ? "bg-white/15" : "bg-gray-300"}`} />
          {renderAuth()}
        </div>
      </motion.div>

      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`md:hidden fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 px-8 ${
            inFifa ? "bg-[#0a0a0b]/95 backdrop-blur-xl text-white" : "bg-white/95 backdrop-blur-xl"
          }`}
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav className="flex flex-col items-center gap-5">
            {inFifa && (
              <>
                <p className="text-[10px] font-mono tracking-[0.2em] text-ieee-light-blue uppercase mb-1">
                  WC Predict &apos;26
                </p>
                {FIFA_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-xl font-bold tracking-wide transition-all ${
                      fifaActive === item.key ? "text-ieee-light-blue" : "text-white/60 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
                {user && (
                  <Link
                    to="/FIFA/dashboard/"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-xl font-bold tracking-wide ${
                      fifaActive === "dashboard" ? "text-ieee-light-blue" : "text-white/60"
                    }`}
                  >
                    Dashboard
                  </Link>
                )}
                <div className="w-16 h-px bg-white/15 my-2" />
                <p className="text-[10px] font-mono tracking-[0.2em] text-white/40 uppercase">
                  IEEE Sahrdaya
                </p>
              </>
            )}
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-xl font-bold tracking-wide transition-all ${
                    inFifa
                      ? isActive
                        ? "text-ieee-light-blue"
                        : "text-white/50 hover:text-white"
                      : isActive
                        ? "text-[#00629B]"
                        : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {!inFifa && (
              <>
                <div className="w-16 h-px bg-gray-200 my-1" />
                <p className="text-[10px] font-mono tracking-[0.2em] text-ieee-blue uppercase">
                  WC Predict &apos;26
                </p>
                {FIFA_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.key}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-lg font-semibold text-gray-500 hover:text-[#00629B]"
                  >
                    {item.label}
                  </Link>
                ))}
              </>
            )}
          </nav>
          <div className="mt-2">{renderAuth(true)}</div>
        </motion.div>
      )}

      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  );
}