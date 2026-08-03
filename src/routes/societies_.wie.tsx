import { useLoaderData } from "react-router";
import { APP_URL } from "@/lib/constants";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { CanonicalLink } from "@/components/CanonicalLink";
import {
  fetchSocietyData,
  type SocietyPageData,
} from "@/server/public/society-detail.server";
import { WIEPage } from "@/features/societies/wie/WIEPage";

export async function loader(): Promise<SocietyPageData> {
  return fetchSocietyData("wie");
}

export const meta = ({ data }: { data?: SocietyPageData }) => {
  const title =
    "IEEE Women in Engineering Sahrdaya | Activities, Team and Community";
  const description = data?.society.bio
    ? blogHtmlToPlainText(data.society.bio).slice(0, 155)
    : "Explore IEEE Women in Engineering at Sahrdaya—technical programmes, leadership initiatives, recent activities and the current WIE team.";
  const image = `${APP_URL}/images/wie/ieee-wie-official-background.webp`;
  const url = `${APP_URL}/societies/wie`;

  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:url", content: url },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];
};

export default function WIESocietyRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <>
      <CanonicalLink path="/societies/wie" />
      <WIEPage data={data} />
    </>
  );
}
