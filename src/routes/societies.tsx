import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SocietiesClient from "@/features/societies/SocietiesClient";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { createPB } from "@/lib/pb.server";
import type { Society } from "@/types";

export const fetchSocietyMembers = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const pb = createPB();
    const res = await pb.collection("execom").getList(1, 50, {
      filter: `sectionId = ${escapeFilterValue(slug)}`,
      sort: "order",
      fields:
        "id,name,department,batch,position,sectionId,photo,linkedin,instagram",
    });
    return res.items.map((doc) => ({
      id: doc.id as string,
      name: (doc.name as string) || "",
      position: (doc.position as string) || "",
      department: (doc.department as string) || "",
      batch: (doc.batch as string) || "",
      sectionId: (doc.sectionId as string) || "",
      photoUrl: doc.photo
        ? buildFileUrl("execom", doc.id as string, doc.photo as string)
        : "",
      photo: doc.photo as string | undefined,
      linkedin: doc.linkedin as string | undefined,
      instagram: doc.instagram as string | undefined,
    }));
  });

export const fetchSocietyEvents = createServerFn()
  .validator((societyId: string) => societyId)
  .handler(async ({ data: societyId }) => {
    const pb = createPB();
    const res = await pb.collection("events").getList(1, 50, {
      filter: `society = ${escapeFilterValue(societyId)}`,
      sort: "-date",
      fields:
        "id,title,description,date,endDate,venue,price,status,banner,externalFormUrl,registrationOpen",
    });
    return res.items
      .filter((e) => {
        const s = (e.status as string) || "";
        return s === "published" || s === "completed";
      })
      .map((e) => ({
        id: e.id as string,
        title: (e.title as string) || "",
        description: (e.description as string) || "",
        date: (e.date as string) || "",
        endDate: (e.endDate as string) || "",
        venue: (e.venue as string) || "",
        price: (e.price as number) || 0,
        status: (e.status as string) || "",
        bannerUrl: e.banner
          ? buildFileUrl("events", e.id as string, e.banner as string)
          : undefined,
        banner: (e.banner as string) || "",
        externalFormUrl: (e.externalFormUrl as string) || "",
        registrationOpen: !!e.registrationOpen,
      }));
  });

const fetchSocieties = createServerFn().handler(async (): Promise<Society[]> => {
  try {
    const pb = createPB();
    const data = await pb.collection("societies").getList(1, 200, {
      filter: "isHidden=false",
      skipTotal: true,
      fields: "id,name,slug,bio,logo",
    });
    return (data.items || []).map((s: Record<string, unknown>) => ({
      id: s.id as string,
      name: s.name as string,
      slug: s.slug as string,
      bio: s.bio as string | undefined,
      logoUrl: s.logo
        ? buildFileUrl("societies", s.id as string, s.logo as string)
        : undefined,
    }));
  } catch (nodeError) {
    return [];
  }
});

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
    links: [{ rel: "canonical", href: `${APP_URL}/societies` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: APP_URL },
            { "@type": "ListItem", position: 2, name: "Societies", item: `${APP_URL}/societies` },
          ],
        })
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026'),
      },
    ],
  }),
  loader: async ({ context }): Promise<Society[]> => {
    const response = (context as unknown as { response?: { headers?: Headers } })?.response;
    response?.headers?.set('Cache-Control', 'public, max-age=300');
    return fetchSocieties();
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
