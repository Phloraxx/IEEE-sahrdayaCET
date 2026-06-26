import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, ChevronRight, Pencil, Plus, Search } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/societies/")({
  component: AdminSocieties,
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

interface SocietyRow {
  id: string;
  name: string;
  slug: string;
  bio: string;
  isHidden: boolean;
  chairs: string[];
  eventsCount: number;
}

interface SocietiesResponse {
  societies: SocietyRow[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

function SocietiesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

function AdminSocieties() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<SocietiesResponse>({
    queryKey: ["admin-societies", { search }],
    queryFn: async () => {
      const params = new URLSearchParams({ perPage: "100" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/societies?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load societies");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Societies"
        title="Manage Societies"
        description={`${data?.total ?? 0} societ${(data?.total ?? 0) === 1 ? "y" : "ies"} configured.`}
        actions={
          user?.role === "admin" ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate({ to: "/admin/societies/new" })}
            >
              <Plus className="h-3.5 w-3.5" />
              Create society
            </Button>
          ) : undefined
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search societies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <SocietiesSkeleton />
      ) : !data?.societies.length ? (
        <EmptyState
          icon={Building2}
          title="No societies found"
          hint={
            search
              ? "Try a different search term."
              : "Get started by creating the first society."
          }
        />
      ) : (
        <SocietyList rows={data.societies} canEdit={user?.role === "admin"} />
      )}
    </div>
  );
}

interface SocietyListProps {
  rows: SocietyRow[];
  canEdit: boolean;
}

function SocietyList({ rows, canEdit }: SocietyListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
      <div className="hidden grid-cols-[1fr_120px_88px_72px_56px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
        <span>Name</span>
        <span>Slug</span>
        <span className="text-right">Chairs</span>
        <span className="text-right">Visibility</span>
        <span className="sr-only">Actions</span>
      </div>
      {rows.map((s) => (
        <div
          key={s.id}
          className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[1fr_120px_88px_72px_56px] sm:items-center sm:gap-4"
        >
          <div className="min-w-0">
            <Link
              to="/admin/societies/$id/edit"
              params={{ id: s.id }}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {s.name}
            </Link>
            {s.bio && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:max-w-2xl">
                {s.bio}
              </p>
            )}
          </div>
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span className="sm:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Slug ·{" "}
            </span>
            {s.slug}
          </div>
          <div className="font-mono text-sm font-semibold tabular-nums sm:text-right">
            <span className="sm:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Chairs ·{" "}
            </span>
            {s.chairs.length}
          </div>
          <div className="sm:text-right">
            <span
              className={cn(
                "vh-pill",
                s.isHidden
                  ? "text-muted-foreground"
                  : "text-success",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  s.isHidden ? "bg-muted-foreground" : "bg-success",
                )}
              />
              {s.isHidden ? "Hidden" : "Visible"}
            </span>
          </div>
          <div className="flex justify-end">
            {canEdit ? (
              <Link
                to="/admin/societies/$id/edit"
                params={{ id: s.id }}
                aria-label={`Edit ${s.name}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}

function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
