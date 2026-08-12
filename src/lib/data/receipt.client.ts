import { getPbClient } from "@/lib/pb-client";

export async function downloadRegistrationReceipt(registrationId: string): Promise<void> {
  const pb = getPbClient();
  if (!pb.authStore.isValid) throw new Error("Please sign in to download this receipt");
  const response = await fetch(
    `${pb.baseURL}/api/app/registrations/${encodeURIComponent(registrationId)}/receipt`,
    { headers: { Authorization: pb.authStore.token } },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || "Receipt could not be downloaded");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `receipt-${registrationId}.pdf`;
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
