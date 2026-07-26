import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import type { ExecomMemberDoc } from "@/features/execom/ExecomClient";

export async function fetchExecomData(): Promise<ExecomMemberDoc[]> {
  const records = await createPublicPB().collection("execom").getFullList({
    batch: 200,
    sort: "order",
    fields:
      "id,order,name,department,batch,position,category,section,sectionId,photo,linkedin,instagram",
  });

  return records.map((record, index) => ({
    id: record.id,
    order: Number(record.order) || 0,
    slNo: Number(record.order) || index + 1,
    name: String(record.name || ""),
    department: String(record.department || ""),
    semester: String(record.batch || ""),
    position: String(record.position || ""),
    category: String(record.category || ""),
    section: String(record.section || ""),
    sectionId: String(record.sectionId || ""),
    photoUrl: record.photo
      ? buildFileUrl("execom", record.id, String(record.photo))
      : "",
    linkedin: record.linkedin ? String(record.linkedin) : undefined,
    instagram: record.instagram ? String(record.instagram) : undefined,
  }));
}
