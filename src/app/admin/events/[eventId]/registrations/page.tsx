'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Filter,
    Download,
    Mail,
    CheckSquare,
    Square,
    Trash2,
    ChevronDown,
    ChevronUp,
    Eye,
    UserCheck,
    X,
    Calendar,
    Loader2,
    AlertCircle,
    CheckCircle,
    Clock,
    XCircle,
    UserPlus,
    Upload,
} from 'lucide-react';
import { RegistrationDetails } from '@/components/admin/RegistrationDetails';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import toast from 'react-hot-toast';
import { account } from '@/lib/appwrite';
import Papa from 'papaparse';
import { createLogger } from '@/lib/api/logger';

const log = createLogger({ action: 'RegistrationsPage' });

interface Registration {
    id: string;
    ticket_id: string;
    user_name: string;
    user_email: string;
    user_phone?: string;
    department?: string;
    semester?: string;
    section?: string;
    roll_number?: string;
    registration_date: string;
    payment_status: string;
    checked_in: boolean;
    check_in_time?: string;
    form_responses?: Record<string, unknown>;
}

interface RegistrationsResponse {
    registrations: Registration[];
    total: number;
    pages: number;
    current_page: number;
}

const STATUS_STYLES = {
    paid: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
    completed: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
    free: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle },
    failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
    expired: { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertCircle },
};

type SortField = 'user_name' | 'registration_date';
type SortDirection = 'asc' | 'desc';

function RegistrationsPageContent() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const eventId = params.eventId as string;

    // State
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectAllPages, setSelectAllPages] = useState(false); // Track if all pages are selected
    
    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<string>('all');
    const [checkinFilter, setCheckinFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortField, setSortField] = useState<SortField>('registration_date');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    
    // UI State
    const [showFilters, setShowFilters] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
    const [showBulkMenu, setShowBulkMenu] = useState(false);
    const [bulkAction, setBulkAction] = useState<string>('');
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    
    // Manual registration state
    const [showManualRegModal, setShowManualRegModal] = useState(false);
    const [manualRegLoading, setManualRegLoading] = useState(false);
    const [csvImportLoading, setCsvImportLoading] = useState(false);
    const csvFileInputRef = React.useRef<HTMLInputElement>(null);
    const [manualRegForm, setManualRegForm] = useState({
        name: '',
        email: '',
        phone: '',
        department: '',
        semester: '',
        section: '',
        roll_number: '',
    });

    const getAuthHeaders = async (includeContentType = false) => {
        const headers: Record<string, string> = {};
        if (includeContentType) {
            headers['Content-Type'] = 'application/json';
        }
        try {
            const jwtResponse = await account.createJWT();
            if (jwtResponse?.jwt) {
                headers['x-appwrite-jwt'] = jwtResponse.jwt;
            }
        } catch (error) {
            log.error('Failed to generate JWT', error instanceof Error ? error : new Error(String(error)));
        }
        return headers;
    };

    // Fetch registrations
    const fetchRegistrations = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: currentPage.toString(),
                search: searchQuery,
                payment_status: paymentFilter,
                checkin_status: checkinFilter,
                sort_by: sortField,
                sort_order: sortDirection,
            });

            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);

            const headers = await getAuthHeaders();
            const response = await fetch(`/api/admin/events/${eventId}/registrations?${params}`, {
                headers
            });
            if (!response.ok) throw new Error('Failed to fetch registrations');

            const data: RegistrationsResponse = await response.json();
            setRegistrations(data.registrations);
            setTotal(data.total);
            setPages(data.pages);
        } catch (error) {
            log.error('Error fetching registrations', error instanceof Error ? error : new Error(String(error)));
            toast.error('Failed to load registrations');
        } finally {
            setLoading(false);
        }
    }, [eventId, currentPage, searchQuery, paymentFilter, checkinFilter, dateFrom, dateTo, sortField, sortDirection]);

    useEffect(() => {
        fetchRegistrations();
    }, [fetchRegistrations]);

    // Debounced search - increased delay for better UX
    useEffect(() => {
        // Don't trigger on initial mount
        const timer = setTimeout(() => {
            if (currentPage !== 1) setCurrentPage(1);
            else fetchRegistrations();
        }, 400); // Reduced from 500ms but with better handling

        return () => clearTimeout(timer);
    }, [searchQuery, currentPage, fetchRegistrations]);

    // Selection handlers
    const handleSelectAll = useCallback(() => {
        if (selectedIds.size === registrations.length && !selectAllPages) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(registrations.map(r => r.id)));
        }
        setSelectAllPages(false); // Reset global selection
    }, [registrations, selectedIds.size, selectAllPages]);

    const handleSelectAllPages = useCallback(async () => {
        try {
            // Fetch all registration IDs for this event
            const headers = await getAuthHeaders();
            const params = new URLSearchParams({
                page: '1',
                search: searchQuery,
                payment_status: paymentFilter,
                checkin_status: checkinFilter,
                all_ids: 'true', // Signal to return all IDs
            });

            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);

            const response = await fetch(`/api/admin/events/${eventId}/registrations?${params}`, {
                headers
            });
            if (!response.ok) throw new Error('Failed to fetch all IDs');

            const data = await response.json();
            const allIds = data.all_ids || [];
            setSelectedIds(new Set(allIds));
            setSelectAllPages(true);
            toast.success(`Selected all ${allIds.length} registrations`);
        } catch (error) {
            log.error('Error selecting all', error instanceof Error ? error : new Error(String(error)));
            toast.error('Failed to select all registrations');
        }
    }, [eventId, searchQuery, paymentFilter, checkinFilter, dateFrom, dateTo]);

    const handleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // Sort handler
    const handleSort = useCallback((field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    }, [sortField]);

    // Bulk actions
    const handleBulkAction = useCallback((action: string) => {
        if (selectedIds.size === 0) {
            toast.error('Please select at least one registration');
            return;
        }

        setBulkAction(action);
        
        if (action === 'delete') {
            setShowConfirmDialog(true);
        } else {
            executeBulkAction(action);
        }
        
        setShowBulkMenu(false);
    }, [selectedIds]);

    const executeBulkAction = async (action: string) => {
        setActionLoading(true);
        try {
            const headers = await getAuthHeaders(true);
            const endpoint = action === 'email'
                ? `/api/admin/events/${eventId}/registrations/bulk-email`
                : '/api/admin/bulk-operations';

            const payload = action === 'email'
                ? { registration_ids: Array.from(selectedIds) }
                : {
                    action,
                    registration_ids: Array.from(selectedIds),
                    event_id: eventId,
                };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) throw new Error('Bulk action failed');

            // Handle export separately (CSV download)
            if (action === 'export') {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Selected_Registrations_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                toast.success(`Exported ${selectedIds.size} registrations to CSV`);
                setSelectedIds(new Set()); // Clear selection after export
                return;
            }

            const result = await response.json();
             
            if (action === 'email') {
                toast.success(`Queued emails for ${result.sent_count} registrations`);
                if (result.failed_count > 0 || result.skipped_count > 0) {
                    toast.error(`Failed: ${result.failed_count}, Skipped: ${result.skipped_count}`);
                }
            } else if (action === 'checkin') {
                toast.success(result.message || `Checked in ${result.checked_in_count} registrations`);
                if (result.failed_count > 0) {
                    toast.error(`Failed to check in ${result.failed_count} registrations`);
                }
                fetchRegistrations(); // Refresh list
                setSelectedIds(new Set()); // Clear selection
            } else if (action === 'delete') {
                toast.success(result.message || `Deleted ${result.deleted_count} registrations`);
                if (result.failed_count > 0) {
                    toast.error(`Failed to delete ${result.failed_count} registrations`);
                }
                fetchRegistrations(); // Refresh list
                setSelectedIds(new Set()); // Clear selection
            }
        } catch (error) {
            log.error('Bulk action error', error instanceof Error ? error : new Error(String(error)));
            toast.error('Failed to complete action');
        } finally {
            setActionLoading(false);
            setShowConfirmDialog(false);
        }
    };

    // Individual actions
    const handleResendEmail = async (registrationId: string) => {
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`/api/admin/registrations/${registrationId}/resend-email`, {
                method: 'POST',
                headers,
            });

            if (!response.ok) throw new Error('Failed to resend email');

            toast.success('Email sent successfully');
        } catch (error) {
            log.error('Error resending email', error instanceof Error ? error : new Error(String(error)));
            toast.error('Failed to send email');
        }
    };

    const handleCheckIn = async (registrationId: string) => {
        try {
            const headers = await getAuthHeaders(true);
            const response = await fetch(`/api/admin/registrations/${registrationId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ checked_in: true }),
            });

            if (!response.ok) throw new Error('Failed to check in');

            toast.success('Marked as checked in');
            fetchRegistrations();
        } catch (error) {
            log.error('Error checking in', error instanceof Error ? error : new Error(String(error)));
            toast.error('Failed to check in');
        }
    };

    const handleDelete = async (registrationId: string) => {
        if (!confirm('Are you sure you want to delete this registration?')) return;

        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`/api/admin/registrations/${registrationId}`, {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('Failed to delete');

            toast.success('Registration deleted');
            fetchRegistrations();
        } catch (error) {
            log.error('Error deleting', error instanceof Error ? error : new Error(String(error)));
            toast.error('Failed to delete registration');
        }
    };

    // Manual registration handler
    const handleManualRegistration = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!manualRegForm.name || !manualRegForm.email) {
            toast.error('Name and email are required');
            return;
        }

        setManualRegLoading(true);
        try {
            const headers = await getAuthHeaders(true);
            const response = await fetch(`/api/admin/events/${eventId}/registrations`, {
                method: 'POST',
                headers,
                body: JSON.stringify(manualRegForm),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to create registration');
            }

            toast.success('Registration created successfully');
            setShowManualRegModal(false);
            setManualRegForm({
                name: '',
                email: '',
                phone: '',
                department: '',
                semester: '',
                section: '',
                roll_number: '',
            });
            fetchRegistrations();
        } catch (error) {
            log.error('Error creating registration', error instanceof Error ? error : new Error(String(error)));
            toast.error(error instanceof Error ? error.message : 'Failed to create registration');
        } finally {
            setManualRegLoading(false);
        }
    };

    const handleCsvImportClick = () => {
        if (!csvImportLoading) {
            csvFileInputRef.current?.click();
        }
    };

    const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCsvImportLoading(true);
        try {
            const csvText = await file.text();
            const parsed = Papa.parse<Record<string, string>>(csvText, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim(),
            });

            if (parsed.errors.length > 0) {
                throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
            }

            const rows = parsed.data.filter((row) =>
                Object.values(row).some((value) => String(value || '').trim().length > 0)
            );

            if (rows.length === 0) {
                throw new Error('No valid rows found in CSV file.');
            }

            const headers = await getAuthHeaders(true);
            const response = await fetch(`/api/admin/events/${eventId}/registrations/import-csv`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ rows }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'CSV import failed');
            }

            toast.success(`Imported ${data.imported_count} registration(s)`);
            if (data.failed_count > 0 || data.skipped_count > 0) {
                const failureMessage = `Skipped: ${data.skipped_count}, Failed: ${data.failed_count}`;
                toast.error(failureMessage, { duration: 8000 });
                
                // Log detailed errors to console for review
                if (data.failures && data.failures.length > 0) {
                    log.info('CSV Import Errors', { failures: data.failures });
                    
                    // Also show a summary alert with first few errors
                    const errorDetails = data.failures.slice(0, 5).map((f: any) => 
                        `Row ${f.row}: ${f.reason}`
                    ).join('\n');
                    const moreErrors = data.failures.length > 5 ? `\n\n...and ${data.failures.length - 5} more errors (check console for full list)` : '';
                    
                    // Use setTimeout to ensure it appears after the toast
                    setTimeout(() => {
                        toast.error(`Import completed with errors:\n\n${errorDetails}${moreErrors}`, { duration: 8000 });
                    }, 500);
                }
            }
            fetchRegistrations();
        } catch (error) {
            log.error('CSV import error', error instanceof Error ? error : new Error(String(error)));
            toast.error(error instanceof Error ? error.message : 'Failed to import CSV');
        } finally {
            setCsvImportLoading(false);
            if (csvFileInputRef.current) {
                csvFileInputRef.current.value = '';
            }
        }
    };

    // Format date
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusStyle = (status: string) => {
        return STATUS_STYLES[status as keyof typeof STATUS_STYLES] || STATUS_STYLES.pending;
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDirection === 'asc' ? (
            <ChevronUp className="w-4 h-4" />
        ) : (
            <ChevronDown className="w-4 h-4" />
        );
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => router.back()}
                        className="text-sm text-gray-600 hover:text-gray-900 mb-4"
                    >
                        ← Back to Event
                    </button>
                    <h1 className="text-3xl font-bold text-gray-900">Event Registrations</h1>
                    <p className="mt-2 text-gray-600">
                        Manage and view all registrations for this event
                    </p>
                </div>

                {/* Actions Bar */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
                    <div className="flex flex-col lg:flex-row gap-4">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search by name, email, phone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                            />
                        </div>

                        {/* Filter Toggle */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <Filter className="w-5 h-5" />
                            Filters
                            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {/* Manual Registration Button */}
                        <button
                            onClick={() => setShowManualRegModal(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                            <UserPlus className="w-5 h-5" />
                            Manual Registration
                        </button>

                        {/* CSV Import Button */}
                        <button
                            onClick={handleCsvImportClick}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={csvImportLoading}
                        >
                            {csvImportLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Upload className="w-5 h-5" />
                            )}
                            {csvImportLoading ? 'Importing CSV...' : 'Import CSV'}
                        </button>
                        <input
                            ref={csvFileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleCsvFileSelected}
                            className="hidden"
                        />

                        {/* Bulk Actions */}
                        {selectedIds.size > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowBulkMenu(!showBulkMenu)}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-ieee-blue text-white rounded-lg hover:bg-ieee-blue/90 transition-colors font-medium"
                                >
                                    {selectedIds.size} selected
                                    <ChevronDown className="w-4 h-4" />
                                </button>

                                <AnimatePresence>
                                    {showBulkMenu && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-10"
                                                onClick={() => setShowBulkMenu(false)}
                                            />
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                                            >
                                                <button
                                                    onClick={() => handleBulkAction('email')}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    <Mail className="w-4 h-4" />
                                                    Send Email
                                                </button>
                                                <button
                                                    onClick={() => handleBulkAction('export')}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Export to CSV
                                                </button>
                                                <button
                                                    onClick={() => handleBulkAction('checkin')}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    <CheckSquare className="w-4 h-4" />
                                                    Mark as Checked In
                                                </button>
                                                <hr className="my-1" />
                                                <button
                                                    onClick={() => handleBulkAction('delete')}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete Selected
                                                </button>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Filters Panel */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="pt-4 mt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Payment Status
                                        </label>
                                        <select
                                            value={paymentFilter}
                                            onChange={(e) => setPaymentFilter(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                        >
                                            <option value="all">All</option>
                                            <option value="pending">Pending</option>
                                            <option value="completed">Completed</option>
                                            <option value="paid">Paid</option>
                                            <option value="expired">Expired</option>
                                            <option value="free">Free</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Check-in Status
                                        </label>
                                        <select
                                            value={checkinFilter}
                                            onChange={(e) => setCheckinFilter(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                        >
                                            <option value="all">All</option>
                                            <option value="checked_in">Checked In</option>
                                            <option value="not_checked_in">Not Checked In</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Date From
                                        </label>
                                        <input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Date To
                                        </label>
                                        <input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            setPaymentFilter('all');
                                            setCheckinFilter('all');
                                            setDateFrom('');
                                            setDateTo('');
                                        }}
                                        className="text-sm text-gray-600 hover:text-gray-900"
                                    >
                                        Clear all filters
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Results Info */}
                <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                        Showing {registrations.length} of {total} registrations
                    </p>
                </div>

                {/* Select All Pages Banner */}
                {selectedIds.size === registrations.length && selectedIds.size > 0 && !selectAllPages && total > registrations.length && (
                    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                        <p className="text-sm text-blue-900">
                            {selectedIds.size} registrations on this page are selected.
                        </p>
                        <button
                            onClick={handleSelectAllPages}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
                        >
                            Select all {total} registrations
                        </button>
                    </div>
                )}
                
                {/* Show when all pages are selected */}
                {selectAllPages && (
                    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                        <p className="text-sm text-blue-900 font-medium">
                            All {selectedIds.size} registrations are selected.
                        </p>
                        <button
                            onClick={() => {
                                setSelectedIds(new Set());
                                setSelectAllPages(false);
                            }}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 underline"
                        >
                            Clear selection
                        </button>
                    </div>
                )}

                {/* Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center">
                            <Loader2 className="w-8 h-8 mx-auto text-ieee-blue animate-spin mb-4" />
                            <p className="text-gray-600">Loading registrations...</p>
                        </div>
                    ) : registrations.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <Search className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">
                                No registrations found
                            </h3>
                            <p className="text-gray-500">
                                {searchQuery || paymentFilter !== 'all' || checkinFilter !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Registrations will appear here once students start signing up'}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-4 py-3 text-left">
                                                <button
                                                    onClick={handleSelectAll}
                                                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                                                >
                                                    {selectedIds.size === registrations.length ? (
                                                        <CheckSquare className="w-5 h-5 text-ieee-blue" />
                                                    ) : (
                                                        <Square className="w-5 h-5 text-gray-400" />
                                                    )}
                                                </button>
                                            </th>
                                            <th
                                                onClick={() => handleSort('user_name')}
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            >
                                                <div className="flex items-center gap-1">
                                                    Name
                                                    <SortIcon field="user_name" />
                                                </div>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Email
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Phone
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Department
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Semester
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Payment
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Check-in
                                            </th>
                                            <th
                                                onClick={() => handleSort('registration_date')}
                                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            >
                                                <div className="flex items-center gap-1">
                                                    Registered
                                                    <SortIcon field="registration_date" />
                                                </div>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {registrations.map((registration, index) => {
                                            const statusStyle = getStatusStyle(registration.payment_status);
                                            const StatusIcon = statusStyle.icon;
                                            const rowKey =
                                                registration.id ||
                                                registration.ticket_id ||
                                                `${registration.user_email}-${registration.registration_date}-${index}`;

                                            return (
                                                <motion.tr
                                                    key={rowKey}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    transition={{ delay: index * 0.02 }}
                                                    className="hover:bg-gray-50"
                                                >
                                                    <td className="px-4 py-3">
                                                        <button
                                                            onClick={() => handleSelect(registration.id)}
                                                            className="p-1 hover:bg-gray-200 rounded"
                                                        >
                                                            {selectedIds.has(registration.id) ? (
                                                                <CheckSquare className="w-5 h-5 text-ieee-blue" />
                                                            ) : (
                                                                <Square className="w-5 h-5 text-gray-400" />
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {registration.user_name}
                                                            </p>
                                                            {registration.ticket_id && (
                                                                <p className="text-xs text-gray-500 font-mono">
                                                                    {registration.ticket_id}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm text-gray-600">
                                                            {registration.user_email}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm text-gray-600">
                                                            {registration.user_phone || '-'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm text-gray-600">
                                                            {registration.department || '-'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm text-gray-600">
                                                            {registration.semester || '-'}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                                                        >
                                                            <StatusIcon className="w-3 h-3" />
                                                            {registration.payment_status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {registration.checked_in ? (
                                                            <div className="flex items-center gap-1 text-green-600">
                                                                <CheckCircle className="w-4 h-4" />
                                                                <span className="text-xs">Yes</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs">No</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-xs text-gray-600">
                                                            {formatDate(registration.registration_date)}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => setSelectedRegistration(registration)}
                                                                className="p-1.5 text-gray-600 hover:text-ieee-blue hover:bg-gray-100 rounded transition-colors"
                                                                title="View details"
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </button>
                                                            {!registration.checked_in && (
                                                                <button
                                                                    onClick={() => handleCheckIn(registration.id)}
                                                                    className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-gray-100 rounded transition-colors"
                                                                    title="Check in"
                                                                >
                                                                    <UserCheck className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleResendEmail(registration.id)}
                                                                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded transition-colors"
                                                                title="Resend email"
                                                            >
                                                                <Mail className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(registration.id)}
                                                                className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded transition-colors"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {pages > 1 && (
                                <div className="px-4 py-4 border-t border-gray-200 flex items-center justify-between">
                                    <div className="text-sm text-gray-600">
                                        Page {currentPage} of {pages}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(pages, p + 1))}
                                            disabled={currentPage === pages}
                                            className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Registration Details Modal */}
                {selectedRegistration && (
                    <RegistrationDetails
                        registration={selectedRegistration}
                        onClose={() => setSelectedRegistration(null)}
                        onUpdate={fetchRegistrations}
                        onResendEmail={handleResendEmail}
                        onDelete={handleDelete}
                    />
                )}

                {/* Confirm Dialog */}
                <ConfirmDialog
                    isOpen={showConfirmDialog}
                    onClose={() => setShowConfirmDialog(false)}
                    onConfirm={() => executeBulkAction(bulkAction)}
                    title="Confirm Deletion"
                    message={`Are you sure you want to delete ${selectedIds.size} registration(s)? This action cannot be undone.`}
                    confirmText="Delete"
                    variant="danger"
                    loading={actionLoading}
                />

                {/* Manual Registration Modal */}
                <AnimatePresence>
                    {showManualRegModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                            >
                                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                                    <h2 className="text-2xl font-bold text-gray-900">Manual Registration</h2>
                                    <button
                                        onClick={() => setShowManualRegModal(false)}
                                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                        disabled={manualRegLoading}
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <form onSubmit={handleManualRegistration} className="p-6 space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                required
                                                value={manualRegForm.name}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, name: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="Enter full name"
                                                disabled={manualRegLoading}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Email <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={manualRegForm.email}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, email: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="email@example.com"
                                                disabled={manualRegLoading}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Phone
                                            </label>
                                            <input
                                                type="tel"
                                                value={manualRegForm.phone}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, phone: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="10-digit phone number"
                                                pattern="[6-9][0-9]{9}"
                                                disabled={manualRegLoading}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Department
                                            </label>
                                            <input
                                                type="text"
                                                value={manualRegForm.department}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, department: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="e.g., Computer Science"
                                                disabled={manualRegLoading}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Semester
                                            </label>
                                            <input
                                                type="text"
                                                value={manualRegForm.semester}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, semester: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="e.g., S5"
                                                disabled={manualRegLoading}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Section
                                            </label>
                                            <input
                                                type="text"
                                                value={manualRegForm.section}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, section: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="e.g., A"
                                                disabled={manualRegLoading}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Roll Number
                                            </label>
                                            <input
                                                type="text"
                                                value={manualRegForm.roll_number}
                                                onChange={(e) => setManualRegForm({ ...manualRegForm, roll_number: e.target.value })}
                                                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-ieee-blue/20 focus:border-ieee-blue"
                                                placeholder="Enter roll number"
                                                disabled={manualRegLoading}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-4 pt-4 border-t border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => setShowManualRegModal(false)}
                                            className="flex-1 px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                            disabled={manualRegLoading}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            disabled={manualRegLoading}
                                        >
                                            {manualRegLoading ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                <>
                                                    <UserPlus className="w-5 h-5" />
                                                    Create Registration
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function Page() {
    return (
        <Suspense fallback={<div className="p-12 text-center"><div className="w-8 h-8 mx-auto text-ieee-blue animate-spin mb-4 border-4 border-gray-200 border-t-ieee-blue rounded-full" /><p className="text-gray-600">Loading...</p></div>}>
            <RegistrationsPageContent />
        </Suspense>
    );
}
