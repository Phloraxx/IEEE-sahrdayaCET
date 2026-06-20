import { NextRequest } from 'next/server'
import { createPB, escapeFilterValue } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'
import { parsePagination, buildFilter } from '@/lib/route-helpers'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    await requireRole(['admin', 'chair'], pb)
    const url = new URL(req.url)

    const { page, perPage } = parsePagination(url, { defaultPerPage: 20, maxPerPage: 100 })
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')

    // Build base filter — PB collection rules enforce chair/admin scoping
    const baseParts: string[] = []
    if (status && status !== 'all') baseParts.push(`status = ${escapeFilterValue(status)}`)
    if (search) baseParts.push(`title ~ ${escapeFilterValue(search)}`)
    const filter = buildFilter(baseParts)

    const result = await pb.collection('events').getList(page, perPage, {
      filter: filter || undefined,
      sort: '-date',
      expand: 'society',
      fields: 'id,title,date,endDate,venue,price,status,registrationOpen,maxCapacity,registeredCount,checkedInCount,society,expand.society.id,expand.society.name',
    })

    const events = result.items.map((e) => {
      const r = e as unknown as Record<string, unknown>
      const expand = r.expand as Record<string, unknown> | undefined
      const society = expand?.society as Record<string, unknown> | undefined
      return {
        id: r.id,
        title: r.title,
        date: r.date,
        endDate: r.endDate,
        venue: r.venue,
        price: r.price,
        status: r.status,
        registrationOpen: r.registrationOpen,
        maxCapacity: r.maxCapacity,
        registeredCount: r.registeredCount,
        checkedInCount: r.checkedInCount,
        isPaid: Number(r.price) > 0,
        societyName: society?.name || '',
        societyId: society?.id || '',
      }
    })

    return Response.json({ events, total: result.totalItems, page: result.page, perPage: result.perPage })
  } catch (error) {
    return handleError(error, 'admin-events-list')
  }
}

// ─── Create: zod-validated, field-whitelisted, chair-scoped ─────────────

const EventCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  date: z.string().min(1),
  endDate: z.string().optional(),
  venue: z.string().optional().default(''),
  price: z.number().min(0).default(0),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).default('draft'),
  society: z.string().min(1),
  maxCapacity: z.number().int().positive().optional(),
  registrationOpen: z.boolean().default(false),
  registrationStart: z.string().optional(),
  registrationDeadline: z.string().optional(),
  formTemplate: z.array(z.record(z.string(), z.unknown())).optional(),
  banner: z.string().optional(),
  checkInEnabled: z.boolean().default(false),
  collectIeeeMember: z.boolean().default(false),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  coupons: z.array(z.record(z.string(), z.unknown())).optional(),
  externalLink: z.string().optional(),
  externalFormUrl: z.string().optional(),
  tags: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const pb = createPB(req.headers.get('cookie') || undefined)
    await requireRole(['admin', 'chair'], pb)

    const parsed = EventCreateSchema.parse(await req.json())
    // PB createRule enforces chair can only create under their own society
    const event = await pb.collection('events').create(parsed)
    return Response.json({ event }, { status: 201 })
  } catch (error) {
    return handleError(error, 'admin-events-create')
  }
}
