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
    id: number;
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
    displayOrder?: number;
    chairs?: string[];
}

export interface Event {
    id: number;
    createdAt?: string;
    updatedAt?: string;
    title: string;
    slug?: string;
    description?: string;
    date: string;
    endDate?: string;
    venue?: string;
    price: number;
    bannerUrl?: string;
    banner?: { url?: string } | string | number | null;
    society?: Society | string;
    status?: string;
    maxCapacity?: number;
    registeredCount?: number;
    checkedInCount?: number;
    registrationOpen?: boolean;
    registrationStart?: string;
    registrationDeadline?: string;
    formTemplate?: unknown;
    enableWaitlist?: boolean;
    waitlistCount?: number;
    isPaid?: boolean;
    ieeeMemberPrice?: number;
    nonMemberPrice?: number;
    earlyBirdPrice?: number;
    earlyBirdDeadline?: string;
    currency?: string;
    checkInEnabled?: boolean;
    selfCheckIn?: boolean;
    contactEmail?: string;
    contactPhone?: string;
    externalLink?: string;
    category?: string;
    speakers?: unknown;
    schedule?: unknown;
    faqs?: unknown;
    isDeleted?: boolean;
}

export interface EventWithSociety extends Event {
    society?: {
        id: number;
        name: string;
        slug: string;
        logoUrl: string;
    };
}

export interface ExtendedEvent extends EventWithSociety {
    about?: string;
    agenda?: AgendaItem[];
    tags?: string[];
    color?: string;
    textColor?: string;
}

export interface AgendaItem {
    time: string;
    title: string;
}

export interface LatestEvent {
    id: number;
    title: string;
    shortTitle?: string;
    description?: string;
    date: string;
    bannerUrl?: string;
    banner?: { url?: string } | string | number | null;
    tag?: string;
}
