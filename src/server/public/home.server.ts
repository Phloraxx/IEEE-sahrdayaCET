import { createPublicPB } from "@/lib/pb.server";
import { getField } from "@/lib/safe-get";
import { buildFileUrl } from "@/lib/pb";
import { isPastEvent } from "@/lib/event-lifecycle";
import type { Society } from "@/types";

export interface HomeData {
  latestEvent: { id: string; title: string; description: string; date: string; timeTbc: boolean; bannerUrl: string } | null;
  societies: Society[];
}

export async function fetchHomeData(): Promise<HomeData> {
  try {
    const pb = createPublicPB()
    const [eventsResult, societiesRes] = await Promise.allSettled([
      pb.collection('events').getFullList({
        batch: 100,
        filter: 'status="published"',
        sort: 'date',
        fields: 'id,title,description,date,endDate,timeTbc,banner,status',
      }),
      pb.collection('societies').getFullList({
        batch: 200,
        filter: 'isHidden=false',
        sort: 'name',
        fields: 'id,name,slug,logo',
      }),
    ])

    const societies: Society[] =
      societiesRes.status === 'fulfilled'
        ? societiesRes.value.map((s: Record<string, unknown>) => ({
            id: getField(s, 'id', ''),
            name: getField(s, 'name', ''),
            slug: getField(s, 'slug', ''),
            logoUrl: s.logo
              ? buildFileUrl('societies', getField(s, 'id', ''), getField(s, 'logo', ''))
              : undefined,
          }))
        : []

    // Events are sorted ascending, so the first event whose effective end time
    // has not elapsed is the actual next/upcoming event. This avoids featuring
    // the furthest-future event on the homepage.
    const nextEventRecord =
      eventsResult.status === 'fulfilled'
        ? eventsResult.value.find((event) =>
            !isPastEvent({
              status: getField(event, 'status', 'published'),
              date: getField(event, 'date', ''),
              endDate: getField(event, 'endDate', ''),
              timeTbc: Boolean(getField(event, 'timeTbc', false)),
            }),
          )
        : undefined

    const latestEvent = nextEventRecord
      ? {
          id: getField(nextEventRecord, 'id', ''),
          title: getField(nextEventRecord, 'title', ''),
          description: getField(
            nextEventRecord,
            'description',
            'Join us for this exciting IEEE event!',
          ),
          date: getField(nextEventRecord, 'date', ''),
          timeTbc: Boolean(getField(nextEventRecord, 'timeTbc', false)),
          bannerUrl: nextEventRecord.banner
            ? buildFileUrl(
                'events',
                getField(nextEventRecord, 'id', ''),
                getField(nextEventRecord, 'banner', ''),
              )
            : '',
        }
      : null

    return { latestEvent, societies }
  } catch {
    return { latestEvent: null, societies: [] }
  }
}
