import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl } from "@/lib/pb";
import type { Society } from "@/types";

export async function fetchSocieties(): Promise<Society[]> {
  try {
    const pb = createPublicPB();
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
}
