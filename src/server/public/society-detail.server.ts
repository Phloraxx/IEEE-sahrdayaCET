import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";

export interface SocietyPageData {
  society: {
    id: string; name: string; slug: string; bio: string; chairs: string[];
    defaultWhatsappLink: string; logoUrl: string; bannerUrl: string;
  };
  events: Array<{
    id: string; title: string; description: string; date: string; endDate: string;
    registrationStart: string; registrationDeadline: string; venue: string; price: number;
    status: string; bannerUrl: string; externalFormUrl: string;
  }>;
  members: Array<{
    id: string; name: string; position: string; department: string; batch: string;
    photoUrl: string; linkedin: string; instagram: string;
  }>;
}

export async function fetchSocietyData(slug: string): Promise<SocietyPageData> {
    const pb = createPublicPB();
    const society = await pb
      .collection("societies")
      .getFirstListItem(`slug = ${escapeFilterValue(slug.toLowerCase())}`)
      .catch(() => null);

    if (!society) {
      throw new Error("Society not found");
    }

    const [events, members] = await Promise.all([
      pb
        .collection("events")
        .getList(1, 100, {
          filter: `society = ${escapeFilterValue(society.id)}`,
          sort: "-date",
        })
        .then((res) => res.items)
        .catch(() => []),
      pb
        .collection("execom")
        .getList(1, 100, {
          filter: `sectionId = ${escapeFilterValue(slug.toLowerCase())}`,
          sort: "order",
        })
        .then((res) => res.items)
        .catch(() => []),
    ]);

    return {
      society: {
        id: society.id,
        name: society.name,
        slug: society.slug,
        bio: (society.bio as string) || "",
        chairs: Array.isArray(society.chairs) ? society.chairs : [],
        defaultWhatsappLink: (society.defaultWhatsappLink as string) || "",
        logoUrl: society.logo
          ? buildFileUrl("societies", society.id, society.logo as string)
          : "",
        bannerUrl: society.banner
          ? buildFileUrl("societies", society.id, society.banner as string)
          : "",
      },
      events: events.map((e) => ({
        id: e.id,
        title: (e.title as string) || "",
        description: (e.description as string) || "",
        date: (e.date as string) || "",
        endDate: (e.endDate as string) || "",
        registrationStart: (e.registrationStart as string) || "",
        registrationDeadline: (e.registrationDeadline as string) || "",
        venue: (e.venue as string) || "",
        price: (e.price as number) || 0,
        status: (e.status as string) || "published",
        bannerUrl: e.banner
          ? buildFileUrl("events", e.id, e.banner as string)
          : "",
        externalFormUrl: (e.externalFormUrl as string) || "",
      })),
      members: members.map((m) => ({
        id: m.id,
        name: (m.name as string) || "",
        position: (m.position as string) || "",
        department: (m.department as string) || "",
        batch: (m.batch as string) || "",
        photoUrl: m.photo
          ? buildFileUrl("execom", m.id, m.photo as string)
          : "",
        linkedin: (m.linkedin as string) || "",
        instagram: (m.instagram as string) || "",
      })),
    };
}
