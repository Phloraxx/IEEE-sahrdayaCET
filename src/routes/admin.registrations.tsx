import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ClipboardList, Eye, Search, UserCheck } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RegistrationDetailDialog } from "@/components/admin/registration-detail-dialog";


export const Route = createFileRoute("/admin/registrations")({
  component: AdminRegistrations,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive">Error</p>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{error?.message ?? "Something went wrong"}</h1>
        <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">Try again</button>
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
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function AdminRegistrations() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | undefined>(undefined);
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        description={`${data?.total ?? 0} total`}
      />

      <RegistrationDetailDialog
        open={Boolean(detailId)}
        onOpenChange={(o) => {
          if (!o) setDetailId(undefined);
        }}
        registrationId={detailId}
      />

      {/* Filters */}
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

      {/* Table */}
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden sm:table-cell">Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Payment</TableHead>
                <TableHead className="hidden md:table-cell text-right">
                  Amount
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.registrations.map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      {reg.userName}
                    </div>
                    <div className="text-xs text-muted-foreground md:hidden">
                      {reg.userEmail}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {reg.userEmail}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {reg.eventTitle || "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={reg.registrationStatus}
                      kind="registration"
                    />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge
                      status={reg.paymentStatus}
                      kind="payment"
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-sm tabular-nums">
                    {reg.amount > 0 ? `₹${reg.amount}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="View detail"
                        onClick={() => setDetailId(reg.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {!reg.checkedIn &&
                        reg.registrationStatus === "confirmed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={checkInMutation.isPending}
                            onClick={() => checkInMutation.mutate(reg.id)}
                          >
                            <UserCheck className="h-3 w-3" />
                            Check in
                          </Button>
                        )}
                      {reg.checkedIn && (
                        <span className="text-xs text-success">✓ In</span>
                      )}
                      {reg.registrationStatus !== "cancelled" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(reg.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
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
