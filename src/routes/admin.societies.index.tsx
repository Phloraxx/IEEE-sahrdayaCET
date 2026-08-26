import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, Building2, ChevronRight, Loader2, Pencil, Plus, Search } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { getBioText } from "@/lib/safe-get";
import { cn } from "@/lib/utils";
import { archiveAdminSociety, listAdminSocieties } from "@/lib/data/admin-societies.client";
import { getWorkspaceMe } from "@/lib/data/workspace.client";

interface SocietyRow {
  id: string;
  name: string;
  slug: string;
  bio: string;
  isHidden: boolean;
  chairs: string[];
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
export default function AdminSocieties() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const [search, setSearch] = useState("");
  const workspace = useQuery({ queryKey: ["workspace-me", user?.id], queryFn: getWorkspaceMe, enabled: Boolean(user?.id), staleTime: 30_000 });
  const branchWide = Boolean(workspace.data?.branchCapabilities.includes("societies.view"));
  const allowedIds = branchWide ? undefined : Array.from(new Set((workspace.data?.assignments ?? []).filter((a) => a.active && a.scopeType === "society").map((a) => a.societyId).filter(Boolean)));
  const canEdit = Boolean(workspace.data?.capabilities.includes("societies.edit"));
  const isPlatformAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery<SocietiesResponse>({
    queryKey: ["admin-societies", { search, page, allowedIds }],
    queryFn: () => listAdminSocieties({ search, page, perPage: 40, allowedIds }),
    enabled: Boolean(workspace.data),
  });
  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page"); else next.set("page", String(nextPage));
    setSearchParams(next, { replace: true });
  };
  const archiveMutation = useMutation({
    mutationFn: archiveAdminSociety,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-societies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Societies"
        title="Manage Societies"
        description={`${data?.total ?? 0} societ${(data?.total ?? 0) === 1 ? "y" : "ies"} configured.`}
        actions={
          isPlatformAdmin ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate("/admin/societies/new" )}
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
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
        <SocietyList rows={data.societies} canEdit={canEdit} canArchive={isPlatformAdmin} onArchive={(id) => archiveMutation.mutate(id)} archivingPending={archiveMutation.isPending} />
      )}
      {data && data.total > data.perPage && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Page {data.page} · {data.total} societies</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</Button>
            <Button type="button" variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage(data.page + 1)}>Next</Button>
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

interface SocietyListProps {
  rows: SocietyRow[];
  canEdit: boolean;
  onArchive: (id: string) => void;
  archivingPending: boolean;
  canArchive: boolean;
}

function SocietyList({ rows, canEdit, canArchive, onArchive, archivingPending }: SocietyListProps) {
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
              to={`/admin/societies/${s.id}/edit`}
              className="text-sm font-medium text-foreground hover:underline"
            >
              {s.name}
            </Link>
            {s.bio && (
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground sm:max-w-2xl">
                {getBioText(s.bio)}
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
          <div className="flex justify-end gap-1">
            {canEdit ? (
              <>
                <Link
                  to={`/admin/societies/${s.id}/edit`}
                  aria-label={`Edit ${s.name}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                {canArchive && (
                  <ConfirmButton
                    label=""
                    confirmMessage={`Archive "${s.name}"? It will be hidden from public views but historical references remain intact.`}
                    variant="destructive"
                    icon={<Archive className="h-3.5 w-3.5" />}
                    onConfirm={() => {
                      onArchive(s.id);
                      return true;
                    }}
                    disabled={archivingPending}
                    className="h-8 w-8 p-0"
                  />
                )}
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
