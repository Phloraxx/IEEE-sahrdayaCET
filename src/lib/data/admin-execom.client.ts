import { getPbClient } from "@/lib/pb-client";

export async function listAdminExecom() {
  const records = await getPbClient().collection("execom").getFullList({
    sort: "order",
    expand: "society",
    fields: "id,name,position,department,batch,section,sectionId,order,photo,linkedin,instagram,portfolio,email,phone,society,user,term,roleCode,activeFrom,activeUntil,assignment,created,updated,expand.society.id,expand.society.name",
  });
  return {
    members: records.map((record) => ({
      id: record.id,
      name: String(record.name || ""),
      position: String(record.position || ""),
      department: String(record.department || ""),
      batch: String(record.batch || ""),
      section: String(record.section || ""),
      sectionId: String(record.sectionId || ""),
      order: Number(record.order) || 0,
      photo: String(record.photo || ""),
      linkedin: String(record.linkedin || ""),
      instagram: String(record.instagram || ""),
      portfolio: String(record.portfolio || ""),
      email: String(record.email || ""),
      phone: String(record.phone || ""),
      society: String(record.society || ""),
      user: String(record.user || ""),
      term: String(record.term || ""),
      roleCode: String(record.roleCode || ""),
      activeFrom: String(record.activeFrom || ""),
      activeUntil: String(record.activeUntil || ""),
      assignment: String(record.assignment || ""),
      created: String(record.created || ""),
      updated: String(record.updated || ""),
      expand: record.expand?.society
        ? { society: { id: record.expand.society.id, name: String(record.expand.society.name || "") } }
        : undefined,
    })),
    total: records.length,
    page: 1,
    perPage: records.length,
    hasMore: false,
  };
}

export async function getAdminExecomMember(id: string) {
  const member = await getPbClient().collection("execom").getOne(id, {
    expand: "society",
    fields: "id,name,position,department,batch,section,sectionId,order,photo,linkedin,instagram,portfolio,email,phone,society,user,term,roleCode,activeFrom,activeUntil,assignment,created,updated",
  });
  return { member };
}

export async function saveAdminExecomMember(id: string | undefined, body: FormData) {
  const pb = getPbClient();
  const member = id
    ? await pb.collection("execom").update(id, body)
    : await pb.collection("execom").create(body);
  return { member };
}

export async function deleteAdminExecomMember(id: string) {
  await getPbClient().collection("execom").delete(id);
}
