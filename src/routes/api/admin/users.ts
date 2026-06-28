import { createFileRoute } from "@tanstack/react-router";
import { createPB, escapeFilterValue } from "@/lib/pb";
import { requireRole } from "@/lib/auth";
import { handleError } from "@/lib/api-error";
import { parsePagination } from "@/lib/route-helpers";
import { UserUpdateSchema } from "@/schemas/users";
import { verifySameOrigin } from "@/lib/verify-same-origin";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const pb = createPB(request.headers.get("cookie") || undefined);
          await requireRole(["admin"], pb);
          const url = new URL(request.url);
          const { page, perPage } = parsePagination(url, {
            defaultPerPage: 200,
            maxPerPage: 500,
          });
          const search = url.searchParams.get("search");
          const userId = url.searchParams.get("id");

          let filter = "";
          if (search) {
            filter = `name ~ ${escapeFilterValue(search)} || email ~ ${escapeFilterValue(search)}`;
          }
          if (userId) {
            const idFilter = `id = ${escapeFilterValue(userId)}`;
            filter = filter ? `(${filter}) && ${idFilter}` : idFilter;
          }

          const result = await pb.collection("users").getList(page, perPage, {
            filter: filter || undefined,
            sort: "name",
            fields: "id,name,email,role,avatar,created",
          });
          const users = result.items.map((u: Record<string, unknown>) => ({
            id: u.id,
            name: (u.name as string) || "",
            email: (u.email as string) || "",
            role: (u.role as string) || "user",
            avatar: (u.avatar as string) || "",
            created: (u.created as string) || "",
            // registrations count removed for performance — no per-user aggregate before PB group-by
            registrationsCount: 0,
          }));

          return Response.json({ users, total: result.totalItems, hasMore: result.totalPages > result.page }, { headers: { 'Cache-Control': 'private, max-age=30, s-maxage=60' } });
        } catch (error) {
          return handleError(error, "admin-users-list");
        }
      },
      PUT: async ({ request }) => {
        try {
          const contentType = request.headers.get('content-type') || '';
          if (!contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
            return Response.json({ error: 'Unsupported media type' }, { status: 415 });
          }
          const pb = createPB(request.headers.get("cookie") || undefined);
          verifySameOrigin(request);
          const { user } = await requireRole(["admin", "chair"], pb);
          if (user.role !== "admin")
            return Response.json(
              { error: "Only admins can change roles" },
              { status: 403 },
            );

          const body = await request.json();
          const parsed = UserUpdateSchema.parse(body);

          const updateData: Record<string, unknown> = {};
          if (parsed.role !== undefined) updateData.role = parsed.role;
          if (parsed.name !== undefined) updateData.name = parsed.name;
          if (parsed.email !== undefined) updateData.email = parsed.email;

          // Reuse the caller's authenticated admin client: the users.update
          // rule's `role = "admin"` branch permits the change, so no elevated
          // (service-account) client is needed here.
          const updated = await pb
            .collection("users")
            .update(parsed.id, updateData);
          return Response.json({ user: updated });
        } catch (error) {
          return handleError(error, "admin-users-update");
        }
      },
    },
  },
});
