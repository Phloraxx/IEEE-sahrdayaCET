export type RegistrationStep = 'auth' | 'form' | 'payment' | 'success';

export interface FormTemplate {
  eventId: string;
  title: string;
  fields: unknown[];
  standardFields: {
    name: boolean;
    email: boolean;
    phone: boolean;
    semester: boolean;
    department: boolean;
    section: boolean;
    rollNumber: boolean;
  };
  customQuestions: Array<{
    id: string;
    type: 'text' | 'email' | 'phone' | 'number' | 'select' | 'textarea' | 'checkbox' | 'radio';
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: string[];
    validation?: {
      min?: number;
      max?: number;
      pattern?: string;
      message?: string;
    };
  }>;
}

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
  id: string;
  createdAt: string;
  updatedAt: string;
  eventId: string;
  userId: string;
  ticketId?: string;
  status: string;
  paymentStatus?: string;
  paymentAmount?: number;
  paymentTransactionId?: string;
  formData?: Record<string, unknown>;
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
  status: 'confirmed' | 'pending' | 'cancelled' | 'checked_in';
  qrCodeData: string;
  createdAt: string;
}

export const DEPARTMENTS = [
  'Computer Science (CS)',
  'Electronics & Communication (EC)',
  'Electrical & Electronics (EE)',
  'Mechanical (ME)',
  'Civil (CE)',
  'Robotics & Automation (RA)',
  'Artificial Intelligence & DS (AI)',
] as const;

export const SEMESTERS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'] as const;

export const SECTIONS = ['A', 'B', 'C', 'D'] as const;
