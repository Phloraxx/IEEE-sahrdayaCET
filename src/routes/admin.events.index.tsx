import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Calendar,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
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

export const Route = createFileRoute("/admin/events/")({
  component: AdminEvents,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">
          Error
        </p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">
          {error?.message ?? "Something went wrong"}
        </h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  ),
});

interface EventRow {
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

interface EventsResponse {
  events: EventRow[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

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
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}
function csrfToken(): string {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf="))
      ?.split("=")[1] ?? ""
  );
}

function AdminEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const { data, isLoading } = useQuery<EventsResponse>({
    queryKey: ["admin-events", { search, status, page }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/events?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load events");
      return res.json();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
      });
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });


  const canEdit = user?.role === "admin" || user?.role === "chair";

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Events"
        title="Manage Events"
        description={`${data?.total ?? 0} event${data?.total === 1 ? "" : "s"} in the catalogue.`}
        actions={
          canEdit ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate({ to: "/admin/events/new" })}
            >
              <Plus className="h-3.5 w-3.5" />
              Create event
            </Button>
          ) : undefined
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
          canEdit={canEdit}
          onDelete={(id) => deleteMutation.mutate(id)}
          deletingPending={deleteMutation.isPending}
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
      {deleteMutation.isPending && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Deleting…</span>
        </div>
      )}

    </div>
  );
}

interface EventsListProps {
  rows: EventRow[];
  canEdit: boolean;
  onDelete: (id: string) => void;
  deletingPending: boolean;
}

function EventsList({
  rows,
  canEdit,
  onDelete,
  deletingPending,
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
              to="/admin/events/$id/edit"
              params={{ id: event.id }}
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
            {canEdit ? (
              <>
                <Link
                  to="/admin/events/$id/edit"
                  params={{ id: event.id }}
                  aria-label="Edit event"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <ConfirmButton
                  label=""
                  confirmMessage="Delete this event?"
                  variant="destructive"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onConfirm={() => {
                    onDelete(event.id);
                    return true;
                  }}
                  disabled={deletingPending}
                  className="h-8 w-8 p-0"
                />
              </>
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
