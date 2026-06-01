'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Play,
  Pause,
  Loader2,
  BarChart3,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { account } from '@/lib/appwrite';

interface EmailLog {
  $id: string;
  $createdAt: string;
  recipient_email: string;
  recipient_name: string;
  registration_id?: string;
  event_id?: string;
  event_title?: string;
  subject: string;
  status: 'sent' | 'failed' | 'pending';
  error_message?: string;
  attempts: number;
  sent_at?: string;
  batch_id?: string;
}

interface EmailLogsResponse {
  success: boolean;
  logs: EmailLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  notice?: string;
}

interface BulkStatusResponse {
  success: boolean;
  batch_id?: string;
  queue: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    is_processing: boolean;
  };
  persisted?: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
  failed_recipients?: Array<{
    email: string;
    name: string;
    error: string;
    registration_id?: string;
  }>;
  progress?: number;
}

interface Event {
  $id: string;
  title: string;
}

const STATUS_STYLES = {
  sent: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock },
};

export default function EmailDashboardPage() {
  // State
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Bulk status tracking
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<BulkStatusResponse | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    successRate: 0,
  });

  // Loading states
  const [retryLoading, setRetryLoading] = useState(false);

  // Fetch JWT for API calls
  const getAuthHeaders = useCallback(async () => {
    try {
      const jwt = await account.createJWT();
      return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt.jwt}`,
      };
    } catch {
      console.error('[ERROR] Failed to create JWT for auth headers');
      return {
        'Content-Type': 'application/json',
        Authorization: '',
      };
    }
  }, []);

  // Fetch email logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', '50');

      if (eventFilter !== 'all') params.set('event_id', eventFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/admin/emails/logs?${params.toString()}`, { headers });
      const data: EmailLogsResponse = await res.json();

      if (data.success) {
        setLogs(data.logs);
        setTotal(data.total);
        setPages(data.pages);
        if (data.notice) setNotice(data.notice);

        // Calculate stats from current filter
        const sentCount = data.logs.filter((l) => l.status === 'sent').length;
        const failedCount = data.logs.filter((l) => l.status === 'failed').length;
        const pendingCount = data.logs.filter((l) => l.status === 'pending').length;
        setStats({
          total: data.total,
          sent: sentCount,
          failed: failedCount,
          pending: pendingCount,
          successRate: data.total > 0 ? Math.round((sentCount / data.total) * 100) : 0,
        });
      } else {
        toast.error('Failed to fetch email logs');
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to fetch email logs');
    } finally {
      setLoading(false);
    }
  }, [currentPage, eventFilter, statusFilter, dateFrom, dateTo, searchQuery, getAuthHeaders]);

  // Fetch events for filter dropdown
  const fetchEvents = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/events?limit=100', { headers });
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }, [getAuthHeaders]);

  // Fetch batch status
  const fetchBatchStatus = useCallback(async () => {
    if (!activeBatchId) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/emails/bulk-status?batch_id=${activeBatchId}`, { headers });
      const data: BulkStatusResponse = await res.json();

      if (data.success) {
        setBatchStatus(data);

        // Stop auto-refresh if batch is complete
        if (data.queue.pending === 0 && data.queue.processing === 0) {
          setAutoRefresh(false);
          fetchLogs(); // Refresh logs after batch completes
        }
      }
    } catch (error) {
      console.error('Error fetching batch status:', error);
    }
  }, [activeBatchId, getAuthHeaders, fetchLogs]);

  // Initial load
  useEffect(() => {
    fetchLogs();
    fetchEvents();
  }, [fetchLogs, fetchEvents]);

  // Auto-refresh for batch monitoring
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchBatchStatus();
      fetchLogs();
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchBatchStatus, fetchLogs]);

  // Handle retry single email
  const handleRetrySingle = async (logId: string) => {
    setRetryLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/emails/logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ log_ids: [logId] }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Queued for retry`);
        if (data.batch_id) {
          setActiveBatchId(data.batch_id);
          setAutoRefresh(true);
        }
        fetchLogs();
      } else {
        toast.error(data.message || 'Retry failed');
      }
    } catch {
      console.error('[ERROR] Failed to retry email');
      toast.error('Failed to retry email');
    } finally {
      setRetryLoading(false);
    }
  };

  // Handle retry selected
  const handleRetrySelected = async () => {
    if (selectedIds.size === 0) {
      toast.error('No emails selected');
      return;
    }

    setRetryLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/emails/logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ log_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Queued ${data.retried} email(s) for retry`);
        if (data.batch_id) {
          setActiveBatchId(data.batch_id);
          setAutoRefresh(true);
        }
        setSelectedIds(new Set());
        fetchLogs();
      } else {
        toast.error(data.message || 'Retry failed');
      }
    } catch {
      console.error('[ERROR] Failed to retry selected emails');
      toast.error('Failed to retry emails');
    } finally {
      setRetryLoading(false);
    }
  };

  // Handle retry all failed
  const handleRetryAllFailed = async () => {
    setRetryLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/emails/logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          retry_all_failed: true,
          event_id: eventFilter !== 'all' ? eventFilter : undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        if (data.retried === 0) {
          toast.success('No failed emails to retry');
        } else {
          toast.success(`Queued ${data.retried} email(s) for retry`);
          if (data.batch_id) {
            setActiveBatchId(data.batch_id);
            setAutoRefresh(true);
          }
        }
        fetchLogs();
      } else {
        toast.error(data.message || 'Retry failed');
      }
    } catch {
      console.error('[ERROR] Failed to retry all failed emails');
      toast.error('Failed to retry emails');
    } finally {
      setRetryLoading(false);
    }
  };

  // Export failed emails to CSV
  const exportFailedToCSV = () => {
    const failedLogs = logs.filter((l) => l.status === 'failed');
    if (failedLogs.length === 0) {
      toast.error('No failed emails to export');
      return;
    }

    const csv = [
      ['Email', 'Name', 'Event', 'Error', 'Attempts', 'Date'].join(','),
      ...failedLogs.map((l) =>
        [
          l.recipient_email,
          `"${(l.recipient_name || '').replace(/"/g, '""')}"`,
          `"${(l.event_title || l.event_id || '').replace(/"/g, '""')}"`,
          `"${(l.error_message || '').replace(/"/g, '""')}"`,
          l.attempts,
          l.$createdAt,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `failed-emails-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported failed emails');
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Select all failed on current page
  const selectAllFailed = () => {
    const failedIds = logs.filter((l) => l.status === 'failed').map((l) => l.$id);
    setSelectedIds(new Set(failedIds));
  };

  const failedOnPage = logs.filter((l) => l.status === 'failed').length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Mail className="w-6 h-6" />
              Email Dashboard
            </h1>
            <p className="text-gray-600 mt-1">Monitor and manage email delivery</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                autoRefresh
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {autoRefresh ? 'Live' : 'Auto-refresh'}
            </button>

            <button
              onClick={() => fetchLogs()}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Notice banner */}
        {notice && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 text-sm">{notice}</p>
              <p className="text-yellow-600 text-xs mt-1">
                Run: <code className="bg-yellow-100 px-1 rounded">npm run setup:email-logs</code> to create the collection.
              </p>
            </div>
          </div>
        )}

        {/* Batch Progress (when active) */}
        {batchStatus && autoRefresh && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-blue-900">
                Batch Progress: {batchStatus.batch_id}
              </span>
              <span className="text-sm text-blue-700">
                {batchStatus.progress || 0}% complete
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${batchStatus.progress || 0}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-sm text-blue-700">
              <span>Pending: {batchStatus.queue.pending}</span>
              <span>Processing: {batchStatus.queue.processing}</span>
              <span className="text-green-700">Completed: {batchStatus.queue.completed}</span>
              <span className="text-red-700">Failed: {batchStatus.queue.failed}</span>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <BarChart3 className="w-4 h-4" />
              Total
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
              <CheckCircle className="w-4 h-4" />
              Sent
            </div>
            <div className="text-2xl font-bold text-green-700">{stats.sent}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
              <XCircle className="w-4 h-4" />
              Failed
            </div>
            <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
              <Clock className="w-4 h-4" />
              Pending
            </div>
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border">
            <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
              <Send className="w-4 h-4" />
              Success Rate
            </div>
            <div className="text-2xl font-bold text-blue-700">{stats.successRate}%</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-4 border-b flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
                className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Quick filters */}
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>

              <select
                value={eventFilter}
                onChange={(e) => {
                  setEventFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Events</option>
                {events.map((event) => (
                  <option key={event.$id} value={event.$id}>
                    {event.title}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm ${
                  showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : ''
                }`}
              >
                <Filter className="w-4 h-4" />
                {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="p-4 bg-gray-50 border-b grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSearchQuery('');
                    setStatusFilter('all');
                    setEventFilter('all');
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}

          {/* Actions bar */}
          <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
                  <button
                    onClick={handleRetrySelected}
                    disabled={retryLoading}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {retryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Retry Selected
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </>
              )}
              {failedOnPage > 0 && selectedIds.size === 0 && (
                <button onClick={selectAllFailed} className="text-sm text-blue-600 hover:text-blue-800">
                  Select all failed ({failedOnPage})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRetryAllFailed}
                disabled={retryLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 disabled:opacity-50"
              >
                {retryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Retry All Failed
              </button>
              <button
                onClick={exportFailedToCSV}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                <Download className="w-4 h-4" />
                Export Failed CSV
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === logs.filter((l) => l.status === 'failed').length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          selectAllFailed();
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Recipient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Attempts
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                      <p className="mt-2 text-gray-500">Loading email logs...</p>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      No email logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const statusStyle = STATUS_STYLES[log.status] || STATUS_STYLES.pending;
                    const StatusIcon = statusStyle.icon;

                    return (
                      <tr key={log.$id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(log.$id)}
                            onChange={() => toggleSelect(log.$id)}
                            disabled={log.status !== 'failed'}
                            className="rounded border-gray-300 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{log.recipient_name || 'Unknown'}</div>
                          <div className="text-sm text-gray-500">{log.recipient_email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-900 truncate max-w-xs" title={log.subject}>
                            {log.subject}
                          </div>
                          {log.event_title && (
                            <div className="text-xs text-gray-500">{log.event_title}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {log.status}
                          </span>
                          {log.error_message && (
                            <div className="text-xs text-red-600 mt-1 truncate max-w-xs" title={log.error_message}>
                              {log.error_message}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{log.attempts}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(log.$createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          {log.status === 'failed' && (
                            <button
                              onClick={() => handleRetrySingle(log.$id)}
                              disabled={retryLoading}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {(currentPage - 1) * 50 + 1} to {Math.min(currentPage * 50, total)} of {total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm">
                  Page {currentPage} of {pages}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(pages, currentPage + 1))}
                  disabled={currentPage === pages}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
