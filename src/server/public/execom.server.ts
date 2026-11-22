import { buildFileUrl } from "@/lib/pb";
import { listExecom } from "./repo.server";
import type { ExecomMemberDoc } from "@/features/execom/ExecomClient";

export async function fetchExecomData(): Promise<ExecomMemberDoc[]> {
  const rows = await listExecom();

  return rows.map((row, index) => ({
    id: row.id,
    order: Number(row.sort_order) || 0,
    slNo: Number(row.sort_order) || index + 1,
    name: String(row.name || ""),
    department: String(row.department || ""),
    semester: String(row.batch || ""),
    position: String(row.position || ""),
    section: String(row.section || ""),
    sectionId: String(row.section_id || ""),
    photoUrl: row.photo ? buildFileUrl("execom", row.id, String(row.photo)) : "",
    linkedin: row.linkedin ? String(row.linkedin) : undefined,
    instagram: row.instagram ? String(row.instagram) : undefined,
    portfolio: row.portfolio ? String(row.portfolio) : undefined,
  }));
}
