"use client";

import { useState, useMemo } from "react";
import { Search, Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";

interface SocietyItem {
  id: string;
  name: string;
  slug: string;
  isHidden: boolean;
  chairs: string[];
  eventsCount?: number;
}

export function SocietiesContent({ societies: initialSocieties }: { societies: SocietyItem[] }) {
  const navigate = useNavigate();
  const [societies] = useState<SocietyItem[]>(initialSocieties);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("all");

  const filtered = useMemo(() => {
    let result = [...societies];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
      );
    }
    if (visibilityFilter === "visible")
      result = result.filter((s) => !s.isHidden);
    else if (visibilityFilter === "hidden")
      result = result.filter((s) => s.isHidden);
    return result;
  }, [societies, searchQuery, visibilityFilter]);

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
              placeholder="Search societies..."
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
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring/50"
          >
            <option value="all">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No societies found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Chairs</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({ to: "/admin/societies/$id/edit", params: { id: s.id } })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate({ to: "/admin/societies/$id/edit", params: { id: s.id } });
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <TableCell>
                    <Link
                      to="/admin/societies/$id/edit" params={{ id: s.id }}
                      className="font-medium no-underline text-inherit"
                    >
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {s.slug}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {Array.isArray(s.chairs) ? s.chairs.length : 0} chairs
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.eventsCount ?? "—"}
                  </TableCell>
                  <TableCell>
                    {s.isHidden ? (
                      <Badge
                        variant="outline"
                        className="inline-flex items-center gap-1"
                      >
                        <EyeOff className="size-3" /> Hidden
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="inline-flex items-center gap-1"
                      >
                        <Eye className="size-3" /> Visible
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
