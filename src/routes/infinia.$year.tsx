import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { InfiniaShowcase } from "@/components/InfiniaShowcase";
import { APP_URL } from "@/lib/constants";
import { INFINIA } from "@/lib/infinia";
export function loader({ params }: LoaderFunctionArgs) {
  const edition = INFINIA.editions.find(edition => edition.year === params.year);
  if (!edition) throw new Response("Infinia edition not found", { status: 404 });
  return { edition };
}
export const meta = ({ data }: { data?: ReturnType<typeof loader> }) => data ? [
  { title: `${data.edition.title} (${data.edition.year}) | IEEE Sahrdaya` },
  { name: "description", content: data.edition.summary },
  { property: "og:title", content: `${data.edition.title} · ${data.edition.year}` },
  { property: "og:description", content: data.edition.summary },
  { property: "og:url", content: `${APP_URL}/infinia/${data.edition.year}` },
  { property: "og:image", content: `${APP_URL}${data.edition.image!.src}` },
  { name: "twitter:card", content: "summary_large_image" },
] : [{ title: "Edition not found | IEEE Sahrdaya" }, { name: "robots", content: "noindex" }];
export default function InfiniaEditionPage() {
  const { edition } = useLoaderData<typeof loader>();
  return <InfiniaShowcase year={edition.year} />;
}
