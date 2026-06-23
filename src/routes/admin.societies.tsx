import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { adminLoader } from "@/lib/admin-loader";
import { SocietiesContent } from "@/features/admin/SocietiesContent";

export interface SocietyItem {
  id: string;
  name: string;
  slug: string;
  isHidden: boolean;
  chairs: string[];
}

const getSocietiesList = createServerFn({ method: "GET" }).handler(() =>
  adminLoader(
    async (pb) => {
      const result = await pb.collection("societies").getFullList({
        fields: "id,name,slug,isHidden,chairs",
      });
      return result.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: (s.name as string) || "",
        slug: (s.slug as string) || "",
        isHidden: !!s.isHidden,
        chairs: (s.chairs as string[]) || [],
      })) satisfies SocietyItem[];
    },
    [] as SocietyItem[],
    { context: "admin-societies-list" },
  ),
);

export const Route = createFileRoute("/admin/societies")({
  loader: () => getSocietiesList(),
  component: function RouteComponent() {
    const societies = Route.useLoaderData();
    return <SocietiesContent societies={societies} />;
  },
  errorComponent: ({ error }: { error: Error }) => (
    <div className="p-8 text-center">
      <h2 className="text-xl font-bold text-red-600 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm">{error.message}</p>
    </div>
  ),
});
