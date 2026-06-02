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
    id?: number;
    $id?: string;
    name: string;
    slug: string;
    bio?: string;
    logo_url?: string;
    banner_url?: string;
}

export interface Event {
    $id?: string;
    id?: number;
    title: string;
    description?: string;
    date: string;
    venue?: string;
    price: number;
    banner_url?: string;
    society_id?: string;
    status?: string;
    max_capacity?: number;
}

export interface EventField {
    id: string;
    type: 'text' | 'email' | 'phone' | 'number' | 'select' | 'textarea' | 'checkbox' | 'radio';
    label: string;
    placeholder?: string;
    required: boolean;
    options?: string[];
}

export type RegistrationStep = 'auth' | 'form' | 'payment' | 'success';
