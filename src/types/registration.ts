// Registration Types

import { z } from 'zod';
import {
  formTemplateSchema,
  customFieldSchema
} from '@/lib/validation/schemas';

export type FormField = z.infer<typeof customFieldSchema>;
export type FormTemplate = z.infer<typeof formTemplateSchema>;

export interface RegistrationData {
    name?: string;
    email?: string;
    phone?: string;
    semester?: string;
    department?: string;
    section?: string;
    rollNumber?: string;
    customFields?: Record<string, string | number | boolean>;
}

export interface Registration {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    eventId: string;
    userId: string;
    ticketId: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'checked_in';
    paymentStatus: 'not_required' | 'pending' | 'completed' | 'failed' | 'refunded';
    paymentAmount?: number;
    paymentTransactionId?: string;
    formData: RegistrationData;
    checkedInAt?: string;
}

export interface Ticket {
    ticketId: string;
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventVenue?: string;
    userId: string;
    userName: string;
    userEmail: string;
    registrationId: string;
    status: Registration['status'];
    qrCodeData: string;
    createdAt: string;
}

export type RegistrationStep = 'auth' | 'form' | 'payment' | 'success';

export interface PaymentInfo {
    upiId: string;
    merchantName: string;
    amount: number;
    ticketId: string;
    transactionNote: string;
}

// Department options
export const DEPARTMENTS = [
    'Computer Science & Engineering',
    'Electronics & Communication Engineering',
    'Electrical & Electronics Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Information Technology',
    'Applied Electronics & Instrumentation',
    'Other',
] as const;

// Semester options
export const SEMESTERS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'] as const;

// Section options
export const SECTIONS = ['A', 'B', 'C', 'D'] as const;
