import { createFileRoute } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SocietiesClient from "@/app/(main)/societies/SocietiesClient";
import type { Society } from "@/types";
import { buildFileUrl } from "@/lib/pb";

export const Route = createFileRoute("/societies")({
  head: () => ({
    meta: [
      { title: "Societies | IEEE Sahrdaya Student Branch" },
      {
        name: "description",
        content:
          "Explore the technical societies under IEEE Sahrdaya Student Branch",
      },
    ],
    links: [{ rel: "canonical", href: "/societies" }],
  }),
  loader: async (): Promise<Society[]> => {
    const PB_URL = process.env.POCKETBASE_URL;
    if (!PB_URL) return [];

    try {
      const res = await fetch(
        `${PB_URL}/api/collections/societies/records?skipTotal=1&fields=id,name,slug,bio,logo&filter=${encodeURIComponent("isHidden=false")}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.items || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        slug: s.slug as string,
        bio: s.bio as string | undefined,
        logoUrl: s.logo
          ? buildFileUrl("societies", s.id as string, s.logo as string)
          : undefined,
      }));
    } catch {
      return [];
    }
  },
  component: SocietiesPage,
});

function SocietiesPage() {
  const societies = Route.useLoaderData();
  return (
    <ErrorBoundary>
      <SocietiesClient societies={societies} />
    </ErrorBoundary>
  );
}
