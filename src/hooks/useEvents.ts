'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { EventWithSociety } from '@/components/events';

interface EventsResponse {
    docs: Record<string, unknown>[];
    totalDocs: number;
    limit: number;
    page: number;
    totalPages: number;
}

const fetcher = (url: string) => fetch(url).then(r => {
    if (!r.ok) throw new Error('Failed to fetch');
    return r.json();
});

function mapEvent(doc: Record<string, unknown>): EventWithSociety {
    const bannerRaw = doc.banner;
    const bannerUrl = (doc.bannerUrl as string) || (typeof bannerRaw === 'object' && bannerRaw !== null ? (bannerRaw as { url?: string }).url : undefined) || '';

    return {
        id: Number(doc.id) || 0,
        createdAt: (doc.createdAt as string) || '',
        updatedAt: (doc.updatedAt as string) || '',
        title: doc.title as string,
        description: doc.description as string,
        date: doc.date as string,
        venue: doc.venue as string,
        price: (doc.price as number) || 0,
        bannerUrl,
        status: (doc.status as string) || 'published',
        registrationOpen: doc.registrationOpen as boolean,
        maxCapacity: doc.maxCapacity as number,
        society: undefined,
    };
}

function roundToMinute(iso: string): string {
    return iso.slice(0, 17) + '00.000Z';
}

const UPCOMING_URL = `/api/events?where[status][equals]=published&sort=date&limit=20&depth=1`;

export function useUpcomingEvents() {
    const [url, setUrl] = useState<string>(UPCOMING_URL);

    useEffect(() => {
        const rounded = roundToMinute(new Date().toISOString());
        setUrl(`${UPCOMING_URL}&where[date][greater_than]=${rounded}`);
    }, []);

    const { data, error, isLoading, mutate } = useSWR<EventsResponse>(url, fetcher, {
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 60_000,
        errorRetryCount: 2,
    });

    return {
        events: data?.docs?.map(mapEvent) ?? [],
        loading: isLoading,
        error: error ? 'Unable to load events right now. Please try again in a moment.' : null,
        refresh: () => mutate(),
    };
}
