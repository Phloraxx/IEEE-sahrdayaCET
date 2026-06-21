"use client";

import { useState, useMemo } from "react";
import {
  ArrowLeft,
  CalendarIcon,
  MapPin,
  Download,
  Trash2,
  Search,
  CheckCheck,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventData {
  id: string;
  title: string;
  description: string;
  date: string;
  endDate: string;
  venue: string;
  price: number;
  status: string;
  registrationOpen: boolean;
  maxCapacity: number;
  registeredCount: number;
  checkedInCount: number;
  isPaid: boolean;
  societyName: string;
  registrationDeadline: string;
  contactEmail: string;
  contactPhone: string;
}

interface RegistrationItem {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  paymentStatus: string;
  checkedIn: boolean;
  checkedInAt: string;
  ticketId: string;
  amount: number;
  createdAt: string;
}

interface Props {
  event: EventData;
  registrations: RegistrationItem[];
}

function statusBadge(status: string) {
  switch (status) {
    case "published":
      return <Badge>Published</Badge>;
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    case "completed":
      return <Badge variant="secondary">Completed</Badge>;
    case "confirmed":
      return <Badge variant="secondary">Confirmed</Badge>;
    case "pending":
      return (
        <Badge variant="outline" className="border-amber-400 text-amber-700">
          Pending
        </Badge>
      );
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    case "paid":
      return <Badge variant="secondary">Paid</Badge>;
    case "not_required":
      return <Badge variant="outline">Free</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "refunded":
      return <Badge variant="outline">Refunded</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function fmtDateTime(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EventDetailClient({ event, registrations }: Props) {
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [checkinFilter, setCheckinFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  const confirmed = registrations.filter(
    (r) => r.registrationStatus === "confirmed",
  );
  const checkedInRegs = registrations.filter((r) => r.checkedIn);
  const pct =
    registrations.length > 0
      ? (confirmed.length / registrations.length) * 100
      : 0;
  const checkinRate =
    confirmed.length > 0
      ? Math.round((checkedInRegs.length / confirmed.length) * 100)
      : 0;

  const filtered = useMemo(() => {
    let result = [...registrations];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.userName.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all")
      result = result.filter((r) => r.registrationStatus === statusFilter);
    if (checkinFilter === "checked-in")
      result = result.filter((r) => r.checkedIn);
    else if (checkinFilter === "not-checked-in")
      result = result.filter((r) => !r.checkedIn);
    return result;
  }, [registrations, searchQuery, statusFilter, checkinFilter]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/admin/events/${event.id}`, { method: "DELETE" });
    toast.success("Event deleted");
    navigate({ to: "/admin/events" });
  };

  const handleToggleRegistration = async () => {
    setToggling(true);
    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationOpen: !event.registrationOpen }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to toggle registration");
      } else {
        toast.success(
          event.registrationOpen
            ? "Registration closed"
            : "Registration opened",
        );
      }
      window.location.reload();
    } catch {
      toast.error("Failed to toggle registration");
      window.location.reload();
    } finally {
      setToggling(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map((r) => r.id)));
    }
  };

  const handleBatchCheckIn = async () => {
    if (selected.size === 0) return;
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          fetch(`/api/admin/registrations/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ checkedIn: true }),
          }).catch(() => {}),
        ),
      );
      toast.success(`${selected.size} checked in`);
      setSelected(new Set());
      window.location.reload();
    } catch {
      toast.error("Batch check-in failed");
    }
  };

  const handleExportCSV = () => {
    window.open(`/api/admin/events/${event.id}/registrations.csv`, "_blank");
  };

  const applyFilter = (setter: (val: string) => void, val: string) => {
    setter(val);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/events">
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                {event.title}
              </h1>
              {statusBadge(event.status)}
              {event.registrationOpen && <Badge>Open</Badge>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              <CalendarIcon className="size-3.5 inline align-middle mr-0.5" />
              {formatDate(event.date)}
              {event.venue ? (
                <>
                  {" "}
                  · <MapPin className="size-3.5 inline align-middle mr-0.5" />
                  {event.venue}
                </>
              ) : (
                ""
              )}
              {event.societyName ? <> · {event.societyName}</> : ""}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleRegistration}
            disabled={toggling}
          >
            {event.registrationOpen ? "Close Reg" : "Open Reg"}
          </Button>
          <Link to="/admin/events/$id/edit" params={{ id: event.id }}>
            <Button variant="outline" size="sm">
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={deleting}
          >
            <Trash2 className="size-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-[2.5rem] sm:grid-cols-2 lg:grid-cols-4">
        <Card className="stat-card-hover animate-fade-in delay-1">
          <CardHeader className="p-[1.75rem] pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Registrations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-[1.75rem] pt-0">
            <div className="font-serif text-[1.75rem] leading-tight">
              {event.registeredCount.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              of {event.maxCapacity || "∞"} capacity
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card-hover animate-fade-in delay-2">
          <CardHeader className="p-[1.75rem] pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Confirmed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-[1.75rem] pt-0">
            <div className="font-serif text-[1.75rem] leading-tight">
              {confirmed.length.toLocaleString("en-IN")}
            </div>
            <div className="mt-2 progress">
              <div
                className="progress-fill"
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="stat-card-hover animate-fade-in delay-3">
          <CardHeader className="p-[1.75rem] pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Checked In
            </CardTitle>
          </CardHeader>
          <CardContent className="p-[1.75rem] pt-0">
            <div className="font-serif text-[1.75rem] leading-tight">
              {checkedInRegs.length.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              {checkinRate}% check-in rate
            </p>
          </CardContent>
        </Card>
        <Card className="stat-card-hover animate-fade-in delay-4">
          <CardHeader className="p-4 pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="font-serif text-[1.75rem] leading-tight">
              {registrations
                .filter((r) => r.registrationStatus === "pending")
                .length.toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-muted-foreground">
              awaiting confirmation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="registrations">
        <TabsList>
          <TabsTrigger value="registrations">
            Registrations ({registrations.length})
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations" className="mt-0">
          <Card>
            <CardContent className="p-0">
              {/* Search & Filters */}
              <div className="flex flex-wrap gap-3 items-center px-6 py-5 border-b border-border bg-muted/20 rounded-t-[14px]">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by name or email..."
                    className="pl-9"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCurrentPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => applyFilter(setStatusFilter, e.target.value)}
                  className="h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                >
                  <option value="all">All status</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  value={checkinFilter}
                  onChange={(e) =>
                    applyFilter(setCheckinFilter, e.target.value)
                  }
                  className="h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                >
                  <option value="all">All check-in</option>
                  <option value="checked-in">Checked in</option>
                  <option value="not-checked-in">Not checked in</option>
                </select>
                {selected.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBatchCheckIn}
                    className="border-green-500 text-green-700 bg-green-50 hover:bg-green-100"
                  >
                    <CheckCheck className="size-3.5 mr-1" />
                    Check in ({selected.size})
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="size-3.5 mr-1" />
                  Export
                </Button>
              </div>

              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {searchQuery ||
                  statusFilter !== "all" ||
                  checkinFilter !== "all"
                    ? "No registrations match your filters."
                    : "No registrations yet."}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <input
                            type="checkbox"
                            checked={
                              selected.size === paginated.length &&
                              paginated.length > 0
                            }
                            onChange={toggleSelectAll}
                            className="rounded border-input"
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Email
                        </TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Phone
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          Payment
                        </TableHead>
                        <TableHead className="text-right">Checked In</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((r) => {
                        const initials = r.userName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2);
                        return (
                          <TableRow
                            key={r.id}
                            className={r.checkedIn ? "bg-accent/5" : ""}
                          >
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selected.has(r.id)}
                                onChange={() => toggleSelect(r.id)}
                                className="rounded border-input"
                              />
                            </TableCell>
                            <TableCell>
                              <Link
                                to="/admin/registrations/$id" params={{ id: r.id }}
                                className="no-underline text-inherit"
                              >
                                <span className="font-medium text-sm">
                                  {r.userName}
                                </span>
                                <div className="text-xs text-muted-foreground">
                                  {r.userEmail}
                                </div>
                              </Link>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {r.userEmail}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {r.userPhone || "—"}
                            </TableCell>
                            <TableCell>
                              {statusBadge(r.registrationStatus)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {statusBadge(r.paymentStatus)}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.checkedIn ? (
                                <Badge variant="secondary">Yes</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground border-t border-border">
                      <span>
                        Showing {(currentPage - 1) * perPage + 1}–
                        {Math.min(currentPage * perPage, filtered.length)} of{" "}
                        {filtered.length}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentPage((p) => Math.max(1, p - 1))
                          }
                          disabled={currentPage === 1}
                        >
                          Prev
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-foreground text-background hover:bg-foreground hover:text-background"
                        >
                          {currentPage}
                        </Button>
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
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event Info</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Description</span>
                  <span className="text-right max-w-[60%]">
                    {event.description || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span>{fmtDateTime(event.date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End</span>
                  <span>{fmtDateTime(event.endDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Venue</span>
                  <span>{event.venue || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Society</span>
                  <span>{event.societyName || "—"}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Registration Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-mono">
                    {event.isPaid ? `₹${event.price}` : "Free"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capacity</span>
                  <span>{event.maxCapacity || "Unlimited"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Registration</span>
                  <span>{event.registrationOpen ? "Open" : "Closed"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deadline</span>
                  <span>{fmtDateTime(event.registrationDeadline)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{event.contactEmail || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phone</span>
                  <span>{event.contactPhone || "—"}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              This will soft-delete the event and mark it as completed. This
              action can be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
