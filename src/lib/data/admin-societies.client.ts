import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";

export async function listAdminSocieties(input: { search?: string; page?: number; perPage?: number } = {}) {
  const pb = getPbClient();
  const page = input.page ?? 1;
  const perPage = input.perPage ?? 100;
  const result = await pb.collection("societies").getList(page, perPage, {
    filter: input.search ? `name ~ ${escapeFilterValue(input.search)}` : undefined,
    sort: "name",
    fields: "id,name,slug,bio,isHidden,chairs,defaultWhatsappLink,logo,banner",
  });
  return {
    societies: result.items.map((record) => ({
      id: record.id,
      name: String(record.name || ""),
      slug: String(record.slug || ""),
      bio: String(record.bio || ""),
      isHidden: Boolean(record.isHidden),
      chairs: Array.isArray(record.chairs) ? record.chairs : [],
      defaultWhatsappLink: String(record.defaultWhatsappLink || ""),
      logo: record.logo,
      banner: record.banner,
    })),
    total: result.totalItems,
    page: result.page,
    perPage: result.perPage,
    hasMore: result.totalPages > result.page,
  };
}

export async function getAdminSociety(id: string) {
  const record = await getPbClient().collection("societies").getOne(id, {
    fields: "id,name,slug,bio,chairs,isHidden,logo,banner,defaultWhatsappLink,created,updated",
  });
  return {
    society: {
      ...record,
      logoUrl: record.logo ? buildFileUrl("societies", record.id, String(record.logo)) : null,
      bannerUrl: record.banner ? buildFileUrl("societies", record.id, String(record.banner)) : null,
    },
  };
}

function toBody(payload: Record<string, unknown>, files?: { logo?: File | null; banner?: File | null }) {
  if (!files?.logo && !files?.banner) return payload;
  const body = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    if (Array.isArray(value)) for (const item of value) body.append(key, String(item));
    else body.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  if (files.logo) body.append("logo", files.logo);
  if (files.banner) body.append("banner", files.banner);
  return body;
}

export async function saveAdminSociety(input: {
  id?: string;
  payload: Record<string, unknown>;
  logo?: File | null;
  banner?: File | null;
  role?: string;
}) {
  const pb = getPbClient();
  let payload = input.payload;
  if (input.role === "chair") {
    payload = {
      bio: input.payload.bio,
      defaultWhatsappLink: input.payload.defaultWhatsappLink,
    };
  }
  const body = toBody(payload, { logo: input.logo, banner: input.banner });
  const society = input.id
    ? await pb.collection("societies").update(input.id, body)
    : await pb.collection("societies").create(body);
  return { society };
}

export async function deleteAdminSociety(id: string) {
  await getPbClient().collection("societies").delete(id);
}
