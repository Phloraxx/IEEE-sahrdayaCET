import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";

export async function listAdminUsers(input: { search?: string; id?: string; page?: number; perPage?: number } = {}) {
  const pb = getPbClient();
  const filters: string[] = [];
  if (input.search) {
    const value = escapeFilterValue(input.search);
    filters.push(`(name ~ ${value} || email ~ ${value})`);
  }
  if (input.id) filters.push(`id = ${escapeFilterValue(input.id)}`);
  const result = await pb.collection("users").getList(input.page ?? 1, Math.min(input.perPage ?? 100, 100), {
    filter: filters.join(" && ") || undefined,
    sort: "name",
    fields: "id,name,email,role,avatar,created",
  });
  return {
    users: result.items.map((record) => ({
      id: record.id,
      name: String(record.name || ""),
      email: String(record.email || ""),
      role: String(record.role || "user"),
      avatar: record.avatar ? buildFileUrl("users", record.id, String(record.avatar)) : "",
      created: String(record.created || ""),
      registrationsCount: 0,
    })),
    total: result.totalItems,
    hasMore: result.totalPages > result.page,
  };
}

export async function updateAdminUserRole(id: string, role: string) {
  const pb = getPbClient();
  return pb.send(`/api/app/admin/users/${encodeURIComponent(id)}/role`, {
    method: "POST",
    body: { role },
  });
}
