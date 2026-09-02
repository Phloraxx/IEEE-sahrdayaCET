import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Calendar,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Search,
  Archive,
} from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { archiveAdminEvent, listAdminEvents, type AdminEventListItem, type AdminEventsResponse } from "@/lib/data/admin-events.client";
import { formatDateShort } from "@/lib/dates";
import { getPbClient } from "@/lib/pb-client";
import { streamAdminEventsCSV } from "@/lib/csv-export";
import { getWorkspaceMe } from "@/lib/data/workspace.client";
import { hasScopedWorkspaceCapability } from "@/lib/workspace-permissions";

function EventsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}


function formatDate(d: string): string {
  return d ? formatDateShort(d) || d : "—";
}
export default function AdminEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;
  const workspace = useQuery({ queryKey: ["workspace-me", user?.id], queryFn: getWorkspaceMe, enabled: Boolean(user?.id), staleTime: 30_000 });
  const branchWide = Boolean(workspace.data?.branchCapabilities.includes("events.view"));
  const allowedSocietyIds = branchWide ? undefined : Array.from(new Set((workspace.data?.assignments ?? []).filter((a) => a.active && a.scopeType === "society").map((a) => a.societyId).filter(Boolean)));
  const allowedEventIds = branchWide ? undefined : Array.from(new Set((workspace.data?.assignments ?? []).filter((a) => a.active && a.scopeType === "event").map((a) => a.eventId).filter(Boolean)));

  const { data, isLoading } = useQuery<AdminEventsResponse>({
    queryKey: ["admin-events", { search, status, page, allowedSocietyIds, allowedEventIds }],
    queryFn: () => listAdminEvents({ page, perPage, search, status, allowedSocietyIds, allowedEventIds }),
    enabled: Boolean(workspace.data),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveAdminEvent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (error) => {
      alert(error?.message ?? "Failed to archive event");
    },
  });


  const canCreate = Boolean(workspace.data?.capabilities.includes("events.create"));
  const exportEvents = async () => {
    const stream = await streamAdminEventsCSV(getPbClient());
    const blob = await new Response(stream).blob();
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `ieee-events-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Events"
        title="Manage Events"
        description={`${data?.total ?? 0} event${data?.total === 1 ? "" : "s"} in the catalogue.`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void exportEvents()}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            {canCreate && (
              <Button size="sm" className="gap-1.5" onClick={() => navigate("/admin/events/new")}>
                <Plus className="h-3.5 w-3.5" /> Create event
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <EventsSkeleton />
      ) : !data?.events.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No events found</p>
          <p className="text-xs text-muted-foreground">
            {search ? "Try a different search term." : "Create your first event."}
          </p>
        </div>
      ) : (
        <EventsList
          rows={data.events}
          canArchiveEvent={(event) => hasScopedWorkspaceCapability(workspace.data, "events.archive", { eventId: event.id, societyId: event.societyId })}
          onArchive={(id) => archiveMutation.mutate(id)}
          archivingPending={archiveMutation.isPending}
        />
      )}

      {data && data.total > perPage && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {data.page} of {Math.ceil(data.total / perPage)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {archiveMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Archiving…</span>
        </div>
      )}

    </div>
  );
}

interface EventsListProps {
  rows: AdminEventListItem[];
  canArchiveEvent: (event: AdminEventListItem) => boolean;
  onArchive: (id: string) => void;
  archivingPending: boolean;
}

function EventsList({
  rows,
  canArchiveEvent,
  onArchive,
  archivingPending,
}: EventsListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
      <div className="hidden grid-cols-[1.7fr_1fr_120px_120px_96px_72px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
        <span>Title</span>
        <span>Society</span>
        <span>Date</span>
        <span>Status</span>
        <span className="text-right">Regs</span>
        <span className="sr-only">Actions</span>
      </div>
      {rows.map((event) => (
        <div
          key={event.id}
          className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[1.7fr_1fr_120px_120px_96px_72px] md:items-center md:gap-4"
        >
          <div className="min-w-0">
            <Link
              to={`/admin/events/${event.id}`}
              className="text-sm font-medium text-foreground hover:underline line-clamp-1"
            >
              {event.title}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
              {event.societyName || "—"} · {formatDate(event.date)}
            </p>
          </div>
          <div className="text-xs text-muted-foreground line-clamp-1">
            {event.societyName || "—"}
          </div>
          <div className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDate(event.date)}
          </div>
          <div>
            <StatusBadge status={event.status} kind="event" />
          </div>
          <div className="font-mono text-sm tabular-nums md:text-right">
            <span className="md:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Regs ·{" "}
            </span>
            {event.registeredCount}
            {event.maxCapacity > 0 && (
              <span className="text-muted-foreground">/{event.maxCapacity}</span>
            )}
          </div>
          <div className="flex items-center justify-end gap-1">
            <Link to={`/admin/events/${event.id}`} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Open<ChevronRight className="h-3 w-3" /></Link>
            {canArchiveEvent(event) && ["draft", "completed", "cancelled"].includes(event.status) && <ConfirmButton
              label=""
              confirmMessage="Archive this event? It will be hidden from public listings but its historical records remain available."
              variant="destructive"
              icon={<Archive className="h-3.5 w-3.5" />}
              onConfirm={() => { onArchive(event.id); return true; }}
              disabled={archivingPending}
              className="h-8 w-8 p-0"
            />}
          </div>
        </div>
      ))}
    </div>
  );
}
