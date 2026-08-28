import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { CanonicalLink } from "@/components/CanonicalLink";
import { SocietyDetailView } from "@/components/societies/SocietyDetailView";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { getLatestPublishedBlogsForSociety } from "@/lib/blog-public.server";
import { APP_URL } from "@/lib/constants";
import { fetchSocieties } from "@/server/public/societies.server";
import { fetchSocietyData, type SocietyPageData } from "@/server/public/society-detail.server";
import type { BlogPost, Society } from "@/types";

type SocietyDetailLoaderData = {
  page: SocietyPageData;
  directory: Society[];
  stories: BlogPost[];
};

function absoluteImage(value: string) {
  if (!value) return `${APP_URL}/web.png`;
  return value.startsWith("http") ? value : `${APP_URL}${value}`;
}

export const meta = ({ data }: { data?: SocietyDetailLoaderData }) => {
  const society = data?.page.society;
  const name = society?.name || "Society";
  const description = blogHtmlToPlainText(society?.bio || "").slice(0, 160) || `Learn about ${name} at IEEE Sahrdaya Student Branch.`;
  const url = society?.slug ? `${APP_URL}/societies/${society.slug}` : `${APP_URL}/societies`;
  return [
    { title: `${name} | IEEE Sahrdaya` },
    { name: "description", content: description },
    { property: "og:title", content: `${name} | IEEE Sahrdaya` },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:image", content: absoluteImage(society?.bannerUrl || society?.logoUrl || "") },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export async function loader({ params }: LoaderFunctionArgs): Promise<SocietyDetailLoaderData> {
  if (!params.slug) throw new Response("Society not found", { status: 404 });
  let page: SocietyPageData;
  try {
    page = await fetchSocietyData(params.slug);
  } catch {
    throw new Response("Society not found", { status: 404 });
  }

  const [directoryResult, storyResult] = await Promise.all([
    fetchSocieties(),
    getLatestPublishedBlogsForSociety(page.society.id, 3).catch(() => []),
  ]);
  const directory = directoryResult.length > 0
    ? directoryResult
    : [{ id: page.society.id, name: page.society.name, slug: page.society.slug, bio: page.society.bio, logoUrl: page.society.logoUrl }];

  return { page, directory, stories: storyResult };
}

export default function SocietyPage() {
  const data = useLoaderData<typeof loader>();
  const society = data.page.society;
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: society.name,
    url: `${APP_URL}/societies/${society.slug}`,
    parentOrganization: { "@type": "Organization", name: "IEEE Sahrdaya Student Branch", url: APP_URL },
    ...(society.logoUrl ? { logo: absoluteImage(society.logoUrl) } : {}),
  };

  return (
    <>
      <CanonicalLink path={`/societies/${society.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema).replace(/</g, "\\u003c") }} />
      <SocietyDetailView page={data.page} directory={data.directory} stories={data.stories} />
    </>
  );
}
