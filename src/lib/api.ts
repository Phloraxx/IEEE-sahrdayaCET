export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    const data = await res.json();
    if (!res.ok) {
        throw new ApiError(data.error || data.message || 'Request failed', res.status);
    }
    return data as T;
}

export function buildPayloadQuery(params: Record<string, string | number | boolean | undefined>): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            searchParams.set(key, String(value));
        }
    }
    return searchParams.toString();
}
