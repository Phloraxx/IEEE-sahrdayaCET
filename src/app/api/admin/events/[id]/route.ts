import { NextRequest } from 'next/server'
import { createPB } from '@/lib/pb'
import { requireRole } from '@/lib/auth'
import { handleError } from '@/lib/api-error'

import { softDeleteEvent } from '@/lib/registration-service'
import { parseFormData } from '@/lib/request-helpers'
import { z } from 'zod'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    
    

    const event = await pb.collection('events').getOne(id, { expand: 'society' })
    
    return Response.json({ event })
  } catch (error) {
    return handleError(error, 'admin-events-get')
  }
}

const EventUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  date: z.string().min(1).optional(),
  endDate: z.string().optional(),
  venue: z.string().optional(),
  price: z.number().min(0).optional(),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).optional(),
  maxCapacity: z.number().int().positive().optional(),
  registrationOpen: z.boolean().optional(),
  registrationStart: z.string().optional(),
  registrationDeadline: z.string().optional(),
  formTemplate: z.array(z.record(z.string(), z.unknown())).optional(),
  banner: z.string().optional(),
  checkInEnabled: z.boolean().optional(),
  collectIeeeMember: z.boolean().optional(),
  contactEmail: z.string().optional(),
  contactPhone: z.string().optional(),
  coupons: z.array(z.record(z.string(), z.unknown())).optional(),
  externalLink: z.string().optional(),
  externalFormUrl: z.string().optional(),
  tags: z.string().optional(),
  // society is intentionally excluded — chairs must not move events between societies
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    
    

    

    const body = await parseFormData(req)
    // Whitelist fields — protects against mass-assignment of registeredCount,
    // isDeleted, society, checkedInCount, etc.
    const parsed = EventUpdateSchema.parse(body)

    const event = await pb.collection('events').update(id, parsed)
    return Response.json({ event })
  } catch (error) {
    return handleError(error, 'admin-events-update')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const pb = createPB(req.headers.get('cookie') || undefined)
    const { user } = await requireRole(['admin', 'chair'], pb)
    
    

    

    await softDeleteEvent(pb, id)
    return Response.json({ success: true })
  } catch (error) {
    return handleError(error, 'admin-events-delete')
  }
}
