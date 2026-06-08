'use client';

import { useState, useEffect, useRef } from 'react';
import { NavItem } from '@/types';
import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';
import LoginModal from './LoginModal';

const navItems: NavItem[] = [
    { label: 'HOME', href: '/' },
    { label: 'EVENTS', href: '/events' },
    { label: 'SOCIETIES', href: '/societies' },
    { label: 'EXECOM', href: '/#execom' },
];

export default function Navbar() {
    const [isVisible, setIsVisible] = useState(true);
    const [activeSection, setActiveSection] = useState('/');
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const { user, status, signOut } = useAuth();
    const loading = status === 'loading';

    useEffect(() => {
        setActiveSection(pathname || '/');
    }, [pathname]);

    // Close user menu on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
                setShowUserMenu(false);
            }
        };
        if (showUserMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
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

        window.addEventListener('scroll', handleScrollEvent);
        return () => {
            window.removeEventListener('scroll', handleScrollEvent);
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
            <motion.div 
                initial={{ y: -100, opacity: 0 }}
                animate={{ 
                    y: isVisible ? 0 : -100, 
                    opacity: isVisible ? 1 : 0 
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="fixed top-6 left-0 right-0 z-[100] flex justify-center pointer-events-none px-4"
            >
                <div className="pointer-events-auto bg-white/70 backdrop-blur-md border border-white/20 shadow-lg shadow-black/5 rounded-full px-2 py-1.5 flex items-center gap-1 max-w-[95vw]">
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                         {/* Nav Links */}
                         {navItems.map((item) => {
                        const isActive = pathname === item.href || 
                            (item.href.startsWith('/#') && pathname === '/' && activeSection.includes(item.href.replace('/#', '')));
                        
                        return (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={`relative px-3 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide transition-all duration-300 whitespace-nowrap ${
                                    isActive
                                        ? 'text-gray-900 bg-white shadow-sm' 
                                        : 'text-gray-500 hover:text-blue-600 hover:bg-white/50'
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                    </div>
                    
                    <div className="w-px h-4 bg-gray-300 mx-1 flex-shrink-0" />
                    
                    {/* Auth Section */}
                    {!loading && (
                        user ? (
                            <div className="relative" ref={userMenuRef}>
                                <button
                                    onClick={() => setShowUserMenu(!showUserMenu)}
                                    className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-full text-[10px] md:text-xs font-bold tracking-wide text-blue-600 hover:bg-white/50 transition-all duration-300 whitespace-nowrap"
                                >
                                    <User className="w-3 h-3 md:w-4 md:h-4" />
                                    <span className="hidden md:inline">{user.name?.split(' ')[0]}</span>
                                </button>
                                
                                {/* User dropdown */}
                                {showUserMenu && (
                                    <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[200px] overflow-hidden z-[1000] pointer-events-auto">
                                        <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                                            <p className="text-sm font-bold text-gray-900">{user.name}</p>
                                            <p className="text-[10px] font-mono text-gray-500 truncate mt-0.5">{user.email}</p>
                                        </div>
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
                        )
                    )}
                </div>
            </motion.div>

            {/* Login Modal */}
            <LoginModal
                isOpen={isLoginModalOpen}
                onClose={() => setIsLoginModalOpen(false)}
            />
        </>
    );
}
