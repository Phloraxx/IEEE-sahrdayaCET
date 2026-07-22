import { APP_URL } from "@/lib/constants";

export function CanonicalLink({ path }: { path: string }) {
  return <link rel="canonical" href={`${APP_URL}${path}`} />;
}
