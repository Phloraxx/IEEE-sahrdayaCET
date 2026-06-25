"use client";

import { Search , CalendarIcon } from "lucide-react";
import { useState, useMemo } from "react";

import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateCompact, formatTime } from "@/lib/dates";
 

import type { Registration } from "@/types";
type RegItem = Pick<Registration, 'id' | 'userName' | 'userEmail' | 'userPhone' | 'registrationStatus' | 'paymentStatus' | 'checkedIn' | 'checkedInAt' | 'ticketId' | 'amount' | 'createdAt' | 'eventTitle' | 'eventId'>;

interface Props {
  registrations: RegItem[];
  total: number;
  events?: { id: string; title: string }[];
}



export function RegistrationsClient({ registrations, total, events }: Props) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  const filtered = useMemo(() => {
    let result = [...registrations];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q) ||
          r.eventTitle?.toLowerCase().includes(q),
      );
    }
    if (eventFilter !== "all") {
      result = result.filter((r) => r.eventId === eventFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((r) => r.registrationStatus === statusFilter);
    }
    if (paymentFilter === "paid") {
      result = result.filter((r) => r.paymentStatus === "paid");
    } else if (paymentFilter === "pending") {
      result = result.filter((r) => r.paymentStatus === "pending");
    } else if (paymentFilter === "free") {
      result = result.filter((r) => r.paymentStatus === "not_required");
    }
    return result;
  }, [registrations, searchQuery, eventFilter, statusFilter, paymentFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const applyFilter = (setter: (v: string) => void, val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  if (filtered.length === 0) {
    const hasFilters =
      searchQuery.trim().length > 0 ||
      eventFilter !== "all" ||
      statusFilter !== "all" ||
      paymentFilter !== "all";
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          {hasFilters ? (
            <>
              <Search className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <CardTitle className="text-lg mb-1">No matches</CardTitle>
              <CardDescription className="mb-6">
                No registrations match your filters.
              </CardDescription>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setEventFilter("all");
                  setStatusFilter("all");
                  setPaymentFilter("all");
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <CalendarIcon className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <CardTitle className="text-lg mb-1">
                No registrations yet
              </CardTitle>
              <CardDescription>
                Registrations will appear here once users sign up for events.
              </CardDescription>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        {/* Search + Filters */}
        <div className="flex flex-wrap gap-3 items-center px-6 py-5 border-b border-border bg-muted/20 rounded-t-[14px]">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => applyFilter(setSearchQuery, e.target.value)}
              placeholder="Search by name, email, or event..."
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => applyFilter(setSearchQuery, "")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          {events && events.length > 0 && (
            <select
              value={eventFilter}
              onChange={(e) => applyFilter(setEventFilter, e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
            >
              <option value="all">All events</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => applyFilter(setStatusFilter, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="all">All status</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => applyFilter(setPaymentFilter, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="all">All payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="free">Free</option>
          </select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden md:table-cell">Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Payment</TableHead>
              <TableHead className="hidden md:table-cell">Checked In</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((reg) => (
              <TableRow
                key={reg.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({ to: "/admin/registrations/$id", params: { id: reg.id } })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate({ to: "/admin/registrations/$id", params: { id: reg.id } });
                }}
                tabIndex={0}
                role="link"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs font-semibold bg-muted text-muted-foreground">
                        {reg.userName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">{reg.userName}</div>
                      <div className="text-xs text-muted-foreground">
                        {reg.userEmail}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                  {reg.eventTitle || "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={reg.registrationStatus} kind="registration" />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <StatusBadge status={reg.paymentStatus} kind="payment" />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {reg.checkedIn ? (
                    <Badge variant="secondary">Yes</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-xs text-muted-foreground">
                  {reg.createdAt ? `${formatDateCompact(reg.createdAt)}, ${formatTime(reg.createdAt)}` : "—"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Pagination — only show when more than one page */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground border-t border-border">
            <span>
              {searchQuery ||
              eventFilter !== "all" ||
              statusFilter !== "all" ||
              paymentFilter !== "all"
                ? `Found ${filtered.length} of ${total} registrations`
                : `Showing ${paginated.length} of ${total} registrations`}
            </span>
            <div className="ml-auto flex gap-1 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
