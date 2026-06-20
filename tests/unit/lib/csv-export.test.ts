import { describe, it, expect, vi } from 'vitest'
import { streamRegistrationsCSV, csvFilename } from '@/lib/csv-export'

function makeMockPB(registrations: Record<string, unknown>[], formTemplate?: unknown) {
  let pageCalls = 0
  return {
    collection: vi.fn((name: string) => {
      if (name === 'events') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'evt-1',
            formTemplate: formTemplate || null,
          }),
        }
      }
      if (name === 'registrations') {
        return {
          getList: vi.fn(async (page: number, perPage: number) => {
            pageCalls++
            if (page === 1) {
              return {
                items: registrations,
                totalItems: registrations.length,
                page,
                perPage,
                totalPages: 1,
              }
            }
            return {
              items: [],
              totalItems: 0,
              page,
              perPage,
              totalPages: 1,
            }
          }),
        }
      }
      throw new Error(`Unexpected collection: ${name}`)
    }),
  }
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  result += decoder.decode()
  return result
}

describe('streamRegistrationsCSV', () => {
  it('returns CSV with header and data rows', async () => {
    const pb = makeMockPB([
      {
        userName: 'John Doe',
        userEmail: 'john@test.com',
        userPhone: '9876543210',
        registrationDate: '2026-06-10T10:00:00.000Z',
        paymentStatus: 'not_required',
        registrationStatus: 'confirmed',
        checkedIn: false,
        checkedInAt: null,
        ticketId: 'TKT-abc123',
        paymentTicketId: null,
        couponCode: '',
        discountAmount: 0,
        formResponses: { college: 'Sahrdaya' },
      },
    ])

    const stream = await streamRegistrationsCSV(pb as any, 'evt-1')
    const csv = await readStream(stream)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toContain('Name')
    expect(lines[0]).toContain('Email')
    expect(lines[0]).toContain('Phone')
    expect(lines[1]).toContain('John Doe')
    expect(lines[1]).toContain('john@test.com')
  })

  it('includes coupon columns when adminFormat is true', async () => {
    const pb = makeMockPB([
      {
        userName: 'Jane',
        userEmail: 'jane@test.com',
        userPhone: '9876543211',
        registrationDate: '2026-06-10T10:00:00.000Z',
        paymentStatus: 'paid',
        registrationStatus: 'confirmed',
        checkedIn: true,
        checkedInAt: '2026-06-11T12:00:00.000Z',
        ticketId: 'TKT-def456',
        paymentTicketId: null,
        couponCode: 'DISCOUNT10',
        discountAmount: 50,
        formResponses: {},
      },
    ])

    const stream = await streamRegistrationsCSV(pb as any, 'evt-1', { adminFormat: true })
    const csv = await readStream(stream)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toContain('coupon_code')
    expect(lines[0]).toContain('discount_amount')
    expect(lines[1]).toContain('DISCOUNT10')
    expect(lines[1]).toContain('₹50')
  })

  it('handles empty registrations', async () => {
    const pb = makeMockPB([])
    const stream = await streamRegistrationsCSV(pb as any, 'evt-1')
    const csv = await readStream(stream)
    expect(csv.trim()).toBeTruthy()
    const lines = csv.trim().split('\n')
    expect(lines.length).toBe(1)
  })

  it('includes custom form fields as dynamic columns', async () => {
    const formTemplate = [
      { id: 'college', label: 'College', type: 'text' },
      { id: 'year', label: 'Year of Study', type: 'select' },
    ]
    const pb = makeMockPB(
      [
        {
          userName: 'Test',
          userEmail: 'test@test.com',
          userPhone: '9999999999',
          registrationDate: '2026-06-10T10:00:00.000Z',
          paymentStatus: 'pending',
          registrationStatus: 'pending',
          checkedIn: false,
          checkedInAt: null,
          ticketId: null,
          paymentTicketId: null,
          couponCode: '',
          discountAmount: 0,
          formResponses: { college: 'Sahrdaya CET', year: 'S4' },
        },
      ],
      formTemplate,
    )

    const stream = await streamRegistrationsCSV(pb as any, 'evt-1')
    const csv = await readStream(stream)
    const lines = csv.trim().split('\n')

    expect(lines[0]).toContain('College')
    expect(lines[0]).toContain('Year of Study')
    expect(lines[1]).toContain('Sahrdaya CET')
    expect(lines[1]).toContain('S4')
  })

  it('handles formTemplate fetch failure gracefully', async () => {
    const pb = {
      collection: vi.fn(() => ({
        getOne: vi.fn().mockRejectedValue(new Error('Not found')),
        getList: vi.fn(async (page: number, perPage: number) => ({
          items: [],
          totalItems: 0,
          page,
          perPage,
          totalPages: 1,
        })),
      })),
    }
    const stream = await streamRegistrationsCSV(pb as any, 'evt-1')
    const csv = await readStream(stream)
    expect(csv).toBeTruthy()
  })
})

describe('csvFilename', () => {
  it('uses sanitized event title when provided', () => {
    expect(csvFilename('My Event!', 'evt123')).toBe('My_Event__registrations.csv')
  })

  it('falls back to event id when title is missing', () => {
    expect(csvFilename(undefined, 'evt123')).toBe('registrations_evt123_registrations.csv')
  })
})
