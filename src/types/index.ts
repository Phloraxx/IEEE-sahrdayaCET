import React from 'react';

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
}

export interface Coupon {
    id?: string;
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    maxUses: number;
    usedCount: number;
    expiresAt?: string;
    isActive: boolean;
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
    banner?: { url?: string } | string | number | null;
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
    isDeleted?: boolean;
}

export interface EventWithSociety extends Event {
    society?: {
        id: string;
        name: string;
        slug: string;
        logoUrl: string;
    };
}

export interface ExtendedEvent extends EventWithSociety {
    about?: string;
    agenda?: AgendaItem[];
    tags?: string;
    color?: string;
    textColor?: string;
}

export interface AgendaItem {
    time: string;
    title: string;
}

export interface AuthUser {
    id: string
    email?: string | null
    name?: string | null
    role?: string
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

/**
 * Display-oriented execom member (legacy home page shape). Derived from
 * ExecomMember at fetch time.
 */
export interface Member {
    id?: string;
    name: string;
    role: string;
    tagline: string;
    image: string;
    linkedin?: string;
    email?: string;
    phone?: string;
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
