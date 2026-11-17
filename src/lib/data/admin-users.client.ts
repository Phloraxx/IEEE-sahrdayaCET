import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl } from "@/lib/pb";

interface AdminUserResponse {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    avatar: string;
    createdAt: string;
    registrationsCount: number;
  }>;
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

/**
 * The branch user directory.
 *
 * Goes to `/api/admin/users`, not `collection("users")`. The `users` collection
 * is a **self** policy — it always filters to the caller's own row and an admin
 * capability deliberately does not widen it — so listing through it returned
 * exactly one user and made the search box and role filter useless.
 */
export async function listAdminUsers(input: { search?: string; role?: string; id?: string; page?: number; perPage?: number } = {}) {
  const pb = getPbClient();
  const params = new URLSearchParams();
  if (input.search) params.set("q", input.search);
  if (input.role && input.role !== "all") params.set("role", input.role);
  if (input.page) params.set("page", String(input.page));
  if (input.perPage) params.set("perPage", String(input.perPage));

  const query = params.toString();
  const path = query ? `/api/admin/users?${query}` : "/api/admin/users";
  const result = await pb.send<AdminUserResponse>(path, { method: "GET" });

  return {
    users: result.users.map((record) => ({
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
      avatar: record.avatar ? buildFileUrl("users", record.id, record.avatar) : "",
      // The page formats `created`; the route names it `createdAt`.
      created: record.createdAt,
      registrationsCount: record.registrationsCount,
    })),
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    hasMore: result.hasMore,
  };
}

export async function updateAdminUserRole(id: string, role: string) {
  const pb = getPbClient();
  return pb.send(`/api/app/admin/users/${encodeURIComponent(id)}/role`, {
    method: "POST",
    body: { role },
  });
}
