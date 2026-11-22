import { buildFileUrl } from "@/lib/pb";
import { publicDataUnavailable } from "./errors.server";
import { listPublicSocieties } from "./repo.server";
import type { Society } from "@/types";

export async function fetchSocieties(): Promise<Society[]> {
  try {
    const rows = await listPublicSocieties();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      bio: row.bio || undefined,
      logoUrl: row.logo ? buildFileUrl("societies", row.id, row.logo) : undefined,
    }));
  } catch (error) {
    publicDataUnavailable("fetchSocieties", error);
  }
}
