import { createFileRoute } from "@tanstack/react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SocietiesClient from "@/features/societies/SocietiesClient";
import type { Society } from "@/types";
import { createPB, buildFileUrl } from "@/lib/pb";

export const Route = createFileRoute("/societies")({
  head: () => ({
    meta: [
      { title: "Societies | IEEE Sahrdaya Student Branch" },
      {
        name: "description",
        content:
          "Explore 14 technical societies under IEEE Sahrdaya Student Branch — Computer Society, RAS, WIE, IAS, PES and more.",
      },
      { property: "og:title", content: "Societies | IEEE Sahrdaya Student Branch" },
      {
        property: "og:description",
        content:
          "Explore 14 technical societies under IEEE Sahrdaya Student Branch — Computer Society, RAS, WIE, IAS, PES and more.",
      },
      { property: "og:url", content: `${APP_URL}/societies` },
      { property: "og:image", content: `${APP_URL}/web.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    ],
    links: [{ rel: "canonical", href: "/societies" }],
    scripts: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: APP_URL },
            { "@type": "ListItem", position: 2, name: "Societies", item: `${APP_URL}/societies` },
          ],
        }),
      },
    ],
  }),
  loader: async ({ context }: { context: { response: { headers: Headers } } }): Promise<Society[]> => {
    try {
      context.response.headers.set('Cache-Control', 'public, max-age=300');
      const pb = createPB();
      const data = await pb.collection("societies").getList(1, 200, {
        filter: "isHidden=false",
        skipTotal: true,
        fields: "id,name,slug,bio,logo",
      })
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
