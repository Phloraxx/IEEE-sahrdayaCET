import { createPB, escapeFilterValue } from "@/lib/pb";
import { getRequestHeader } from "@tanstack/react-start/server";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PB_AUTH_COOKIE } from "@/lib/constants";

export default async function SocietyDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const cookieHeader = getRequestHeader("cookie") || "";
  const pb = createPB(cookieHeader);

  try {
    const society = await pb.collection("societies").getOne(id);
    const s = society as Record<string, unknown>;

    // Fetch user names for chairs if any
    let chairUsers: { id: string; name: string; email: string }[] = [];
    if (Array.isArray(s.chairs) && (s.chairs as string[]).length > 0) {
      try {
        const users = await pb.collection("users").getFullList({
          filter: (s.chairs as string[])
            .map((cid) => `id=${escapeFilterValue(cid)}`)
            .join(" || "),
          fields: "id,name,email",
        });
        chairUsers = (users || []).map((u: Record<string, unknown>) => ({
          id: u.id as string,
          name: (u.name as string) || "Unknown",
          email: (u.email as string) || "",
        }));
      } catch {
        // Non-fatal
      }
    }

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/admin/societies"
              className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {s.name as string}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                /{s.slug as string}
              </p>
            </div>
          </div>
          <Link
            to={`/admin/societies/${s.id}/edit`}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Pencil className="size-4 mr-1.5" />
            Edit
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="card-hover">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="font-medium">{s.name as string}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Slug:</span>{" "}
                <span className="font-mono">{s.slug as string}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                {(s as any).isHidden ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 ml-2"
                  >
                    Hidden
                  </Badge>
                ) : (
                  <Badge className="text-[10px] px-1.5 py-0 ml-2">
                    Visible
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="card-hover">
            <CardHeader>
              <CardTitle className="text-base">Chairs</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {chairUsers.length > 0 ? (
                <div className="space-y-1.5">
                  {chairUsers.map((cu) => (
                    <div
                      key={cu.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium">{cu.name}</span>
                        {cu.email && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            {cu.email}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground font-mono text-[10px]">
                        {cu.id.slice(0, 8)}…
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">
                  No chairs assigned.
                </span>
              )}
            </CardContent>
          </Card>
        </div>

        {(s.bio as string) ? (
          <Card className="card-hover">
            <CardHeader>
              <CardTitle className="text-base">Bio</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {s.bio as string}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  } catch {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Society not found.
      </div>
    );
  }
}
