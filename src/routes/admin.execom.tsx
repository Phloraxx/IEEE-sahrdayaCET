import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { ExecomFormDialog } from "@/components/admin/execom-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/execom")({
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
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
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
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

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

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Execom"
        title="Executive Committee"
        description={`${data?.total ?? 0} members`}
        actions={
          user?.role === "admin" ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEditingId(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add member
            </Button>
          ) : undefined
        }
      />

      <ExecomFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingId(undefined);
        }}
        memberId={editingId}
      />

      {isLoading ? (
        <ExecomSkeleton />
      ) : !data?.members.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <UserCheck className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            No execom members
          </p>
          {user?.role === "admin" && (
            <p className="text-xs text-muted-foreground">
              Click "Add member" to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Position</TableHead>
                <TableHead className="hidden md:table-cell">
                  Department
                </TableHead>
                <TableHead className="hidden md:table-cell">Batch</TableHead>
                <TableHead className="hidden lg:table-cell">Section</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {m.photo ? (
                        <img
                          src={m.photo}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-foreground">
                        {m.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {m.position}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {m.department || "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                    {m.batch || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {m.section || "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {m.email || m.phone || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {user?.role === "admin" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Edit member"
                          onClick={() => {
                            setEditingId(m.id);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <ConfirmButton
                          label=""
                          confirmMessage="Remove this member?"
                          variant="destructive"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onConfirm={() => {
                            deleteMutation.mutate(m.id);
                            return true;
                          }}
                          disabled={deleteMutation.isPending}
                          className="h-8 w-8 p-0"
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
