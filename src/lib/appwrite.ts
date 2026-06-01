import { Client, Account, Databases, Storage, Teams } from 'appwrite';
import { DATABASE_ID, COLLECTIONS } from '@/lib/constants/collections';

// Environment variables with fallbacks
const APPWRITE_ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '';
const APPWRITE_PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '';

// Initialize Appwrite Client only if we have valid config
const client = new Client();

// Only set endpoint if it's a valid URL
if (APPWRITE_ENDPOINT && APPWRITE_ENDPOINT.startsWith('http')) {
    client.setEndpoint(APPWRITE_ENDPOINT);
}

if (APPWRITE_PROJECT_ID) {
    client.setProject(APPWRITE_PROJECT_ID);
}

// Services
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const teams = new Teams(client);

// Collection IDs (will be set after Appwrite setup)
export const SOCIETIES_COLLECTION_ID = COLLECTIONS.SOCIETIES;
export const EVENTS_COLLECTION_ID = COLLECTIONS.EVENTS;
export const EXECOM_COLLECTION_ID = COLLECTIONS.EXECOM;
export const MEMBERS_COLLECTION_ID = COLLECTIONS.MEMBERS;

// Event System Collection IDs
export const EVENT_REGISTRATIONS_COLLECTION_ID = COLLECTIONS.EVENT_REGISTRATIONS;

// Storage Bucket IDs
export const SOCIETY_IMAGES_BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_SOCIETY_IMAGES_BUCKET_ID || '';

export { client };
