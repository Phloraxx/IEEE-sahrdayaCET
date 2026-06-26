import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  Eye,
  Search,
  UserCheck,
} from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/registrations/")({
  component: AdminRegistrations,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">
          Error
        </p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">
          {error?.message ?? "Something went wrong"}
        </h1>
      </div>
    </div>
  ),
});

interface RegistrationRow {
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
  eventTitle: string;
  eventId: string;
}

interface RegistrationsResponse {
  registrations: RegistrationRow[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

function RegistrationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
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

function AdminRegistrations() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const perPage = 30;

  const { data, isLoading } = useQuery<RegistrationsResponse>({
    queryKey: ["admin-registrations", { search, status, page }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
      });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/registrations?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load registrations");
      return res.json();
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({ checkedIn: true }),
      });
      if (!res.ok) throw new Error("Failed to check in");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/registrations/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
        body: JSON.stringify({ registrationStatus: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Registrations"
        title="Manage Registrations"
        description={`${data?.total ?? 0} registration${data?.total === 1 ? "" : "s"} across all events.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name…"
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
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <RegistrationsSkeleton />
      ) : !data?.registrations.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            No registrations found
          </p>
          <p className="text-xs text-muted-foreground">
            {search ? "Try a different search term." : "No registrations yet."}
          </p>
        </div>
      ) : (
        <RegistrationsList
          rows={data.registrations}
          onCheckIn={(id) => checkInMutation.mutate(id)}
          onCancel={(id) => cancelMutation.mutate(id)}
          checkInPending={checkInMutation.isPending}
          cancelPending={cancelMutation.isPending}
        />
      )}

      {data && data.hasMore && (
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
    </div>
  );
}

interface RegistrationsListProps {
  rows: RegistrationRow[];
  onCheckIn: (id: string) => void;
  onCancel: (id: string) => void;
  checkInPending: boolean;
  cancelPending: boolean;
}

function RegistrationsList({
  rows,
  onCheckIn,
  onCancel,
  checkInPending,
  cancelPending,
}: RegistrationsListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
      <div className="hidden grid-cols-[1.6fr_1.2fr_120px_120px_100px_180px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
        <span>Attendee</span>
        <span>Event</span>
        <span>Status</span>
        <span>Payment</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((reg) => (
        <div
          key={reg.id}
          className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[1.6fr_1.2fr_120px_120px_100px_180px] md:items-center md:gap-4"
        >
          <div className="min-w-0">
            <Link
              to="/admin/registrations/$id"
              params={{ id: reg.id }}
              className="text-sm font-medium text-foreground hover:underline line-clamp-1"
            >
              {reg.userName || "—"}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {reg.userEmail}
            </p>
          </div>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {reg.eventTitle || "—"}
          </div>
          <div>
            <StatusBadge status={reg.registrationStatus} kind="registration" />
          </div>
          <div>
            <StatusBadge status={reg.paymentStatus} kind="payment" />
          </div>
          <div className="font-mono text-sm tabular-nums md:text-right">
            <span className="md:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Amount ·{" "}
            </span>
            {reg.amount > 0 ? `₹${reg.amount}` : "—"}
          </div>
          <div className="flex items-center justify-end gap-1">
            <Link
              to="/admin/registrations/$id"
              params={{ id: reg.id }}
              aria-label="View registration"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Eye className="h-3.5 w-3.5" />
            </Link>
            {!reg.checkedIn && reg.registrationStatus === "confirmed" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={checkInPending}
                onClick={() => onCheckIn(reg.id)}
              >
                <UserCheck className="h-3 w-3" />
                Check in
              </Button>
            )}
            {reg.checkedIn && (
              <span className="text-xs font-medium text-success">✓ In</span>
            )}
            {reg.registrationStatus !== "cancelled" &&
              !reg.checkedIn && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive"
                  disabled={cancelPending}
                  onClick={() => onCancel(reg.id)}
                >
                  Cancel
                </Button>
              )}
            {reg.registrationStatus === "cancelled" && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
