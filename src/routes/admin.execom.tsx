import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserCheck } from "lucide-react";
import { PanelHeader } from "@/components/admin/panel-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";


export const Route = createFileRoute("/admin/execom")({
  component: AdminExecom,
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
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

function AdminExecom() {
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

  return (
    <div className="space-y-6">
      <PanelHeader
        eyebrow="Execom"
        title="Executive Committee"
        description={`${data?.total ?? 0} members`}
      />

      {isLoading ? (
        <ExecomSkeleton />
      ) : !data?.members.length ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <UserCheck className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            No execom members
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Position
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  Department
                </TableHead>
                <TableHead className="hidden md:table-cell">Batch</TableHead>
                <TableHead className="hidden lg:table-cell">Section</TableHead>
                <TableHead className="hidden sm:table-cell">Contact</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
