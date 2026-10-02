import { buildFileUrl } from "@/lib/pb";
import { createPublicPB } from "@/lib/pb.server";
import { blogHtmlToPlainText } from "@/lib/blog-content";
import { getLatestPublishedBlogs } from "@/lib/blog-public.server";
import { canRegisterForEvent, isPastEvent } from "@/lib/event-lifecycle";
import { getExpand, getField } from "@/lib/safe-get";
import { fetchExecomData } from "./execom.server";
import { logError } from "@/lib/logger";
import type { ExecomMemberDoc } from "@/features/execom/ExecomClient";
import type { BlogPost, Society } from "@/types";

export interface HomeEventSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string;
  endDate: string;
  timeTbc: boolean;
  venue: string;
  price: number;
  bannerUrl: string;
  registrationAvailable: boolean;
  society?: { id: string; name: string; slug: string };
}

export interface HomeData {
  upcomingEvents: HomeEventSummary[];
  upcomingCount: number;
  societies: Society[];
  execomCount: number;
  latestBlogs: BlogPost[];
  coreTeam: ExecomMemberDoc[];
  unavailable: string[];
}

function mapHomeEvent(raw: Record<string, unknown>): HomeEventSummary {
  const id = getField(raw, "id", "");
  const status = getField(raw, "status", "published");
  const date = getField(raw, "date", "");
  const endDate = getField(raw, "endDate", "");
  const timeTbc = Boolean(getField(raw, "timeTbc", false));
  const registrationOpen = Boolean(getField(raw, "registrationOpen", false));
  const registrationMode = getField(raw, "registrationMode", "");
  const externalFormUrl = getField(raw, "externalFormUrl", "");
  const registrationStart = getField(raw, "registrationStart", "");
  const registrationDeadline = getField(raw, "registrationDeadline", "");
  const expand = getExpand(raw);
  const societyRaw = expand?.society;
  const banner = getField(raw, "banner", "");

  return {
    id,
    slug: getField(raw, "slug", ""),
    title: getField(raw, "title", ""),
    description: blogHtmlToPlainText(getField(raw, "description", "")),
    date,
    endDate,
    timeTbc,
    venue: getField(raw, "venue", ""),
    price: Number(getField(raw, "price", 0)) || 0,
    bannerUrl: banner ? buildFileUrl("events", id, banner) : "",
    registrationAvailable: canRegisterForEvent({
      status,
      date,
      endDate,
      timeTbc,
      registrationOpen,
      registrationMode,
      externalFormUrl,
      registrationStart,
      registrationDeadline,
    }),
    society: societyRaw
      ? {
          id: getField(societyRaw, "id", ""),
          name: getField(societyRaw, "name", ""),
          slug: getField(societyRaw, "slug", ""),
        }
      : undefined,
  };
}

export async function fetchHomeData(): Promise<HomeData> {
  const fallback: HomeData = {
    upcomingEvents: [],
    upcomingCount: 0,
    societies: [],
    execomCount: 0,
    latestBlogs: [],
    coreTeam: [],
    unavailable: ["programme", "communities", "team", "stories"],
  };

  try {
    const pb = createPublicPB();
    const [eventsResult, societiesResult, execomResult, blogsResult] = await Promise.allSettled([
      pb.collection("events").getFullList({
        batch: 100,
        filter: 'status="published" && isDeleted != true',
        sort: "date",
        expand: "society",
        fields:
          "id,title,slug,description,date,endDate,timeTbc,venue,price,banner,status,registrationOpen,registrationMode,registrationStart,registrationDeadline,maxCapacity,registeredCount,externalFormUrl,society,expand.society.id,expand.society.name,expand.society.slug",
      }),
      pb.collection("societies").getFullList({
        batch: 200,
        filter: "isHidden=false",
        sort: "name",
        fields: "id,name,slug,logo",
      }),
      fetchExecomData(),
      getLatestPublishedBlogs(3),
    ]);

    const societies: Society[] =
      societiesResult.status === "fulfilled"
        ? societiesResult.value.map((society: Record<string, unknown>) => ({
            id: getField(society, "id", ""),
            name: getField(society, "name", ""),
            slug: getField(society, "slug", ""),
            logoUrl: society.logo
              ? buildFileUrl(
                  "societies",
                  getField(society, "id", ""),
                  getField(society, "logo", ""),
                )
              : undefined,
          }))
        : [];

    const allUpcoming =
      eventsResult.status === "fulfilled"
        ? eventsResult.value
            .map((event) => mapHomeEvent(event as Record<string, unknown>))
            .filter((event) => !isPastEvent(event))
        : [];

    const sections = ["programme", "communities", "team", "stories"];
    const results = [eventsResult, societiesResult, execomResult, blogsResult];
    const unavailable = results.flatMap((result, index) => {
      if (result.status === "fulfilled") return [];
      logError(`home-${sections[index]}`, result.reason);
      return [sections[index] ?? "content"];
    });
    return {
      coreTeam: execomResult.status === "fulfilled" ? execomResult.value.filter(member => member.sectionId === "core") : [],
      unavailable,
      upcomingEvents: allUpcoming.slice(0, 4),
      upcomingCount: allUpcoming.length,
      societies,
      execomCount: execomResult.status === "fulfilled" ? execomResult.value.length : 0,
      latestBlogs: blogsResult.status === "fulfilled" ? (blogsResult.value as BlogPost[]) : [],
    };
  } catch (error) {
    logError("fetchHomeData", error);
    return fallback;
  }
}
