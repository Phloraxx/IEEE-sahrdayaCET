import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { adminLoader } from "@/lib/admin-loader";
import ExecomPage from "@/features/admin/ExecomPage";
import type { ExecomMember as ExecomMemberType } from '@/types'

export interface ExecomMember extends ExecomMemberType {
  department: string;
  batch: string;
  section: string;
  order: number;
  expand?: { society?: { name: string } };
}

const getExecomList = createServerFn({ method: "GET" }).handler(() =>
  adminLoader(
    async (pb) => {
      const result = await pb.collection("execom").getList(1, 200, {
        sort: "order",
        expand: "society",
      });
      return result.items as unknown as ExecomMember[];
    },
    [] as ExecomMember[],
    { context: "admin-execom-list" },
  ),
);

export const Route = createFileRoute("/admin/execom")({
  loader: () => getExecomList(),
  component: AdminExecomPage,
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});

function AdminExecomPage() {
  const members = Route.useLoaderData();
  return <ExecomPage members={members} />;
}
