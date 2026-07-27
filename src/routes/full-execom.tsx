import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { fetchExecomData } from "@/server/public/execom.server";
import { logError } from "@/lib/logger";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ExecomClient, {
  type ExecomMemberDoc,
} from "@/features/execom/ExecomClient";
import { CanonicalLink } from "@/components/CanonicalLink";

export const meta = () => [
  { title: "Execom Directory | IEEE Sahrdaya Student Branch" },
  { name: "description", content: "Meet the IEEE Sahrdaya Student Branch executive committee — browse members across IEEE societies." },
  { property: "og:title", content: "Execom Directory | IEEE Sahrdaya Student Branch" },
  { property: "og:image", content: `${APP_URL}/web.png` },
  { property: "og:url", content: `${APP_URL}/full-execom` },
];

export async function loader(): Promise<ExecomMemberDoc[]> {
  try { return await fetchExecomData(); }
  catch (error) { logError("full-execom-loader", error); return []; }
}

export default function FullExecomPage() {
  const docs = useLoaderData<typeof loader>();
  return (
    <>
      <CanonicalLink path="/full-execom" />
    <ErrorBoundary>
      <ExecomClient initialDocs={docs} />
    </ErrorBoundary>
    </>
  );
}
