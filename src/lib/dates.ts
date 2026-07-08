const DATE_LOCALE = 'en-IN';

/** ISO string helper for building PB date filters. */
export function toIso(date: Date): string {
    return date.toISOString();
}

export function formatDate(dateString: string): string {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(DATE_LOCALE, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
}

export function formatDateTime(dateString: string): string {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(DATE_LOCALE, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

export function formatDateShort(dateString: string): string {
    return new Date(dateString).toLocaleDateString(DATE_LOCALE, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function formatDateCompact(dateString: string): string {
    const d = new Date(dateString);
    return d.toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric' });
}

export function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString(DATE_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

export function formatDay(dateString: string): string {
    return new Date(dateString).getDate().toString().padStart(2, '0');
}

export function formatMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString(DATE_LOCALE, { month: 'short' }).toUpperCase();
}

export function formatHour12(dateString: string): string {
    const t = new Date(dateString).toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', hour12: true });
    return t.split(' ')[0] ?? '';
}

export function formatAMPM(dateString: string): string {
    const t = new Date(dateString).toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', hour12: true });
    return t.split(' ')[1] ?? '';
}
