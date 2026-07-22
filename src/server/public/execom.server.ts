import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import type { ExecomMemberDoc } from "@/features/execom/ExecomClient";

export async function fetchExecomData(): Promise<ExecomMemberDoc[]> {
    const pb = createPublicPB();
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
}
