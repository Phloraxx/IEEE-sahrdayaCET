import { buildFileUrl } from "@/lib/pb";
import { publicDataUnavailable } from "./errors.server";
import {
  getPublicSocietyBySlug,
  listExecomForSociety,
  listPublicEventsForSociety,
  listSocietyChairIds,
} from "./repo.server";

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
    slug: string;
    title: string;
    description: string;
    date: string;
    endDate: string;
    timeTbc: boolean;
    registrationStart: string;
    registrationDeadline: string;
    venue: string;
    price: number;
    status: string;
    tags: string;
    bannerUrl: string;
    externalFormUrl: string;
    externalLink: string;
    contactEmail: string;
    contactPhone: string;
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
    email: string;
    phone: string;
  }>;
}

export async function fetchSocietyData(slug: string): Promise<SocietyPageData> {
  let society;
  try {
    society = await getPublicSocietyBySlug(slug.toLowerCase());
  } catch (error) {
    publicDataUnavailable("fetchSociety", error);
  }

  if (!society) throw new Response("Society not found", { status: 404 });

  const [events, members, chairs] = await Promise.all([
    listPublicEventsForSociety(society.id).catch((error: unknown) =>
      publicDataUnavailable("fetchSocietyContent", error),
    ),
    listExecomForSociety(society.id).catch((error: unknown) =>
      publicDataUnavailable("fetchSocietyContent", error),
    ),
    listSocietyChairIds(society.id).catch(() => [] as string[]),
  ]);

  return {
    society: {
      id: society.id,
      name: society.name,
      slug: society.slug,
      bio: society.bio ?? "",
      chairs,
      defaultWhatsappLink: society.default_whatsapp_link ?? "",
      logoUrl: society.logo ? buildFileUrl("societies", society.id, society.logo) : "",
      bannerUrl: society.banner ? buildFileUrl("societies", society.id, society.banner) : "",
    },
    events: events.map((row) => ({
      id: row.id,
      slug: row.slug ?? "",
      title: row.title ?? "",
      description: row.description ?? "",
      date: row.date ?? "",
      endDate: row.end_date ?? "",
      timeTbc: row.time_tbc === 1,
      registrationStart: row.registration_start ?? "",
      registrationDeadline: row.registration_deadline ?? "",
      venue: row.venue ?? "",
      price: Number(row.price) || 0,
      status: row.status ?? "published",
      tags: row.tags ?? "",
      bannerUrl: row.banner ? buildFileUrl("events", row.id, row.banner) : "",
      externalFormUrl: row.external_form_url ?? "",
      externalLink: row.external_link ?? "",
      contactEmail: row.contact_email ?? "",
      contactPhone: row.contact_phone ?? "",
    })),
    members: members.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      position: row.position ?? "",
      department: row.department ?? "",
      batch: row.batch ?? "",
      photoUrl: row.photo ? buildFileUrl("execom", row.id, row.photo) : "",
      linkedin: row.linkedin ?? "",
      instagram: row.instagram ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
    })),
  };
}
