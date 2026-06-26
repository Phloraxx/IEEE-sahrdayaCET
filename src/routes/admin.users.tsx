import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
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

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  created: string;
  registrationsCount: number;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  hasMore: boolean;
}

const ROLE_BADGE: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  admin: "default",
  chair: "secondary",
  user: "outline",
};

function UsersSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
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

function AdminUsers() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ["admin-users", { search }],
    queryFn: async () => {
      const params = new URLSearchParams({ perPage: "200" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ id, role }),
      });
      if (!res.ok) throw new Error("Failed to update role");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Users"
        title="Manage Users"
        description={`${data?.total ?? 0} registered user${data?.total === 1 ? "" : "s"}.`}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <UsersSkeleton />
      ) : !data?.users.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <Users className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No users found</p>
        </div>
      ) : (
        <UserList
          rows={data.users}
          currentUserId={currentUser?.id}
          isAdmin={currentUser?.role === "admin"}
          onRoleChange={(id, role) => roleMutation.mutate({ id, role })}
        />
      )}
    </div>
  );
}

interface UserListProps {
  rows: UserRow[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  onRoleChange: (id: string, role: string) => void;
}

function UserList({
  rows,
  currentUserId,
  isAdmin,
  onRoleChange,
}: UserListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
      <div className="hidden grid-cols-[1.6fr_1.4fr_120px_120px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span>Joined</span>
      </div>
      {rows.map((u) => {
        const canEditRole = isAdmin && u.id !== currentUserId;
        return (
          <div
            key={u.id}
            className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[1.6fr_1.4fr_120px_120px] md:items-center md:gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              {u.avatar ? (
                <img
                  src={u.avatar}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {(u.name || u.email).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground line-clamp-1">
                  {u.name || "—"}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1 md:hidden">
                  {u.email}
                </p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground line-clamp-1">
              {u.email}
            </div>
            <div>
              {canEditRole ? (
                <Select
                  value={u.role}
                  onValueChange={(role) => onRoleChange(u.id, role)}
                >
                  <SelectTrigger className="h-7 w-[100px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="chair">Chair</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant={ROLE_BADGE[u.role] ?? "outline"}>
                  {u.role}
                </Badge>
              )}
            </div>
            <div className="font-mono text-xs tabular-nums text-muted-foreground">
              <span className="md:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                Joined ·{" "}
              </span>
              {formatDate(u.created)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
