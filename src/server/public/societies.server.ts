import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import { getField } from "@/lib/safe-get";
import { logError } from "@/lib/logger";
import type { Society } from "@/types";

export async function fetchSocieties(): Promise<Society[]> {
  try {
    const records = await createPublicPB().collection("societies").getFullList({
      batch: 200,
      filter: "isHidden=false",
      sort: "name",
      fields: "id,name,slug,bio,logo",
    });
    return records.map((record) => {
      const id = getField(record, "id", "");
      const logo = getField(record, "logo", "");
      return {
        id,
        name: getField(record, "name", ""),
        slug: getField(record, "slug", ""),
        bio: getField(record, "bio", "") || undefined,
        logoUrl: logo ? buildFileUrl("societies", id, logo) : undefined,
      };
    });
  } catch (error) {
    logError("fetchSocieties", error);
    return [];
  }
}
