import { useState, useEffect } from "react";

import { Plus, Search, Trash2, Pencil } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";


interface ExecomMember {
  id: string;
  name: string;
  position: string;
  department: string;
  batch: string;
  section: string;
  order: number;
  expand?: { society?: { name: string } };
}

export default function ExecomPage({ members: initialMembers }: { members: ExecomMember[] }) {
  const navigate = useNavigate();
  const [members, setMembers] = useState<ExecomMember[]>(initialMembers);
  // Sync when data is refreshed from server
  useEffect(() => { setMembers(initialMembers); }, [initialMembers]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);


  const filtered = searchQuery.trim()
    ? members.filter(
        (m) =>
          m.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.department?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : members;

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/execom/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      setMembers((prev) => prev.filter((m) => m.id !== deleteId));
      toast.success("Member deleted");
    } catch {
      toast.error("Failed to delete");
    }
    setDeleting(false);
    setDeleteId(null);
  };

  const applyFilter = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };


  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Execom</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length} members
          </p>
        </div>
        <Link
          to="/admin/execom/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 px-4 py-2 text-sm font-medium transition-all"
        >
          <Plus className="size-4 mr-2" /> Add Member
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-3 p-4 border-b border-border/50">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => applyFilter(e.target.value)}
                placeholder="Search by name, position, or department..."
                className="pl-9"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {searchQuery
                ? "No members match your search."
                : "No execom members yet."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
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
                      <TableHead className="hidden md:table-cell">
                        Society
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {m.department || ""} {m.batch ? `· ${m.batch}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {m.position}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {m.department || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {m.expand?.society?.name || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() =>
                                navigate({ to: `/admin/execom/${m.id}/edit` })
                              }
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => setDeleteId(m.id)}
                            >
                              <Trash2 className="size-3.5 text-destructive/70" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground border-t border-border">
                  <span>
                    Showing {(currentPage - 1) * perPage + 1}–
                    {Math.min(currentPage * perPage, filtered.length)} of{" "}
                    {filtered.length}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Prev
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const start = Math.max(1, currentPage - 2);
                      const p = start + i;
                      if (p > totalPages) return null;
                      return (
                        <Button
                          key={p}
                          variant={p === currentPage ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(p)}
                        >
                          {p}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Member</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this execom member?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
