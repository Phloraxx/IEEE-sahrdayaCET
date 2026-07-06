import type React from 'react';

export interface NavItem {
    label: string;
    href: string;
    isActive?: boolean;
}

export interface FloatingIconProps {
    icon: React.ReactNode;
    label: string;
    x: string;
    y: string;
    delay?: number;
}

export interface Society {
    id: string;
    createdAt?: string;
    updatedAt?: string;
    name: string;
    slug: string;
    bio?: string;
    logoUrl?: string;
    bannerUrl?: string;
    logo?: { url?: string } | string | number | null;
    banner?: { url?: string } | string | number | null;
    isHidden?: boolean;
    chairs?: string[];
  defaultWhatsappLink?: string;
}

export interface Coupon {
    id: string
    event: string
    code: string
    discountPercent: number
    maxUses: number
    usedCount: number
    expiresAt?: string
    isActive: boolean
    createdAt?: string
    updatedAt?: string
}

export interface Event {
    id: string;
    createdAt?: string;
    updatedAt?: string;
    title: string;
    description?: string;
    date: string;
    endDate?: string;
    venue?: string;
    price: number;
    bannerUrl?: string;
    banner?: string | null;
    /** Society relation. When expanded, an object; otherwise the society ID string. */
    society?: { id: string; name?: string; slug?: string; logoUrl?: string } | string;
    societyId?: string;
    status?: string;
    maxCapacity?: number;
    registeredCount?: number;
    checkedInCount?: number;
    registrationOpen?: boolean;
    registrationStart?: string;
    registrationDeadline?: string;
    formTemplate?: unknown;
    isPaid?: boolean;
    checkInEnabled?: boolean;
    collectIeeeMember?: boolean;
    contactEmail?: string;
    contactPhone?: string;
    coupons?: Coupon[];
    externalLink?: string;
    externalFormUrl?: string;
    tags?: string;
  whatsappLink?: string;
    isDeleted?: boolean;
}

export type EventWithSociety = Event & { society: Society };
export type EventExtended = EventWithSociety & { about?: string; agenda?: string; color?: string; textColor?: string };
export type ExtendedEvent = EventExtended;

export interface AgendaItem {
    time: string;
    title: string;
}

export interface AuthUser {
    id: string
    email?: string | null
    name?: string | null
    role?: 'admin' | 'chair' | 'user' | 'content'
}

/**
 * Execom member — matches the `execom` PocketBase collection schema.
 * Used by home page, society pages, and full execom page.
 */
export interface ExecomMember {
    id: string;
    name: string;
    position: string;
    department?: string;
    batch?: string;
    section?: string;
    sectionId?: string;
    order?: number;
    photo?: string;
    photoUrl?: string;
    linkedin?: string;
    instagram?: string;
    email?: string;
    phone?: string;
    category?: string;
}


export interface LatestEvent {
    id: string;
    title: string;
    shortTitle?: string;
    description?: string;
    date: string;
    bannerUrl?: string;
    banner?: { url?: string } | string | number | null;
    tag?: string;
}

/**
 * Canonical Registration type — superset of all registration display variants.
 * Use Pick<> or Partial<> where not all fields are needed.
 */
export interface Registration {
  id: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  registrationStatus: string;
  paymentStatus: string;
  checkedIn: boolean;
  checkedInAt?: string;
  ticketId?: string;
  amount: number;
  couponCode?: string;
  discountAmount?: number;
  paymentData?: unknown;
  formResponses?: unknown;
  createdAt: string;
  eventTitle?: string;
  eventId?: string;
}
/**
 * Blog post — content for the public `/blog` page.
 * Author and society are stored as expanded objects (when available)
 * to keep the listing render path simple.
 */
export interface BlogPost {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  coverUrl?: string;
  cover?: string | null;
  /** Reading time in minutes. */
  readMinutes?: number;
  /** Topic / category key (e.g. "ai-ml", "robotics"). */
  topic?: string;
  topicLabel?: string;
  /** Free-form tags. */
  tags?: string[];
  author?: { id?: string; name?: string; role?: string; photoUrl?: string } | string;
  societyId?: string;
  eventId?: string;
  society?: { id: string; name?: string; slug?: string; logoUrl?: string } | string;
  event?: { id: string; title: string } | string;
  category?: "IEEE" | "Society" | "Event" | string;
  publishedAt?: string;
  published?: boolean;
  isFeatured?: boolean;
  isDraft?: boolean;
}

export interface BlogTopic {
  /** Stable key, e.g. "ai-ml". */
  key: string;
  /** Display label, e.g. "AI & Machine Learning". */
  label: string;
  /** One of: "cream" | "lavender" | "dark" | "mint" — used to pick the card surface. */
  tone: "cream" | "lavender" | "dark" | "mint";
  /** Optional descriptive blurb. */
  blurb?: string;
  /** Posts shown inside the topic card (typically 3). */
  posts: BlogPost[];
}

export interface FormField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number' | 'email' | 'phone' | 'date' | 'boolean'
  required: boolean
  options: string[]
  placeholder?: string
  defaultValue?: string
  dependsOn?: { fieldId: string; value: string }
}
