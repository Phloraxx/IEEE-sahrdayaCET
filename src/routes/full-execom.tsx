import { createFileRoute } from "@tanstack/react-router";
import { pbFetch, buildFileUrl } from "@/lib/pb";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ExecomClient, {
  type ExecomMemberDoc,
} from "@/app/(main)/full-execom/ExecomClient";

export const Route = createFileRoute("/full-execom")({
  head: () => ({
    meta: [
      { title: "Execom Directory" },
      {
        name: "description",
        content:
          "Meet the IEEE Sahrdaya Student Branch executive committee — browse all 60+ members across CS, RAS, WIE, PES, IAS and other societies. EXECOM 2026-2027.",
      },
    ],
    links: [{ rel: "canonical", href: "/full-execom" }],
  }),
  loader: async (): Promise<ExecomMemberDoc[]> => {
    const PB_URL = process.env.POCKETBASE_URL;
    if (!PB_URL) return [];

    try {
      const data = await pbFetch<{ items: Record<string, unknown>[] }>(
        `${PB_URL}/api/collections/execom/records?perPage=100&sort=order&skipTotal=1&fields=id,order,name,department,batch,position,category,section,sectionId,photo,linkedin,instagram,email,phone`,
      );
      return (data?.items || []).map(
        (raw: Record<string, unknown>, i: number) => {
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
            email?: string;
            phone?: string;
          };
          return {
            id: doc.id,
            order: doc.order || 0,
            slNo: doc.order || i + 1,
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
            email: doc.email,
            phone: doc.phone,
          };
        },
      );
    } catch {
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
