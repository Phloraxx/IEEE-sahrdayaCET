import { createPublicPB } from "@/lib/pb.server";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { getField } from "@/lib/safe-get";

export interface SocietyPageData {
  society: {
    id: string;
    name: string;
    slug: string;
    bio: string;
    chairs: string[];
    defaultWhatsappLink: string;
    logoUrl: string;
    bannerUrl: string;
  };
  events: Array<{
    id: string;
    title: string;
    description: string;
    date: string;
    endDate: string;
    registrationStart: string;
    registrationDeadline: string;
    venue: string;
    price: number;
    status: string;
    bannerUrl: string;
    externalFormUrl: string;
  }>;
  members: Array<{
    id: string;
    name: string;
    position: string;
    department: string;
    batch: string;
    photoUrl: string;
    linkedin: string;
    instagram: string;
  }>;
}

export async function fetchSocietyData(slug: string): Promise<SocietyPageData> {
  const pb = createPublicPB();
  const society = await pb.collection("societies").getFirstListItem(
    `slug = ${escapeFilterValue(slug.toLowerCase())}`,
    { fields: "id,name,slug,bio,chairs,defaultWhatsappLink,logo,banner" },
  ).catch(() => null);

  if (!society) throw new Error("Society not found");

  const [events, members] = await Promise.all([
    pb.collection("events").getFullList({
      batch: 100,
      filter: `society = ${escapeFilterValue(society.id)}`,
      sort: "-date",
      fields:
        "id,title,description,date,endDate,registrationStart,registrationDeadline,venue,price,status,banner,externalFormUrl",
    }).catch(() => []),
    // `society` is the canonical relation. `sectionId` is a legacy display/grouping
    // key and is not guaranteed to match the society slug (for example CAS).
    pb.collection("execom").getFullList({
      batch: 100,
      filter: `society = ${escapeFilterValue(society.id)}`,
      sort: "order",
      fields: "id,name,position,department,batch,photo,linkedin,instagram",
    }).catch(() => []),
  ]);

  const societyId = society.id;
  const societyLogo = getField(society, "logo", "");
  const societyBanner = getField(society, "banner", "");

  return {
    society: {
      id: societyId,
      name: getField(society, "name", ""),
      slug: getField(society, "slug", ""),
      bio: getField(society, "bio", ""),
      chairs: Array.isArray(society.chairs) ? society.chairs.map(String) : [],
      defaultWhatsappLink: getField(society, "defaultWhatsappLink", ""),
      logoUrl: societyLogo ? buildFileUrl("societies", societyId, societyLogo) : "",
      bannerUrl: societyBanner ? buildFileUrl("societies", societyId, societyBanner) : "",
    },
    events: events.map((event) => {
      const id = event.id;
      const banner = getField(event, "banner", "");
      return {
        id,
        title: getField(event, "title", ""),
        description: getField(event, "description", ""),
        date: getField(event, "date", ""),
        endDate: getField(event, "endDate", ""),
        registrationStart: getField(event, "registrationStart", ""),
        registrationDeadline: getField(event, "registrationDeadline", ""),
        venue: getField(event, "venue", ""),
        price: Number(getField(event, "price", 0)) || 0,
        status: getField(event, "status", "published"),
        bannerUrl: banner ? buildFileUrl("events", id, banner) : "",
        externalFormUrl: getField(event, "externalFormUrl", ""),
      };
    }),
    members: members.map((member) => {
      const id = member.id;
      const photo = getField(member, "photo", "");
      return {
        id,
        name: getField(member, "name", ""),
        position: getField(member, "position", ""),
        department: getField(member, "department", ""),
        batch: getField(member, "batch", ""),
        photoUrl: photo ? buildFileUrl("execom", id, photo) : "",
        linkedin: getField(member, "linkedin", ""),
        instagram: getField(member, "instagram", ""),
      };
    }),
  };
}
