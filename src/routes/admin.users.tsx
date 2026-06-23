import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { adminLoader } from "@/lib/admin-loader";
import { UsersContent } from "@/features/admin/UsersContent";

export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  created: string;
  avatar: string;
  registrationsCount: number;
}

export interface UsersLoaderData {
  users: UserItem[];
  total: number;
}

const EMPTY: UsersLoaderData = { users: [], total: 0 };

const getUsersList = createServerFn({ method: "GET" }).handler(() =>
  adminLoader(
    async (pb) => {
      const result = await pb.collection("users").getList(1, 200, {
        sort: "name",
        fields: "id,name,email,role,avatar,created",
      });
      const users: UserItem[] = result.items.map((u: Record<string, unknown>) => ({
        id: u.id as string,
        name: (u.name as string) || "",
        email: (u.email as string) || "",
        role: (u.role as string) || "user",
        avatar: (u.avatar as string) || "",
        created: (u.created as string) || "",
        registrationsCount: 0,
      }));

      return { users, total: result.totalItems } satisfies UsersLoaderData;
    },
    EMPTY,
    { context: "admin-users-list" },
  ),
);

export const Route = createFileRoute("/admin/users")({
  loader: () => getUsersList(),
  component: AdminUsersPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function AdminUsersPage() {
  const { users } = Route.useLoaderData();
  return <UsersContent users={users} />;
}
