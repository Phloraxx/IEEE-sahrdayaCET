import { useState, useEffect, useMemo } from "react";

import { Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDateCompact } from "@/lib/dates";
 

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  created: string;
  registrationsCount?: number;
}

export function UsersContent({ users: initialUsers }: { users: UserItem[] }) {
  const [users, setUsers] = useState<UserItem[]>(initialUsers);
  // Sync when data is refreshed from server
  useEffect(() => { setUsers(initialUsers); }, [initialUsers]);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);


  const filtered = useMemo(() => {
    let result = [...users];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q),
      );
    }
    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }
    return result;
  }, [users, searchQuery, roleFilter]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      const res = await fetch(`/api/admin/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      if (!res.ok) throw new Error("Failed to update role");
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    } finally {
      setUpdatingRole(null);
    }
  };


  if (filtered.length === 0) {
    const hasFilters = searchQuery.trim() || roleFilter !== "all";
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          {hasFilters ? (
            <>
              <Search className="mx-auto size-10 text-muted-foreground/40 mb-4" />
              <CardTitle className="text-lg mb-1">No matches</CardTitle>
              <CardDescription className="mb-6">
                No users match your filters.
              </CardDescription>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setRoleFilter("all");
                }}
              >
                Clear filters
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No users found.</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap gap-3 items-center px-6 py-5 border-b border-border bg-muted/20 rounded-t-[14px]">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="chair">Chair</option>
            <option value="user">User</option>
          </select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">
                Registrations
              </TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <Link
                    to="/admin/users/$id" params={{ id: u.id }}
                    className="flex items-center gap-2 no-underline text-inherit"
                  >
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs font-semibold bg-muted text-muted-foreground">
                        {(u.name || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm">
                        {u.name || "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={updatingRole === u.id}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
                    style={{
                      color:
                        u.role === "admin"
                          ? "hsl(var(--primary))"
                          : u.role === "chair"
                            ? "#b8860b"
                            : "hsl(var(--muted-foreground))",
                      borderColor:
                        u.role === "admin"
                          ? "hsl(var(--primary))"
                          : u.role === "chair"
                            ? "#b8860b"
                            : undefined,
                    }}
                  >
                    <option value="user">User</option>
                    <option value="chair">Chair</option>
                    <option value="admin">Admin</option>
                  </select>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                  {u.registrationsCount ?? "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                  {formatDateCompact(u.created || "")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
