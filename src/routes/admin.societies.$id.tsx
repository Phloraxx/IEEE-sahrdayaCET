import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getPBWithRole } from "@/lib/admin-loader";
import { logError } from "@/lib/logger";
import { getField } from "@/lib/safe-get";
import { escapeFilterValue, buildFileUrl } from "@/lib/pb";
import { AuthError } from "@/lib/auth";
import { ArrowLeft, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ChairUser {
  id: string;
  name: string;
  email: string;
}

interface SocietyData {
  id: string;
  name: string;
  slug: string;
  bio: string;
  isHidden: boolean;
  logoUrl: string;
  bannerUrl: string;
  chairUsers: ChairUser[];
}

const getSocietyDetail = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const pb = await getPBWithRole(["admin", "chair"]);

    // Chair scope check — chairs can only view their own society
    const record = pb.authStore.record;
    const role = record?.role as string | undefined;
    if (role === 'chair') {
      const society = await pb.collection('societies').getOne(id, { fields: 'chairs' });
      const chairs = getField<string[]>(society, 'chairs', []);
      if (!chairs.includes(record!.id)) {
        throw new AuthError('Forbidden', 403);
      }
    }

    try {
      const society = await pb.collection("societies").getOne(id);
      let chairUsers: ChairUser[] = [];
      const chairIds = getField<string[]>(society, "chairs", []);
      if (chairIds.length > 0) {
        try {
          const users = await pb.collection("users").getFullList({
            filter: chairIds
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
          /* non-fatal */
        }
      }

      return {
        id: society.id,
        name: getField(society, "name", ""),
        slug: getField(society, "slug", ""),
        bio: getField(society, "bio", ""),
        isHidden: !!getField(society, "isHidden", false),
        logoUrl: getField(society, "logo", "")
          ? buildFileUrl("societies", society.id, getField(society, "logo", ""))
          : "",
        bannerUrl: getField(society, "banner", "")
          ? buildFileUrl("societies", society.id, getField(society, "banner", ""))
          : "",
        chairUsers,
      } satisfies SocietyData;
    } catch (e) {
      logError("admin-society-detail", e);
      return null;
    }
  });

export const Route = createFileRoute("/admin/societies/$id")({
  loader: async ({ params }) => getSocietyDetail({ data: params.id }),
  component: SocietyDetailPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function SocietyDetailPage() {
  const data = Route.useLoaderData();
  if (!data) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Society not found.
      </div>
    );
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
            <h1 className="text-2xl font-bold tracking-tight">{data.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">/{data.slug}</p>
          </div>
        </div>
        <Link
          to="/admin/societies/$id/edit" params={{ id: data.id }}
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
              <span className="font-medium">{data.name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Slug:</span>{" "}
              <span className="font-mono">{data.slug}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              {data.isHidden ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 ml-2"
                >
                  Hidden
                </Badge>
              ) : (
                <Badge className="text-[10px] px-1.5 py-0 ml-2">Visible</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="text-base">Chairs</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data.chairUsers.length > 0 ? (
              <div className="space-y-1.5">
                {data.chairUsers.map((cu) => (
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
              <span className="text-muted-foreground">No chairs assigned.</span>
            )}
          </CardContent>
        </Card>
      </div>

      {data.bio ? (
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="text-base">Bio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.bio}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
