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

/**
 * Save a society profile.
 *
 * `structuralAccess` is the hidden-society switch. Only a full-visibility actor
 * may send `isHidden`; a society editor's payload never carries it, because the
 * collection endpoint keeps `is_hidden` for a reader who can see hidden rows.
 * A new society is created hidden and the editor turns it visible in the same
 * save once it has its name, slug and banner — that is the only publish step
 * the directory has, so sending `isHidden: false` is what makes it reachable.
 */
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
  const payload = { ...input.payload };
  if (input.removeLogo && !input.logo) payload.logo = "";
  if (input.removeBanner && !input.banner) payload.banner = "";
  if (!input.structuralAccess) {
    // The endpoint ignores these for a scoped editor anyway; not sending them
    // keeps the request honest about what the user is allowed to change.
    delete payload.isHidden;
    delete payload.chairs;
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
