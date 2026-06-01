import { Databases, Query, Users } from 'node-appwrite';
import { createLogger } from './logger';
import { DATABASE_ID, MEMBERS_COLLECTION_ID } from '../constants/collections';

const logger = createLogger({ action: 'shared-utils' });

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  } catch (e) {
    console.error('[ERROR] Failed to format date', e);
    return '-';
  }
}

export function getPhoneValue(formResponses: Record<string, unknown>): string {
  const phoneField = Object.entries(formResponses).find(
    ([key, val]) => key.toLowerCase().includes('phone') && typeof val === 'string' && val.trim()
  );
  return phoneField ? (phoneField[1] as string).trim() : '';
}

export function getRegistrationIdentity(formResponses: Record<string, unknown>): { name: string; email: string } {
  const nameField = Object.entries(formResponses).find(
    ([key, val]) => key.toLowerCase().includes('name') && typeof val === 'string' && val.trim()
  );
  const emailField = Object.entries(formResponses).find(
    ([key, val]) => key.toLowerCase().includes('email') && typeof val === 'string' && val.trim()
  );
  return {
    name: nameField ? (nameField[1] as string).trim() : 'Unknown',
    email: emailField ? (emailField[1] as string).trim() : '',
  };
}

export function parseFormResponses(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
  } catch (e) { console.error('[ERROR] Failed to parse form responses', e); }
  return {};
}

export async function getUserSocietyIds(userId: string, databases: Databases): Promise<string[]> {
  try {
    const memberships = await databases.listDocuments(
      DATABASE_ID,
      MEMBERS_COLLECTION_ID,
      [Query.equal('user_id', userId), Query.limit(100)]
    );
    return memberships.documents.map((m: Record<string, unknown>) => m.society_id as string).filter(Boolean);
  } catch (error) {
    logger.error('Error fetching user society IDs', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

export async function hasAdminAccess(userId: string, users: Users): Promise<boolean> {
  try {
    const memberships = await users.listMemberships(userId);
    return memberships.memberships.some((m: Record<string, unknown>) => 
      typeof m.teamName === 'string' && m.teamName === 'admins'
    );
  } catch (e) {
    console.error('Failed to check admin access', e);
    return false;
  }
}

// Check if user is a chair (has a membership in a team starting with 'chair_')
export async function isUserChair(userId: string, users: Users): Promise<boolean> {
  try {
    const memberships = await users.listMemberships(userId);
    return memberships.memberships.some((m: Record<string, unknown>) =>
      typeof m.teamName === 'string' && m.teamName.startsWith('chair_')
    );
  } catch (e) {
    console.error('Failed to check chair status', e);
    return false;
  }
}
