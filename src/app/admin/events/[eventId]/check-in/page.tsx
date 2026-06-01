'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, 
    Users, 
    UserCheck, 
    Clock, 
    Percent,
    Calendar,
    MapPin,
    CheckCircle2,
    AlertCircle,
    XCircle,
    Loader2,
    ChevronLeft,
    RefreshCw,
    Download
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { StatsCard } from '@/components/admin/StatsCard';
import { CheckInLog } from '@/components/admin/CheckInLog';

const QRScanner = dynamic(() => import('@/components/admin/QRScanner').then(mod => ({ default: mod.QRScanner })), { ssr: false });
import AnimatedTick from '@/components/AnimatedTick';
import { client } from '@/lib/appwrite';
import { DATABASE_ID, EVENT_REGISTRATIONS_COLLECTION_ID } from '@/lib/constants/collections';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthFetch } from '@/hooks/useAuthFetch';
import toast from 'react-hot-toast';
import { createLogger } from '@/lib/api/logger';

const log = createLogger({ action: 'CheckInPage' });

interface CheckInEntry {
    id: string;
    studentName: string;
    ticketId: string;
    checkedInAt: string;
    isNew?: boolean;
    isDuplicate?: boolean;
    duplicateMessage?: string;
    location?: string; // Multi-location support
    locationHistory?: LocationRecencyItem[];
}

interface LocationRecencyItem {
    location: string;
    checkedInAt?: string;
    timeAgo?: string;
}

interface EventInfo {
    id: string;
    title: string;
    date: string;
    venue?: string;
    maxCapacity: number;
    totalRegistered: number;
    totalCheckedIn: number;
    societyId: string;
}

interface SearchResult {
    registrationId: string;
    ticketId: string;
    studentName: string;
    email: string;
    isCheckedIn: boolean;
    checkedInAt?: string;
    lastLocation?: string;
    locationHistory?: LocationRecencyItem[];
}

interface PageProps {
    params: Promise<{ eventId: string }>;
}

export default function CheckInPage({ params }: PageProps) {
    const { eventId } = use(params);
    const router = useRouter();
    const { user } = useAuth();
    const authFetch = useAuthFetch();
    
    // Event state
    const [event, setEvent] = useState<EventInfo | null>(null);
    const [eventLoading, setEventLoading] = useState(true);
    const [eventError, setEventError] = useState<string | null>(null);
    
    // Check-in state
    const [checkInEntries, setCheckInEntries] = useState<CheckInEntry[]>([]);
    const [entriesLoading, setEntriesLoading] = useState(false);
    const [lastScanResult, setLastScanResult] = useState<{
        success: boolean;
        message: string;
        type: 'success' | 'error' | 'warning';
        studentName?: string;
        timeAgo?: string;
        latestLocation?: string;
        latestCheckInAt?: string;
        locationHistory?: LocationRecencyItem[];
    } | null>(null);
    
    // Manual search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showManualCheckIn, setShowManualCheckIn] = useState(false);
    
    // Processing state (for individual check-ins)
    const [processingTickets, setProcessingTickets] = useState<Set<string>>(new Set());
    const [scanLocked, setScanLocked] = useState(false);
    const [scanLocation, setScanLocation] = useState('entrance');
    const scanLocationRef = React.useRef('entrance');
    const [exporting, setExporting] = useState(false);

    const getCompactTimeSince = useCallback((isoString: string): string => {
        const diff = Date.now() - new Date(isoString).getTime();
        const seconds = Math.max(0, Math.floor(diff / 1000));
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return `${seconds}s ago`;
    }, []);

    const normalizeLocationHistory = useCallback((raw: unknown): LocationRecencyItem[] => {
        let parsed: unknown = raw;
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw);
            } catch {
                console.error('[ERROR] Failed to parse location history JSON');
                return [];
            }
        }

        if (!Array.isArray(parsed)) return [];

        const mapped = parsed
            .map((item) => {
                if (!item || typeof item !== 'object') return null;
                const entry = item as Record<string, unknown>;
                const location = typeof entry.location === 'string' ? entry.location : '';
                if (!location) return null;
                const checkedInAt =
                    typeof entry.checkedInAt === 'string'
                        ? entry.checkedInAt
                        : typeof entry.checked_in_at === 'string'
                        ? entry.checked_in_at
                        : undefined;
                const timeAgo =
                    typeof entry.timeAgo === 'string'
                        ? entry.timeAgo
                        : typeof entry.time_ago === 'string'
                        ? entry.time_ago
                        : checkedInAt
                        ? getCompactTimeSince(checkedInAt)
                        : undefined;
                return { location, checkedInAt, timeAgo };
            })
            .filter((entry): entry is LocationRecencyItem => Boolean(entry));

        return mapped.sort((a, b) => (b.checkedInAt || '').localeCompare(a.checkedInAt || ''));
    }, [getCompactTimeSince]);

    const normalizeCheckInEntry = useCallback((entry: unknown): CheckInEntry => {
        const item = (entry || {}) as Record<string, unknown>;
        const checkedInAt =
            typeof item.checkedInAt === 'string'
                ? item.checkedInAt
                : typeof item.checked_in_at === 'string'
                ? item.checked_in_at
                : new Date().toISOString();
        const location =
            (typeof item.location === 'string' && item.location) ||
            (typeof item.lastLocation === 'string' && item.lastLocation) ||
            (typeof item.last_location === 'string' && item.last_location) ||
            'entrance';
        const locationHistory = normalizeLocationHistory(
            item.locationHistory ?? item.location_history ?? item.check_in_history
        );

        return {
            id: String(item.id ?? item.$id ?? Math.random()),
            studentName: String(item.studentName ?? item.student_name ?? 'Unknown'),
            ticketId: String(item.ticketId ?? item.ticket_id ?? item.id ?? ''),
            checkedInAt,
            location,
            locationHistory: locationHistory.length > 0 ? locationHistory : undefined,
            isDuplicate: item.isDuplicate as boolean | undefined,
            isNew: item.isNew as boolean | undefined,
            duplicateMessage: typeof item.duplicateMessage === 'string' ? item.duplicateMessage : undefined,
        };
    }, [normalizeLocationHistory]);

    // Fetch event info - wait for user to be loaded
    useEffect(() => {
        // Don't fetch until user is loaded (authFetch needs JWT)
        if (!user) {
            setEventLoading(false);
            return;
        }
        
        async function fetchEvent() {
            try {
                setEventLoading(true);
                const response = await authFetch(`/api/admin/check-in/${eventId}/status`);
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to load event');
                }
                
                const data = await response.json();
                setEvent(data.event);
                setCheckInEntries((data.recentCheckIns || []).map((entry: unknown) => normalizeCheckInEntry(entry)));
                // Sessionless mode - no active session to restore
            } catch (err) {
                log.error('Error fetching event', err instanceof Error ? err : new Error(String(err)));
                setEventError(err instanceof Error ? err.message : 'Failed to load event');
            } finally {
                setEventLoading(false);
            }
        }

        fetchEvent();
    }, [eventId, authFetch, user, normalizeCheckInEntry]);

    // Real-time subscription for check-in updates via event_registrations
    useEffect(() => {
        if (!EVENT_REGISTRATIONS_COLLECTION_ID || !DATABASE_ID || !event) return;

        const subscriptionPath = `databases.${DATABASE_ID}.collections.${EVENT_REGISTRATIONS_COLLECTION_ID}.documents`;
        
        const unsubscribe = client.subscribe(subscriptionPath, (response) => {
            // Listen for updates to registrations (check-in state changes)
            if (response.events.some(e => e.includes('.update'))) {
                const payload = response.payload as { 
                    $id: string; 
                    user_name?: string;
                    form_responses?: string;
                    ticket_id?: string; 
                    checked_in?: boolean;
                    check_in_time?: string;
                    checked_in_at?: string;
                    event_id: string;
                    last_check_in_location?: string;
                };
                
                // Only process if it's for our event and is a check-in
                if (payload.event_id === eventId && payload.checked_in === true) {
                    // Extract name from form_responses
                    let studentName = payload.user_name || 'Unknown';
                    try {
                        if (payload.form_responses) {
                            const formData = JSON.parse(payload.form_responses);
                            studentName = formData.name || studentName;
                        }
                    } catch {
                        log.warn('Failed to parse form responses for real-time check-in entry');
                    }
                    
                    const newEntry: CheckInEntry = {
                        id: payload.$id,
                        studentName,
                        ticketId: payload.ticket_id || payload.$id,
                        checkedInAt: payload.check_in_time || payload.checked_in_at || new Date().toISOString(),
                        isNew: true,
                        location: payload.last_check_in_location || 'entrance',
                        locationHistory: normalizeLocationHistory((payload as Record<string, unknown>).check_in_history),
                    };
                    
                    let nextEntryCount = 0;
                    let isExistingEntry = false;

                    // Upsert entry so latest location/time is reflected for repeat scans
                    setCheckInEntries(prev => {
                        const existingIndex = prev.findIndex(e => e.id === newEntry.id);
                        isExistingEntry = existingIndex !== -1;
                        if (existingIndex === -1) {
                            const appended = [newEntry, ...prev];
                            nextEntryCount = appended.length;
                            return appended;
                        }

                        const updated = [...prev];
                        updated[existingIndex] = {
                            ...updated[existingIndex],
                            ...newEntry,
                            isNew: true,
                        };
                        const sorted = updated.sort(
                            (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime()
                        );
                        nextEntryCount = sorted.length;
                        return sorted;
                    });
                    
                    // Update stats only when registration appears first time in list
                    setEvent(prev => {
                        if (!prev) return null;
                        if (isExistingEntry) return prev;
                        return {
                            ...prev,
                            totalCheckedIn: Math.max(prev.totalCheckedIn + 1, nextEntryCount),
                        };
                    });
                    
                    // Clear "new" flag after animation
                    setTimeout(() => {
                        setCheckInEntries(prev => 
                            prev.map(e => e.id === newEntry.id ? { ...e, isNew: false } : e)
                        );
                    }, 3000);
                }
            }
        });

        return () => {
            unsubscribe();
        };
    }, [event, eventId, normalizeLocationHistory]);

    useEffect(() => {
        if (!lastScanResult) return;
        const timer = setTimeout(() => setLastScanResult(null), 3000);
        return () => clearTimeout(timer);
    }, [lastScanResult]);

    // Handle QR scan - sessionless mode, works without active session
    const handleScan = useCallback(async (qrData: string) => {
        if (scanLocked) return;
        if (processingTickets.has(qrData)) return;
        setScanLocked(true);
        const currentLocation = scanLocationRef.current.trim() || 'entrance';

        try {
            // Parse QR data (could be JSON or plain ticket ID)
            let ticketId: string;
            try {
                const parsed = JSON.parse(qrData);
                ticketId = parsed.ticket_id || parsed.ticketId || qrData;
            } catch {
                log.warn('QR data is not JSON, using raw value as ticket ID');
                ticketId = qrData;
            }

            // Legacy support: previously some QR codes encoded /ticket/<id> URLs
            if (typeof ticketId === 'string' && /^https?:\/\//i.test(ticketId)) {
                try {
                    const url = new URL(ticketId);
                    const segments = url.pathname.split('/').filter(Boolean);
                    const ticketIndex = segments.findIndex((segment) => segment === 'ticket');
                    if (ticketIndex >= 0 && segments[ticketIndex + 1]) {
                        ticketId = segments[ticketIndex + 1];
                    }
                } catch {
                    log.warn('Failed to parse URL-encoded ticket ID, using original value');
                }
            }

            setProcessingTickets(prev => new Set(prev).add(ticketId));

            // First verify the QR code
            const verifyResponse = await authFetch('/api/admin/check-in/verify-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: ticketId,
                    event_id: eventId,
                    location: currentLocation,
                }),
            });

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok || !verifyData.valid) {
                // Check if already checked in
                if (verifyData.already_checked_in) {
                    const timeDiff = verifyData.checked_in_at 
                        ? getCompactTimeSince(verifyData.checked_in_at)
                        : 'earlier';
                    
                    setLastScanResult({
                        success: false,
                        message: `Already checked in ${timeDiff}`,
                        type: 'warning',
                        studentName: verifyData.student_name,
                        timeAgo: verifyData.time_ago || timeDiff,
                        latestLocation: verifyData.last_location || 'entrance',
                        latestCheckInAt: verifyData.checked_in_at,
                        locationHistory: normalizeLocationHistory(verifyData.location_history || verifyData.locationHistory),
                    });
                } else {
                    setLastScanResult({
                        success: false,
                        message: verifyData.message || 'Invalid QR code',
                        type: 'error',
                    });
                }
                return;
            }

            // Perform check-in (sessionless - session_id optional)
            const checkInResponse = await authFetch('/api/admin/check-in/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: ticketId,
                    event_id: eventId,
                    // session_id omitted - sessionless mode
                    registration_id: verifyData.registration?.$id || verifyData.registration?.id,
                    location: currentLocation,
                }),
            });

            const checkInData = await checkInResponse.json();

            if (!checkInResponse.ok) {
                setLastScanResult({
                    success: false,
                    message: checkInData.message || 'Check-in failed',
                    type: 'error',
                });
                return;
            }

            setLastScanResult({
                success: true,
                message: 'Checked in successfully!',
                type: 'success',
                studentName: checkInData.student_name,
                latestLocation: checkInData.location || currentLocation,
                latestCheckInAt: checkInData.registration?.check_in_time || new Date().toISOString(),
                locationHistory: normalizeLocationHistory(
                    checkInData.location_history ||
                    checkInData.locationHistory ||
                    checkInData.registration?.check_in_history
                ),
            });

            // Note: Real-time subscription will add to the log

        } catch (err) {
            log.error('Scan error', err instanceof Error ? err : new Error(String(err)));
            setLastScanResult({
                success: false,
                message: 'Failed to process QR code',
                type: 'error',
            });
        } finally {
            // Unlock scanner only after request cycle is fully complete
            setProcessingTickets(prev => {
                const next = new Set(prev);
                next.forEach(t => {
                    if (qrData.includes(t) || t.includes(qrData)) {
                        next.delete(t);
                    }
                });
                return next;
            });
            setScanLocked(false);
        }
    }, [eventId, processingTickets, authFetch, scanLocked, getCompactTimeSince, normalizeLocationHistory]);

    // Manual search
    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        try {
            setSearchLoading(true);
            const response = await authFetch(
                `/api/admin/check-in/${eventId}/search?q=${encodeURIComponent(searchQuery)}`
            );

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
                setSearchResults(
                    (data.results || []).map((result: SearchResult) => ({
                        ...result,
                        locationHistory: normalizeLocationHistory(
                            (result as unknown as Record<string, unknown>).location_history ??
                            (result as unknown as Record<string, unknown>).check_in_history ??
                            result.locationHistory
                        ),
                    }))
                );
        } catch (err) {
            log.error('Search error', err instanceof Error ? err : new Error(String(err)));
            toast.error('Search failed');
        } finally {
            setSearchLoading(false);
        }
    };

    // Manual check-in - sessionless mode
    const handleManualCheckIn = async (registration: SearchResult) => {
        try {
            setProcessingTickets(prev => new Set(prev).add(registration.ticketId));
            const currentLocation = scanLocationRef.current.trim() || 'entrance';

            const response = await authFetch('/api/admin/check-in/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: registration.ticketId,
                    event_id: eventId,
                    // session_id omitted - sessionless mode
                    registration_id: registration.registrationId,
                    location: currentLocation,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle duplicate check-in error (409) - show warning modal like scanner
                if (response.status === 409 && data.error === 'ALREADY_CHECKED_IN') {
                    setLastScanResult({
                        success: false,
                        message: data.message || 'Already checked in',
                        type: 'warning',
                        studentName: data.student_name || registration.studentName,
                        timeAgo: data.time_ago || 'earlier',
                        latestLocation: data.last_location || currentLocation,
                        latestCheckInAt: data.checked_in_at,
                        locationHistory: normalizeLocationHistory(data.location_history),
                    });
                } else {
                    // Other errors - show toast
                    toast.error(data.message || 'Check-in failed');
                }
                return;
            }

            // Success - show success modal (same as scanner)
            setLastScanResult({
                success: true,
                message: 'Checked in successfully!',
                type: 'success',
                studentName: data.student_name || registration.studentName,
                latestLocation: data.location || currentLocation,
                latestCheckInAt: data.registration?.check_in_time || new Date().toISOString(),
            });
            
            // Update search results - only on successful check-in
            setSearchResults(prev => 
                        prev.map(r => r.registrationId === registration.registrationId 
                            ? { 
                                ...r,
                                checkedInAt: data.registration?.check_in_time || new Date().toISOString(), 
                                lastLocation: data.location || currentLocation,
                                locationHistory: [
                                    ...(r.locationHistory || []),
                                    {
                                        location: data.location || currentLocation,
                                        checkedInAt: data.registration?.check_in_time || new Date().toISOString(),
                                        timeAgo: '0s ago',
                                    },
                                ],
                            }
                            : r
                        )
                    );
        } catch (err) {
            log.error('Manual check-in error', err instanceof Error ? err : new Error(String(err)));
            toast.error('Check-in failed');
        } finally {
            setProcessingTickets(prev => {
                const next = new Set(prev);
                next.delete(registration.ticketId);
                return next;
            });
        }
    };

    // Refresh data
    const refreshData = async () => {
        try {
            setEntriesLoading(true);
            const response = await fetch(`/api/admin/check-in/${eventId}/status`);
            
            if (response.ok) {
                const data = await response.json();
                setEvent(data.event);
                setCheckInEntries((data.recentCheckIns || []).map((entry: unknown) => normalizeCheckInEntry(entry)));
            }
        } catch (err) {
            log.error('Refresh error', err instanceof Error ? err : new Error(String(err)));
        } finally {
            setEntriesLoading(false);
        }
    };

    // Export check-in data as CSV
    const handleExport = async (checkedInOnly: boolean = false) => {
        try {
            setExporting(true);
            const queryParams = checkedInOnly ? '?checkedInOnly=true' : '';
            const response = await authFetch(`/api/admin/check-in/${eventId}/export${queryParams}`, {
                method: 'GET',
            });
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Export failed');
            }
            
            // Get filename from Content-Disposition header or use default
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `checkin-export-${eventId}.csv`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
                if (match) filename = match[1];
            }
            
            // Download the CSV
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            toast.success(checkedInOnly ? 'Exported checked-in attendees' : 'Exported all registrations');
        } catch (err) {
            log.error('Export error', err instanceof Error ? err : new Error(String(err)));
            toast.error(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    // Format date
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    // Loading state
    if (eventLoading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <Loader2 className="w-8 h-8 text-ieee-blue animate-spin mx-auto" />
                        <p className="mt-4 text-gray-600">Loading event...</p>
                    </div>
                </div>
            </AdminLayout>
        );
    }

    // Error state
    if (eventError || !event) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="text-center">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                        <p className="mt-4 text-gray-900 font-medium">Failed to load event</p>
                        <p className="text-gray-500 mt-1">{eventError}</p>
                        <button
                            onClick={() => router.push('/admin/events')}
                            className="mt-4 px-4 py-2 text-ieee-blue hover:underline"
                        >
                            ← Back to events
                        </button>
                    </div>
                </div>
            </AdminLayout>
        );
    }

    const checkInRate = event.totalRegistered > 0 
        ? Math.round((event.totalCheckedIn / event.totalRegistered) * 100) 
        : 0;

    return (
        <AdminLayout>
            <AnimatePresence>
                {lastScanResult && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 backdrop-blur-sm px-4"
                        onClick={() => setLastScanResult(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.92, y: 12 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.92, y: 12 }}
                            className={`w-full max-w-md rounded-2xl border-2 p-8 text-center shadow-2xl ${
                                lastScanResult.type === 'success'
                                    ? 'bg-green-50 border-green-200'
                                    : lastScanResult.type === 'warning'
                                    ? 'bg-yellow-50 border-yellow-200'
                                    : 'bg-red-50 border-red-200'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-4 flex justify-center">
                                {lastScanResult.type === 'success' ? (
                                    <AnimatedTick size={96} />
                                ) : lastScanResult.type === 'warning' ? (
                                    <AlertCircle className="w-20 h-20 text-yellow-600" />
                                ) : (
                                    <XCircle className="w-20 h-20 text-red-600" />
                                )}
                            </div>
                            {lastScanResult.studentName && (
                                <h2 className="text-2xl font-bold text-gray-900">{lastScanResult.studentName}</h2>
                            )}
                             <p className="mt-2 text-lg font-medium text-gray-700">
                                 {lastScanResult.type === 'warning' && lastScanResult.timeAgo
                                     ? `Already checked in ${lastScanResult.timeAgo}`
                                     : lastScanResult.message}
                             </p>
                            {(lastScanResult.latestLocation || lastScanResult.latestCheckInAt) && (
                                <p className="mt-2 text-sm text-gray-600">
                                    Latest check-in: <span className="font-medium">{lastScanResult.latestLocation || 'entrance'}</span>
                                    {lastScanResult.latestCheckInAt ? ` • ${getCompactTimeSince(lastScanResult.latestCheckInAt)}` : ''}
                                </p>
                            )}
                            {lastScanResult.locationHistory && lastScanResult.locationHistory.length > 0 && (
                                <div className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-left">
                                    {lastScanResult.locationHistory.slice(0, 3).map((history) => (
                                        <p key={`${history.location}-${history.checkedInAt || history.timeAgo}`} className="text-sm text-gray-700">
                                            <span className="font-medium">{history.location}</span>{' '}
                                            last checked in {history.timeAgo || (history.checkedInAt ? getCompactTimeSince(history.checkedInAt) : 'earlier')}
                                        </p>
                                    ))}
                                </div>
                            )}
                         </motion.div>
                     </motion.div>
                 )}
            </AnimatePresence>
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <button
                            onClick={() => router.push('/admin/events')}
                            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-2 text-sm"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to events
                        </button>
                        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                            Check-in: {event.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-600 text-sm">
                            <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatDate(event.date)}
                            </span>
                            {event.venue && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-4 h-4" />
                                    {event.venue}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Controls - sessionless mode, refresh and export buttons */}
                    <div className="flex items-center gap-2">
                        {/* Export dropdown */}
                        <div className="relative group">
                            <button
                                disabled={exporting}
                                className="flex items-center gap-1.5 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                                title="Export data"
                            >
                                {exporting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                <span className="hidden sm:inline">Export</span>
                            </button>
                            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-10">
                                <button
                                    onClick={() => handleExport(false)}
                                    disabled={exporting}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                                >
                                    Export All Registrations
                                </button>
                                <button
                                    onClick={() => handleExport(true)}
                                    disabled={exporting}
                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg border-t border-gray-100"
                                >
                                    Export Checked-in Only
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={refreshData}
                            disabled={entriesLoading}
                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Refresh data"
                        >
                            <RefreshCw className={`w-5 h-5 ${entriesLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatsCard
                        title="Registered"
                        value={event.totalRegistered}
                        subtitle={event.maxCapacity ? `of ${event.maxCapacity} capacity` : undefined}
                        icon={Users}
                    />
                    <StatsCard
                        title="Checked In"
                        value={event.totalCheckedIn}
                        subtitle={`${checkInRate}% attendance`}
                        icon={UserCheck}
                    />
                    <StatsCard
                        title="Remaining"
                        value={event.totalRegistered - event.totalCheckedIn}
                        subtitle="not yet checked in"
                        icon={Clock}
                    />
                    <StatsCard
                        title="Check-in Rate"
                        value={`${checkInRate}%`}
                        icon={Percent}
                        trend={checkInRate > 0 ? { value: checkInRate, isPositive: true } : undefined}
                    />
                </div>

                {/* Main content grid */}
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* QR Scanner Section */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-gray-900">QR Scanner</h2>
                                <button
                                    onClick={() => setShowManualCheckIn(!showManualCheckIn)}
                                    className="text-sm text-ieee-blue hover:underline"
                                >
                                    {showManualCheckIn ? 'Use Scanner' : 'Manual Check-in'}
                                </button>
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Scan Location
                                </label>
                                <input
                                    type="text"
                                    value={scanLocation}
                                    onChange={(e) => {
                                        const nextLocation = e.target.value.trimStart();
                                        scanLocationRef.current = nextLocation;
                                        setScanLocation(nextLocation);
                                    }}
                                    placeholder="entrance, food-court-1, workshop-1"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue outline-none"
                                />
                            </div>

                            <AnimatePresence mode="wait">
                                {showManualCheckIn ? (
                                    <motion.div
                                        key="manual"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="space-y-4"
                                    >
                                        {/* Search input */}
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                                    placeholder="Search by name, email, or ticket ID..."
                                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={handleSearch}
                                                disabled={searchLoading || !searchQuery.trim()}
                                                className="px-4 py-3 bg-ieee-blue text-white rounded-xl hover:bg-ieee-blue/90 transition-colors disabled:opacity-50"
                                            >
                                                {searchLoading ? (
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    <Search className="w-5 h-5" />
                                                )}
                                            </button>
                                        </div>

                                        {/* Search results */}
                                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                            {searchResults.length === 0 && searchQuery && !searchLoading && (
                                                <p className="text-center text-gray-500 py-8">
                                                    No results found
                                                </p>
                                            )}
                                            {searchResults.map((result) => (
                                                <div
                                                    key={result.registrationId}
                                                    className="p-4 bg-gray-50 rounded-xl flex items-center justify-between"
                                                >
                                                    <div>
                                                        <p className="font-medium text-gray-900">
                                                            {result.studentName}
                                                        </p>
                                                        <p className="text-sm text-gray-500">
                                                            {result.email}
                                                        </p>
                                                    </div>
                                                    {result.isCheckedIn ? (
                                                        <span className="flex items-center gap-1 text-green-600 text-sm">
                                                            <CheckCircle2 className="w-4 h-4" />
                                                            Checked in
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleManualCheckIn(result)}
                                                            disabled={processingTickets.has(result.ticketId)}
                                                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                                        >
                                                            {processingTickets.has(result.ticketId) ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                            ) : (
                                                                <UserCheck className="w-4 h-4" />
                                                            )}
                                                            Check In
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="scanner"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                    >
                                        <QRScanner
                                            onScan={handleScan}
                                            isActive={!scanLocked}
                                            lastScanResult={lastScanResult}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Check-in status indicator - always ready in sessionless mode */}
                        <div className="p-4 rounded-xl flex items-center gap-3 bg-green-50 border border-green-200">
                            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                            <span className="font-medium text-green-800">
                                Check-in Ready
                            </span>
                            <span className="text-green-600 text-sm ml-auto">
                                Sessionless Mode
                            </span>
                        </div>
                    </div>

                    {/* Check-in Log Section */}
                    <div>
                        <CheckInLog entries={checkInEntries} loading={entriesLoading} />
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
