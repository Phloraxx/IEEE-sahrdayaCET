import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/execom/")({
  component: AdminExecom,
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

interface ExecomMember {
  id: string;
  name: string;
  position: string;
  department: string;
  batch: string;
  section: string;
  sectionId: string;
  order: number;
  photo: string;
  linkedin: string;
  instagram: string;
  email: string;
  phone: string;
  society: string;
  created: string;
  updated: string;
  expand?: { society?: { id: string; name: string } };
}

interface ExecomResponse {
  members: ExecomMember[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

function ExecomSkeleton() {
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

function AdminExecom() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ExecomResponse>({
    queryKey: ["admin-execom"],
    queryFn: async () => {
      const res = await fetch("/api/admin/execom?perPage=200", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load execom");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/execom/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken(),
        },
      });
      if (!res.ok) throw new Error("Failed to delete member");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-execom"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Execom"
        title="Executive Committee"
        description={`${data?.total ?? 0} committee member${data?.total === 1 ? "" : "s"} listed.`}
        actions={
          isAdmin ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate({ to: "/admin/execom/new" })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add member
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <ExecomSkeleton />
      ) : !data?.members.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <UserCheck className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No execom members</p>
          {isAdmin && (
            <p className="text-xs text-muted-foreground">
              Click "Add member" to get started.
            </p>
          )}
        </div>
      ) : (
        <ExecomList
          rows={data.members}
          canEdit={isAdmin}
          onDelete={(id) => deleteMutation.mutate(id)}
          deletingPending={deleteMutation.isPending}
        />
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

interface ExecomListProps {
  rows: ExecomMember[];
  canEdit: boolean;
  onDelete: (id: string) => void;
  deletingPending: boolean;
}

function ExecomList({
  rows,
  canEdit,
  onDelete,
  deletingPending,
}: ExecomListProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card divide-y divide-border">
      <div className="hidden grid-cols-[1.5fr_1fr_88px_72px_120px_72px] gap-4 px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:grid">
        <span>Name</span>
        <span>Position</span>
        <span>Dept</span>
        <span>Batch</span>
        <span>Contact</span>
        <span className="sr-only">Actions</span>
      </div>
      {rows.map((m) => (
        <div
          key={m.id}
          className="grid grid-cols-1 gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[1.5fr_1fr_88px_72px_120px_72px] md:items-center md:gap-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            {m.photo ? (
              <img
                src={m.photo}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {m.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              {canEdit ? (
                <Link
                  to="/admin/execom/$id/edit"
                  params={{ id: m.id }}
                  className="text-sm font-medium text-foreground hover:underline line-clamp-1"
                >
                  {m.name}
                </Link>
              ) : (
                <span className="text-sm font-medium text-foreground line-clamp-1">
                  {m.name}
                </span>
              )}
              <p className="text-xs text-muted-foreground line-clamp-1 md:hidden">
                {m.position}
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground line-clamp-1">
            {m.position}
          </div>
          <div className="text-sm text-muted-foreground">
            <span className="md:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Dept ·{" "}
            </span>
            {m.department || "—"}
          </div>
          <div className="font-mono text-xs tabular-nums text-muted-foreground">
            <span className="md:hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              Batch ·{" "}
            </span>
            {m.batch || "—"}
          </div>
          <div className="text-xs text-muted-foreground line-clamp-1">
            {m.email || m.phone || "—"}
          </div>
          <div className="flex items-center justify-end gap-1">
            {canEdit ? (
              <>
                <Link
                  to="/admin/execom/$id/edit"
                  params={{ id: m.id }}
                  aria-label="Edit member"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <ConfirmButton
                  label=""
                  confirmMessage="Remove this member?"
                  variant="destructive"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onConfirm={() => {
                    onDelete(m.id);
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
