import { getPayload } from 'payload'
import config from '../payload.config'

const SOCIETIES = [
  { name: 'IEEE Computer Society', slug: 'ieee-cs', bio: 'Advancing computing technology and innovation at Sahrdaya.' },
  { name: 'IEEE WIE', slug: 'ieee-wie', bio: 'Women in Engineering — empowering future tech leaders.' },
  { name: 'IEEE PES', slug: 'ieee-pes', bio: 'Power & Energy Society — sustainable energy solutions.' },
]

const EXECOM = [
  { name: 'Alice Mathew', position: 'Chair', societySlug: 'ieee-cs', batch: '2023-27', department: 'CSE' },
  { name: 'Ben Thomas', position: 'Vice Chair', societySlug: 'ieee-cs', batch: '2023-27', department: 'CSE' },
  { name: 'Catherine Jose', position: 'Chair', societySlug: 'ieee-wie', batch: '2024-28', department: 'ECE' },
  { name: 'Daniel Reji', position: 'Secretary', societySlug: 'ieee-pes', batch: '2024-28', department: 'EEE' },
  { name: 'Eva Kumar', position: 'Treasurer', societySlug: 'ieee-pes', batch: '2023-27', department: 'EEE' },
]

const EVENTS = [
  {
    title: 'Intro to Machine Learning Workshop',
    slug: 'intro-ml-workshop',
    description: 'Hands-on workshop covering the basics of ML with Python and scikit-learn.',
    daysFromNow: 14,
    venue: 'CS Lab 2',
    price: 0,
    societySlug: 'ieee-cs',
    status: 'published',
    maxCapacity: 60,
    isPaid: false,
    category: 'workshop',
  },
  {
    title: 'HackOn 2026',
    slug: 'hackon-2026',
    description: '24-hour hackathon with hardware and software tracks. Prizes worth ₹50,000.',
    daysFromNow: 30,
    venue: 'Main Auditorium',
    price: 200,
    societySlug: 'ieee-cs',
    status: 'published',
    maxCapacity: 150,
    isPaid: true,
    category: 'competition',
  },
  {
    title: 'EmpowerHer Talk',
    slug: 'empowerher-talk',
    description: 'Panel discussion with women leaders in STEM.',
    daysFromNow: 21,
    venue: 'Seminar Hall',
    price: 0,
    societySlug: 'ieee-wie',
    status: 'published',
    maxCapacity: 100,
    isPaid: false,
    category: 'seminar',
  },
  {
    title: 'Renewable Energy Expo',
    slug: 'renewable-energy-expo',
    description: 'Showcase of student projects in solar, wind, and EV tech.',
    daysFromNow: 45,
    venue: 'Open Ground',
    price: 50,
    societySlug: 'ieee-pes',
    status: 'draft',
    maxCapacity: 200,
    isPaid: true,
    category: 'other',
  },
  {
    title: 'Git & GitHub Bootcamp',
    slug: 'github-bootcamp',
    description: 'Past event — version control fundamentals.',
    daysFromNow: -30,
    venue: 'CS Lab 1',
    price: 0,
    societySlug: 'ieee-cs',
    status: 'completed',
    maxCapacity: 50,
    isPaid: false,
    category: 'workshop',
  },
]

async function seed() {
  const payload = await getPayload({ config })

  const existing = await payload.find({ collection: 'societies', limit: 1, overrideAccess: true })
  if (existing.totalDocs > 0) {
    payload.logger.info(`demo seed: skipped (DB has ${existing.totalDocs} societies already)`)
    process.exit(0)
  }

  const societyIdBySlug: Record<string, number> = {}
  for (const s of SOCIETIES) {
    const existing = await payload.find({
      collection: 'societies',
      where: { slug: { equals: s.slug } },
      overrideAccess: true,
    })
    const doc = existing.docs[0] ?? (await payload.create({
      collection: 'societies',
      data: s,
      overrideAccess: true,
    }))
    societyIdBySlug[s.slug] = doc.id as number
    payload.logger.info(`society: ${doc.name} (${doc.id})`)
  }

  for (const m of EXECOM) {
    const existing = await payload.find({
      collection: 'execom',
      where: { name: { equals: m.name } },
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      payload.logger.info(`execom: ${m.name} (skipped, exists)`)
      continue
    }
    const doc = await payload.create({
      collection: 'execom',
      data: {
        name: m.name,
        position: m.position,
        society: societyIdBySlug[m.societySlug],
        batch: m.batch,
        department: m.department,
      },
      overrideAccess: true,
    })
    payload.logger.info(`execom: ${doc.name} (${doc.id})`)
  }

  for (const e of EVENTS) {
    const existing = await payload.find({
      collection: 'events',
      where: { slug: { equals: e.slug } },
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      payload.logger.info(`event: ${e.title} (skipped, exists)`)
      continue
    }
    const date = new Date()
    date.setDate(date.getDate() + e.daysFromNow)
    const { daysFromNow, societySlug, ...rest } = e
    const doc = await payload.create({
      collection: 'events',
      data: {
        ...rest,
        date: date.toISOString(),
        society: societyIdBySlug[societySlug],
        status: rest.status as 'draft' | 'published' | 'archived' | 'completed' | 'cancelled',
      },
      overrideAccess: true,
    })
    payload.logger.info(`event: ${doc.title} (${doc.id}) [${doc.status}]`)
  }

  payload.logger.info('seed done')
  process.exit(0)
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
