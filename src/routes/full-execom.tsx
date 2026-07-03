import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createPB } from "@/lib/pb.server"; import { buildFileUrl } from "@/lib/pb"
import { APP_URL } from "@/lib/constants";
import { logError } from "@/lib/logger";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ExecomClient, {
  type ExecomMemberDoc,
} from "@/features/execom/ExecomClient";

const fetchExecomData = createServerFn().handler(
  async (): Promise<ExecomMemberDoc[]> => {
    const pb = createPB();
    const data = await pb.collection("execom").getList(1, 100, {
      sort: "order",
      skipTotal: true,
      fields:
        "id,order,name,department,batch,position,category,section,sectionId,photo,linkedin,instagram",
    });
    return (data?.items || []).map((raw: Record<string, unknown>, i: number) => {
      const doc = raw as {
        id: string;
        order?: number;
        name?: string;
        department?: string;
        batch?: string;
        position?: string;
        category?: string;
        section?: string;
        sectionId?: string;
        photo?: string;
        linkedin?: string;
        instagram?: string;
      };
      return {
        id: doc.id,
        order: doc.order ?? 0,
        slNo: doc.order ?? i + 1,
        name: doc.name || "",
        department: doc.department || "",
        semester: doc.batch || "",
        position: doc.position || "",
        category: doc.category || "",
        section: doc.section || "",
        sectionId: doc.sectionId || "",
        photoUrl: doc.photo
          ? buildFileUrl("execom", doc.id, doc.photo)
          : "",
        linkedin: doc.linkedin,
        instagram: doc.instagram,
      };
    });
  },
);

export const Route = createFileRoute("/full-execom")({
  head: () => ({
    meta: [
      { title: "Execom Directory | IEEE Sahrdaya Student Branch" },
      {
        name: "description",
        content:
          "Meet the IEEE Sahrdaya Student Branch executive committee — browse all 60+ members across CS, RAS, WIE, PES, IAS and other societies. EXECOM 2026-2027.",
      },
      { property: "og:title", content: "Execom Directory | IEEE Sahrdaya Student Branch" },
      {
        property: "og:description",
        content:
          "Meet the IEEE Sahrdaya Student Branch executive committee — browse all 60+ members across CS, RAS, WIE, PES, IAS and other societies. EXECOM 2026-2027.",
      },
      { property: "og:url", content: `${APP_URL}/full-execom` },
      { property: "og:image", content: `${APP_URL}/web.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/full-execom` }],
    scripts: [
      {
        type: "application/ld+json",
        innerHTML: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: APP_URL },
            { "@type": "ListItem", position: 2, name: "Execom", item: `${APP_URL}/full-execom` },
          ],
        })
          .replace(/</g, '\\u003c')
          .replace(/>/g, '\\u003e')
          .replace(/&/g, '\\u0026'),
      },
    ],
  }),
  loader: async (): Promise<ExecomMemberDoc[]> => {
    try {
      return await fetchExecomData();
    } catch (error) {
      logError("full-execom-loader", error);
      return [];
    }
  },
  component: FullExecomPage,
});

function FullExecomPage() {
  const docs = Route.useLoaderData();
  return (
    <ErrorBoundary>
      <ExecomClient initialDocs={docs} />
    </ErrorBoundary>
  );
}
