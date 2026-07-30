import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SocietiesClient from "@/features/societies/SocietiesClient";
import type { Society } from "@/types";
import { fetchSocieties } from "@/server/public/societies.server";
import { CanonicalLink } from "@/components/CanonicalLink";

const description = "Explore technical societies under IEEE Sahrdaya Student Branch — Computer Society, RAS, WIE, IAS, PES and more.";

export const meta = () => [
  { title: "Societies | IEEE Sahrdaya Student Branch" },
  { name: "description", content: description },
  { property: "og:title", content: "Societies | IEEE Sahrdaya Student Branch" },
  { property: "og:description", content: description },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/societies` },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:title", content: "Societies | IEEE Sahrdaya Student Branch" },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: `${APP_URL}/web.png` },
];

export async function loader(): Promise<Society[]> { return fetchSocieties(); }

export default function SocietiesPage() {
  const societies = useLoaderData<typeof loader>();
  return (
    <>
      <CanonicalLink path="/societies" />
    <ErrorBoundary>
      <SocietiesClient societies={societies} />
    </ErrorBoundary>
    </>
  );
}
