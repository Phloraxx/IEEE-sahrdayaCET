import type PocketBase from 'pocketbase'
import { getField } from './safe-get'
import { formatDateShort } from './dates'
import { registrationReportingSnapshot } from './registration-reporting'

/** CSV batch size for streaming exports. */
const CSV_BATCH_SIZE = 500

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Formula-injection protection: prefix dangerous leading chars so spreadsheet
  // apps don't evaluate the cell as a formula. Prefix with a single quote and
  // let Excel/Sheets strip it on import.
  if (/^[=+\-\t\r@`|]/.test(s)) s = `'${s}`
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

interface FormFieldDef {
  id: string
  label: string
  name?: string
  type?: string
}

export interface EventLite {
  id: string
  formTemplate?: unknown
  title?: string
}

export interface AdminRegistrationExportOptions {
  financeAuthorized?: boolean
  eventId?: string
  status?: string
  paymentStatus?: string
  source?: string
  search?: string
  attentionOnly?: boolean
  registeredFrom?: string
  registeredTo?: string
}

interface ProjectedRegistrationPage {
  registrations: Array<Record<string, unknown> & { id: string }>
  total: number
  page: number
  perPage: number
  hasMore: boolean
}

function registrationQuery(
  page: number,
  perPage: number,
  options: AdminRegistrationExportOptions = {},
): string {
  const query = new URLSearchParams({ page: String(page), perPage: String(perPage) })
  if (options.eventId) query.set('event', options.eventId)
  if (options.status && options.status !== 'all') query.set('status', options.status)
  if (options.source && options.source !== 'all') query.set('source', options.source)
  if (options.search) query.set('search', options.search)
  if (options.registeredFrom) query.set('registeredFrom', options.registeredFrom)
  if (options.registeredTo) query.set('registeredTo', options.registeredTo)
  if (options.financeAuthorized) {
    if (options.paymentStatus && options.paymentStatus !== 'all') query.set('paymentStatus', options.paymentStatus)
    if (options.attentionOnly) query.set('attention', '1')
  }
  return query.toString()
}

async function getProjectedRegistrationPage(
  pb: PocketBase,
  page: number,
  perPage: number,
  options: AdminRegistrationExportOptions = {},
): Promise<ProjectedRegistrationPage> {
  return pb.send(
    `/api/admin/registrations?${registrationQuery(page, perPage, options)}`,
    {},
  ) as Promise<ProjectedRegistrationPage>
}

function paymentProviderForExport(value: unknown, paymentStatus: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return String(paymentStatus || '') === 'not_required' ? 'not_required' : 'unknown'
  }
  const data = value as Record<string, unknown>
  if (data.manualConfirmation || data.provider === 'manual') return 'manual'
  if (data.provider === 'razorpay' || data.provider === 'razorpay_live') return 'razorpay'
  if (data.provider === 'paygate' || data.provider === 'legacy_paygate') return 'legacy_paygate'
  return String(data.provider || 'unknown')
}

/**
 * Streams an event registration export from the projected admin API. The API
 * enforces event scope and chooses the row projection; financeAuthorized only
 * controls whether finance columns are written for the caller's authorized
 * scope.
 */
export async function streamRegistrationsCSV(
  pb: PocketBase,
  eventId: string,
  options?: { adminFormat?: boolean; financeAuthorized?: boolean; event?: EventLite },
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  const finance = options?.financeAuthorized === true
  const adminFormat = options?.adminFormat === true

  let customFields: FormFieldDef[] = []
  try {
    const event = options?.event ?? await pb.collection('events').getOne<EventLite>(eventId, { fields: 'id,formTemplate,title' })
    if (Array.isArray(event.formTemplate)) customFields = event.formTemplate as FormFieldDef[]
  } catch {
    // Non-fatal — proceed with static columns only.
  }

  const safeHeaders = adminFormat
    ? ['name', 'email', 'phone', 'registration_date', 'registration_status', 'checked_in', 'checked_in_at', 'ticket_id']
    : ['Name', 'Email', 'Phone', 'Registration Date', 'Registration Status', 'Checked In', 'Checked In At', 'Ticket ID']
  const safeReportingHeaders = adminFormat
    ? ['programme_code', 'programme', 'semester', 'study_year', 'ieee_member', 'ieee_member_id']
    : ['Programme Code', 'Programme', 'Semester', 'Study Year', 'IEEE Member', 'IEEE Member ID']
  const financeHeaders = adminFormat
    ? ['payment_status', 'provider', 'amount', 'collected_amount', 'refunded_amount', 'payment_method', 'discount_source', 'coupon_code', 'discount_amount', 'payment_ticket_id', 'provider_status', 'manual_review', 'review_reason', 'internal_notes', 'created_by']
    : ['Payment Status', 'Provider', 'Amount', 'Collected Amount', 'Refunded Amount', 'Payment Method', 'Discount Source', 'Coupon Code', 'Discount Amount', 'Payment Ticket ID', 'Provider Status', 'Manual Review', 'Review Reason', 'Internal Notes', 'Created By']
  const headers = finance ? [...safeHeaders, ...financeHeaders, ...safeReportingHeaders, ...customFields.map((f) => f.label || f.id)] : [...safeHeaders, ...safeReportingHeaders, ...customFields.map((f) => f.label || f.id)]
  const formatDate = (value: string | null | undefined) => {
    if (!value) return ''
    if (!adminFormat) return formatDateShort(value)
    try { return new Date(value).toISOString() } catch { return '' }
  }
  const headerRow = headers.map(escapeCsv).join(',')

  const queue: string[] = [`${headerRow}\n`]
  let page = 1
  let exhausted = false

  const pullBatch = async () => {
    if (exhausted) return
    const result = await getProjectedRegistrationPage(pb, page, CSV_BATCH_SIZE, {
      eventId,
      financeAuthorized: finance,
    })
    for (const reg of result.registrations) {
      const formResponses = getField<Record<string, unknown>>(reg, 'formResponses', {})
      const reporting = registrationReportingSnapshot(reg)
      const safeCols = [
        escapeCsv(getField(reg, 'userName', '')),
        escapeCsv(getField(reg, 'userEmail', '')),
        escapeCsv(getField(reg, 'userPhone', '')),
        escapeCsv(formatDate(getField(reg, 'registrationDate', ''))),
        escapeCsv(getField(reg, 'registrationStatus', '')),
        escapeCsv(getField(reg, 'checkedIn', false) ? (adminFormat ? 'yes' : 'Yes') : (adminFormat ? 'no' : 'No')),
        escapeCsv(formatDate(getField(reg, 'checkedInAt', ''))),
        escapeCsv(getField(reg, 'ticketId', '')),
      ]
      const financeCols = finance ? [
        escapeCsv(getField(reg, 'paymentStatus', '')),
        escapeCsv(getField(reg, 'provider', paymentProviderForExport(getField(reg, 'paymentData', null), getField(reg, 'paymentStatus', '')))),
        escapeCsv(getField(reg, 'amount', 0)),
        escapeCsv(getField(reg, 'collectedAmount', 0)),
        escapeCsv(getField(reg, 'refundedAmount', 0)),
        escapeCsv(getField(reg, 'paymentMethod', '')),
        escapeCsv(reporting.discountSource),
        escapeCsv(reporting.couponCode),
        escapeCsv(reporting.discountAmount),
        escapeCsv(getField(reg, 'paymentTicketId', '')),
        escapeCsv(getField(reg, 'providerStatus', '')),
        escapeCsv(getField(reg, 'manualReview', false) ? 'yes' : 'no'),
        escapeCsv(getField(reg, 'reviewReason', '')),
        escapeCsv(getField(reg, 'internalNotes', '')),
        escapeCsv(getField(reg, 'createdBy', '')),
      ] : []
      const reportingCols = [
        escapeCsv(reporting.programmeCode),
        escapeCsv(reporting.programme),
        escapeCsv(reporting.semester),
        escapeCsv(reporting.studyYear ?? ''),
        escapeCsv(reporting.ieeeMember ? (adminFormat ? 'yes' : 'Yes') : (adminFormat ? 'no' : 'No')),
        escapeCsv(reporting.ieeeMemberId),
      ]
      const customCols = customFields.map((f) => escapeCsv(formResponses[f.name || f.id]))
      queue.push(`${[...safeCols, ...financeCols, ...reportingCols, ...customCols].join(',')}\n`)
    }
    exhausted = result.hasMore !== true || result.registrations.length < CSV_BATCH_SIZE
    page++
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (queue.length > 0) {
          controller.enqueue(encoder.encode(queue.shift()!))
        } else if (!exhausted) {
          await pullBatch()
          if (queue.length > 0) controller.enqueue(encoder.encode(queue.shift()!))
          else controller.close()
        } else {
          controller.close()
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

/** Filename for a CSV export, sanitized from the event title. */
export function csvFilename(eventTitle: string | undefined, eventId: string): string {
  const base = (eventTitle || `registrations-${eventId}`).replace(/[^a-zA-Z0-9]/g, '_')
  return `${base}_registrations.csv`
}

/** Cross-event admin registration ledger export. */
export async function streamAdminRegistrationsCSV(
  pb: PocketBase,
  options: AdminRegistrationExportOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  const finance = options.financeAuthorized === true
  const safeHeaders = [
    'event', 'event_id', 'name', 'email', 'phone', 'registration_status',
    'ticket_id', 'checked_in', 'checked_in_at', 'registration_date', 'source',
    'programme_code', 'programme', 'semester', 'study_year', 'ieee_member', 'ieee_member_id',
  ]
  const financeHeaders = [
    'payment_status', 'provider', 'amount', 'collected_amount', 'refunded_amount',
    'payment_method', 'discount_source', 'coupon_code', 'discount_amount',
    'payment_ticket_id', 'provider_status', 'manual_review', 'review_reason',
    'internal_notes', 'created_by',
  ]
  const headers = finance ? ['event', 'event_id', 'name', 'email', 'phone', 'registration_status', ...financeHeaders, 'ticket_id', 'checked_in', 'checked_in_at', 'registration_date', 'source', 'programme_code', 'programme', 'semester', 'study_year', 'ieee_member', 'ieee_member_id'] : safeHeaders
  const queue: string[] = [`${headers.join(',')}\n`]
  let page = 1
  let exhausted = false

  const pullBatch = async () => {
    if (exhausted) return
    const result = await getProjectedRegistrationPage(pb, page, CSV_BATCH_SIZE, options)
    for (const reg of result.registrations) {
      const reporting = registrationReportingSnapshot(reg)
      const safeCols = [
        escapeCsv(getField(reg, 'eventTitle', '')),
        escapeCsv(getField(reg, 'eventId', getField(reg, 'event', ''))),
        escapeCsv(getField(reg, 'userName', '')),
        escapeCsv(getField(reg, 'userEmail', '')),
        escapeCsv(getField(reg, 'userPhone', '')),
        escapeCsv(getField(reg, 'registrationStatus', '')),
        escapeCsv(getField(reg, 'ticketId', '')),
        escapeCsv(getField(reg, 'checkedIn', false) ? 'yes' : 'no'),
        escapeCsv(getField(reg, 'checkedInAt', '')),
        escapeCsv(getField(reg, 'registrationDate', '')),
        escapeCsv(getField(reg, 'registrationSource', 'self_service')),
        escapeCsv(reporting.programmeCode),
        escapeCsv(reporting.programme),
        escapeCsv(reporting.semester),
        escapeCsv(reporting.studyYear ?? ''),
        escapeCsv(reporting.ieeeMember ? 'yes' : 'no'),
        escapeCsv(reporting.ieeeMemberId),
      ]
      const financeCols = finance ? [
        escapeCsv(getField(reg, 'paymentStatus', '')),
        escapeCsv(getField(reg, 'provider', paymentProviderForExport(getField(reg, 'paymentData', null), getField(reg, 'paymentStatus', '')))),
        escapeCsv(getField(reg, 'amount', 0)),
        escapeCsv(getField(reg, 'collectedAmount', 0)),
        escapeCsv(getField(reg, 'refundedAmount', 0)),
        escapeCsv(getField(reg, 'paymentMethod', '')),
        escapeCsv(reporting.discountSource),
        escapeCsv(reporting.couponCode),
        escapeCsv(reporting.discountAmount),
        escapeCsv(getField(reg, 'paymentTicketId', '')),
        escapeCsv(getField(reg, 'providerStatus', '')),
        escapeCsv(getField(reg, 'manualReview', false) ? 'yes' : 'no'),
        escapeCsv(getField(reg, 'reviewReason', '')),
        escapeCsv(getField(reg, 'internalNotes', '')),
        escapeCsv(getField(reg, 'createdBy', '')),
      ] : []
      if (finance) {
        const [event, eventId, name, email, phone, status, ...rest] = safeCols
        const ticketId = rest.shift()!
        queue.push(`${[event, eventId, name, email, phone, status, ...financeCols, ticketId, ...rest].join(',')}\n`)
      } else {
        queue.push(`${safeCols.join(',')}\n`)
      }
    }
    exhausted = result.hasMore !== true || result.registrations.length < CSV_BATCH_SIZE
    page++
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (queue.length > 0) {
          controller.enqueue(encoder.encode(queue.shift()!))
          return
        }
        if (!exhausted) {
          await pullBatch()
          if (queue.length > 0) {
            controller.enqueue(encoder.encode(queue.shift()!))
            return
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}

/** Cross-event admin event catalogue export. */
export async function streamAdminEventsCSV(pb: PocketBase): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder()
  const headers = ['id', 'title', 'slug', 'society', 'date', 'end_date', 'venue', 'status', 'price', 'registration_open', 'max_capacity', 'registered_count', 'checked_in_count']
  const queue: string[] = [`${headers.join(',')}\n`]
  let page = 1
  let exhausted = false
  const pullBatch = async () => {
    if (exhausted) return
    const result = await pb.collection('events').getList(page, CSV_BATCH_SIZE, {
      filter: 'isDeleted = false',
      sort: '-date',
      expand: 'society',
    })
    for (const event of result.items) {
      const society = event.expand?.society as Record<string, unknown> | undefined
      const cols = [
        escapeCsv(event.id),
        escapeCsv(getField(event, 'title', '')),
        escapeCsv(getField(event, 'slug', '')),
        escapeCsv(getField(society, 'name', '')),
        escapeCsv(getField(event, 'date', '')),
        escapeCsv(getField(event, 'endDate', '')),
        escapeCsv(getField(event, 'venue', '')),
        escapeCsv(getField(event, 'status', '')),
        escapeCsv(getField(event, 'price', 0)),
        escapeCsv(getField(event, 'registrationOpen', false) ? 'yes' : 'no'),
        escapeCsv(getField(event, 'maxCapacity', 0)),
        escapeCsv(getField(event, 'registeredCount', 0)),
        escapeCsv(getField(event, 'checkedInCount', 0)),
      ]
      queue.push(`${cols.join(',')}\n`)
    }    if (result.items.length < CSV_BATCH_SIZE) exhausted = true
    page++
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (queue.length > 0) {
          controller.enqueue(encoder.encode(queue.shift()!))
          return
        }
        if (!exhausted) {
          await pullBatch()
          if (queue.length > 0) {
            controller.enqueue(encoder.encode(queue.shift()!))
            return
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
}
