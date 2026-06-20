"use client";

import { useState } from "react";
import {
  CalendarIcon,
  MapPin,
  Eye,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EventItem {
  id: string;
  title: string;
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
  societyId: string;
}

interface Props {
  events: EventItem[];
  total: number;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function EventsTableClient({ events, total }: Props) {
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [societyFilter, setSocietyFilter] = useState("all");

  const filtered = events.filter((e) => {
    if (
      searchQuery.trim() &&
      !e.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !e.societyName?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (societyFilter !== "all" && e.societyName !== societyFilter)
      return false;
    return true;
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/events/${deleteId}`, { method: "DELETE" });
      window.location.reload();
    } catch {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const societies = [
    ...new Set(events.map((e) => e.societyName).filter(Boolean)),
  ];

  if (filtered.length === 0) {
    const isEmptySearch =
      searchQuery.trim().length > 0 ||
      statusFilter !== "all" ||
      societyFilter !== "all";
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          {isEmptySearch ? (
            <>
              <Search className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <CardTitle className="text-lg mb-1">No matches</CardTitle>
              <CardDescription className="mb-6">
                No events match your filters. Try a different search term.
              </CardDescription>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setSocietyFilter("all");
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <CalendarIcon className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <CardTitle className="text-lg mb-1">No events yet</CardTitle>
              <CardDescription className="mb-6">
                Create your first IEEE event to get started.
              </CardDescription>
              <Link to="/admin/events/new">
                <Button>Create Event</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3 items-center px-6 py-5 border-b border-border bg-muted/20 rounded-t-[14px]">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events..."
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
            >
              <option value="all">All status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={societyFilter}
              onChange={(e) => setSocietyFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
            >
              <option value="all">All societies</option>
              {societies.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
                <TableHead className="hidden sm:table-cell">Society</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((event) => {
                const pct =
                  event.maxCapacity > 0
                    ? Math.min(
                        (event.registeredCount / event.maxCapacity) * 100,
                        100,
                      )
                    : 0;
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Link
                        to={`/admin/events/${event.id}`}
                        className="no-underline text-inherit"
                      >
                        <div className="font-medium text-sm">{event.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <MapPin className="size-3 inline align-middle mr-0.5" />
                          {event.venue || "TBD"}
                          {event.isPaid && (
                            <span
                              className="font-mono text-xs ml-2"
                              style={{ color: "var(--success, #2e7d5e)" }}
                            >
                              ₹{event.price}
                            </span>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarIcon className="size-3.5" />
                        {formatDate(event.date)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {event.societyName || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            event.status === "published"
                              ? "default"
                              : event.status === "completed"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {event.status}
                        </Badge>
                        {event.registrationOpen && <Badge>Open</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="progress" style={{ flex: 1 }}>
                          <div
                            className="progress-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground">
                          {event.registeredCount}/{event.maxCapacity}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() =>
                            navigate({ to: `/admin/events/${event.id}` })
                          }
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() =>
                            navigate({ to: `/admin/events/${event.id}/edit` })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setDeleteId(event.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Summary */}
          {total > events.length && (
            <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground border-t border-border">
              <span>
                {searchQuery ||
                statusFilter !== "all" ||
                societyFilter !== "all"
                  ? `Found ${filtered.length} of ${total} events`
                  : `Showing ${events.length} of ${total} events`}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
            <DialogDescription>
              This will soft-delete the event and mark it as completed.
              Registrations will be preserved. This action can be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
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
    </>
  );
}
