import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SocietiesClient from "@/features/societies/SocietiesClient";
import type { Society } from "@/types";
import { fetchSocieties } from "@/server/public/societies.server";

export const meta = () => [
  { title: "Societies | IEEE Sahrdaya Student Branch" },
  { name: "description", content: "Explore technical societies under IEEE Sahrdaya Student Branch — Computer Society, RAS, WIE, IAS, PES and more." },
  { property: "og:title", content: "Societies | IEEE Sahrdaya Student Branch" },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/societies` },
];

export async function loader(): Promise<Society[]> { return fetchSocieties(); }

export default function SocietiesPage() {
  const societies = useLoaderData<typeof loader>();
  return (
    <ErrorBoundary>
      <SocietiesClient societies={societies} />
    </ErrorBoundary>
  );
}
