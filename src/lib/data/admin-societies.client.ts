import { getPbClient } from "@/lib/pb-client";
import { buildFileUrl, escapeFilterValue } from "@/lib/pb";
import { uploadFile } from "@/lib/data/upload.client";

export async function listAdminSocieties(input: { search?: string; page?: number; perPage?: number; allowedIds?: string[] } = {}) {
  const pb = getPbClient();
  const page = input.page ?? 1;
  const perPage = input.perPage ?? 100;
  const filters: string[] = [];
  if (input.search) filters.push(`name ~ ${escapeFilterValue(input.search)}`);
  if (input.allowedIds) filters.push(input.allowedIds.length ? `(${input.allowedIds.map((id) => `id = ${escapeFilterValue(id)}`).join(" || ")})` : 'id = ""');
  const result = await pb.collection("societies").getList(page, perPage, {
    filter: filters.join(" && ") || undefined,
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

/**
 * The collections endpoint is JSON-only, so files are uploaded after the row is
 * written — the same split the certificate template assets use.
 */
async function uploadSocietyFiles(
  societyId: string,
  files: { logo?: File | null; banner?: File | null },
) {
  if (files.logo) await uploadFile("societies", societyId, "logo", files.logo);
  if (files.banner) await uploadFile("societies", societyId, "banner", files.banner);
}

export async function saveAdminSociety(input: {
  id?: string;
  payload: Record<string, unknown>;
  logo?: File | null;
  banner?: File | null;
  removeLogo?: boolean;
  removeBanner?: boolean;
  structuralAccess?: boolean;
}) {
  const pb = getPbClient();
  let payload = { ...input.payload };
  if (input.removeLogo && !input.logo) payload.logo = "";
  if (input.removeBanner && !input.banner) payload.banner = "";
  if (!input.structuralAccess) {
    payload = {
      bio: input.payload.bio,
      defaultWhatsappLink: input.payload.defaultWhatsappLink,
    };
  }
  const society = input.id
    ? await pb.collection("societies").update(input.id, payload)
    : await pb.collection("societies").create(payload);
  await uploadSocietyFiles(String(society.id), { logo: input.logo, banner: input.banner });
  return { society };
}

export async function archiveAdminSociety(id: string) {
  await getPbClient().collection("societies").update(id, { isHidden: true });
}
