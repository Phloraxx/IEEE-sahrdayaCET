export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'chair' | 'user'
  avatar?: string
}

export interface Society {
  id: string
  name: string
  slug: string
  bio: string
  logo: string
  banner: string
  chairs: string[]
  isHidden: boolean
  created: string
  updated: string
}

export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled'

export interface Event {
  id: string
  title: string
  description: string
  date: string
  endDate?: string
  venue: string
  price: number
  status: EventStatus
  society: string
  maxCapacity?: number
  registeredCount: number
  checkedInCount: number
  registrationOpen: boolean
  registrationDeadline?: string
  formTemplate?: FormField[]
  banner?: string
  checkInEnabled: boolean
  collectIeeeMember: boolean
  tags?: string
  externalLink?: string
  whatsappLink?: string
  externalFormUrl?: string
  created: string
  updated: string
  expand?: { society?: Society }
}

export interface FormField {
  id: string
  label: string
  type: 'text' | 'number' | 'email' | 'phone' | 'select' | 'textarea'
  required: boolean
  options?: string[]
}

export interface Coupon {
  code: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  maxUses?: number
  usedCount: number
  validFrom: string
  validUntil: string
}

export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled'
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'not_required'

export interface Registration {
  id: string
  user: string
  event: string
  ticketId: string
  paymentStatus: PaymentStatus
  registrationStatus: RegistrationStatus
  checkedIn: boolean
  checkedInAt?: string
  formResponses: Record<string, unknown>
  amount: number
  couponCode?: string
  discountAmount?: number
  expand?: { event?: Event; user?: AuthUser }
}

export interface ExecomMember {
  id: string
  name: string
  position: string
  department?: string
  batch?: string
  section?: string
  sectionId?: string
  order: number
  photo?: string
  linkedin?: string
  instagram?: string
  email?: string
  phone?: string
}

export interface NavItem {
  label: string
  href: string
  isActive?: boolean
}
