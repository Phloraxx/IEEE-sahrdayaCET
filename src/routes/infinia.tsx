import { InfiniaShowcase } from "@/components/InfiniaShowcase";
import { APP_URL } from "@/lib/constants";
import { INFINIA } from "@/lib/infinia";
const description = "Step inside Infinia, IEEE Sahrdaya’s flagship experience: workshop stories, industry conversations, original posters and photographs. Explore the 2025 and 2024 editions.";
export const meta = () => [
  { title: "Infinia | IEEE Sahrdaya" },
  { name: "description", content: description },
  { property: "og:title", content: "Infinia — Beyond imagination. Into experience." },
  { property: "og:description", content: description },
  { property: "og:url", content: `${APP_URL}/infinia` },
  { property: "og:image", content: `${APP_URL}${INFINIA.cover.src}` },
  { name: "twitter:card", content: "summary_large_image" },
];
export default function InfiniaPage() { return <InfiniaShowcase hub />; }
