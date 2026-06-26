import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Pencil, Plus, Search } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SocietyFormDialog } from "@/components/admin/society-form-dialog";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/admin/societies")({
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
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function AdminSocieties() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

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
        description={`${data?.total ?? 0} societies`}
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
              Create society
            </Button>
          ) : undefined
        }
      />

      <SocietyFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingId(undefined);
        }}
        societyId={editingId}
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
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            No societies found
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Slug</TableHead>
                <TableHead className="hidden md:table-cell">Bio</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  Chairs
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.societies.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium text-foreground">
                    {s.name}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                    {s.slug}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-[300px] truncate">
                    {s.bio || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.isHidden ? "outline" : "secondary"}>
                      {s.isHidden ? "Hidden" : "Visible"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-sm tabular-nums">
                    {s.chairs.length}
                  </TableCell>
                  <TableCell className="text-right">
                    {user?.role === "admin" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit society"
                        onClick={() => {
                          setEditingId(s.id);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
