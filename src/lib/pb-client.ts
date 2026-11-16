/**
 * Browser data client.
 *
 * Phase 4 replaces the PocketBase SDK here. The module keeps the *shape* the
 * existing data modules call (`send`, `collection(...).getList(...)`, …) so the
 * 25 modules above it did not have to be rewritten, but every call now goes to
 * an app-server endpoint and the session travels as an HttpOnly cookie.
 *
 * Why keep the shape: the call sites encode real query intent (filters, sorts,
 * expansions) that is worth preserving while the transport changes. Rewriting
 * both at once would have made the diff unreviewable.
 *
 * Path mapping: PocketBase served custom routes under `/api/app/*`. The app
 * serves the same operations at `/api/*`, so `send()` strips that prefix.
 */

/**
 * A PocketBase-shaped record.
 *
 * `unknown` values keep property reads honest (each call site narrows what it
 * needs) without reintroducing `any`, which the lint config forbids.
 */
/* eslint-disable @typescript-eslint/no-explicit-any --
 * This is the browser-facing record shape, and it mirrors PocketBase's own
 * `RecordModel` (`Record<string, any>`). The 25 data modules above this read
 * nested fields (`record.expand.society.name`, `data.ticket.id`) that cannot be
 * typed without rewriting every call site. The value is untrusted JSON from our
 * own API; each module narrows what it actually uses. */
export type RecordModel = Record<string, any> & {
	id: string;
	/** PocketBase-style expansion map. */
	expand?: Record<string, Record<string, any>>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Loosely-typed JSON body, for the `send()` escape hatch. */
export type JsonBody = Record<string, unknown>;

export interface ListResult<T> {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: T[];
}

interface QueryOptions {
	filter?: string;
	sort?: string;
	expand?: string;
	fields?: string;
	skipTotal?: boolean;
	[key: string]: unknown;
}

/** An error carrying the HTTP status, so callers can branch on it. */
export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(path, {
		...init,
		credentials: "same-origin",
		headers: {
			Accept: "application/json",
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...(init.headers ?? {}),
		},
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
		throw new ApiError(body.error ?? body.message ?? `Request failed (${response.status})`, response.status);
	}

	if (response.status === 204) return undefined as T;
	return (await response.json()) as T;
}

/** `/api/app/events/x` -> `/api/events/x`; other paths unchanged. */
function appPath(path: string): string {
	if (path.startsWith("/api/app/")) return `/api/${path.slice("/api/app/".length)}`;
	return path;
}

function queryString(options: QueryOptions): string {
	const params = new URLSearchParams();
	for (const key of ["filter", "sort", "expand", "fields"] as const) {
		const value = options[key];
		if (typeof value === "string" && value) params.set(key, value);
	}
	if (options.skipTotal) params.set("skipTotal", "1");
	const text = params.toString();
	return text ? `?${text}` : "";
}

class CollectionRef {
	constructor(private readonly name: string) {}

	async getList<T = RecordModel>(
		page = 1,
		perPage = 30,
		options: QueryOptions = {},
	): Promise<ListResult<T>> {
		const suffix = queryString(options);
		const joiner = suffix ? "&" : "?";
		return request<ListResult<T>>(
			`/api/collections/${this.name}${suffix}${joiner}page=${page}&perPage=${perPage}`,
		);
	}

	async getFullList<T = RecordModel>(options: QueryOptions = {}): Promise<T[]> {
		const result = await this.getList<T>(1, 500, options);
		return result.items;
	}

	async getOne<T = RecordModel>(id: string, options: QueryOptions = {}): Promise<T> {
		return request<T>(`/api/collections/${this.name}/${encodeURIComponent(id)}${queryString(options)}`);
	}

	async getFirstListItem<T = RecordModel>(filter: string, options: QueryOptions = {}): Promise<T> {
		const result = await this.getList<T>(1, 1, { ...options, filter });
		const first = result.items[0];
		if (!first) throw new ApiError("The requested resource wasn't found.", 404);
		return first;
	}

	async create<T = RecordModel>(
		body: Record<string, unknown> | FormData,
		_options: QueryOptions = {},
	): Promise<T> {
		return request<T>(`/api/collections/${this.name}`, {
			method: "POST",
			body: body instanceof FormData ? body : JSON.stringify(body),
		});
	}

	async update<T = RecordModel>(
		id: string,
		body: Record<string, unknown> | FormData,
		_options: QueryOptions = {},
	): Promise<T> {
		return request<T>(`/api/collections/${this.name}/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: body instanceof FormData ? body : JSON.stringify(body),
		});
	}

	async delete(id: string): Promise<boolean> {
		await request<void>(`/api/collections/${this.name}/${encodeURIComponent(id)}`, {
			method: "DELETE",
		});
		return true;
	}
}

export interface AppClient {
	readonly baseURL: string;
	/** Kept for call-site compatibility; the session is a cookie, not a token. */
	readonly authStore: {
		isValid: boolean;
		record: RecordModel | null;
		token: string;
		clear: () => void;
	};
	send<T = RecordModel>(
		path: string,
		options?: Omit<RequestInit, "body"> & { body?: unknown },
	): Promise<T>;
	collection: (name: string) => CollectionRef;
}

let instance: AppClient | null = null;

/**
 * The browser talks to its own origin. There is no public database hostname in
 * frontend code, and no token to leak.
 */
export function getPbClient(): AppClient {
	if (typeof window === "undefined") {
		throw new Error("getPbClient() is browser-only");
	}
	if (!instance) {
		instance = {
			baseURL: window.location.origin,
			authStore: {
				// The cookie is HttpOnly, so the client cannot inspect it. Callers
				// that pre-checked `isValid` now rely on the 401 from the server.
				isValid: true,
				record: null,
				token: "",
				clear: () => {
					/* the server owns the session */
				},
			},
			send: async <T,>(path: string, options: Omit<RequestInit, "body"> & { body?: unknown } = {}) => {
				const init = { ...options } as RequestInit & { body?: unknown };
				const body = options.body;
				// The PocketBase SDK serialised plain objects for you; keep that.
				if (
					body !== undefined &&
					typeof body === "object" &&
					body !== null &&
					!(body instanceof FormData) &&
					!(body instanceof Blob) &&
					!(body instanceof ArrayBuffer) &&
					!(body instanceof URLSearchParams)
				) {
					init.body = JSON.stringify(body);
				}
				return request<T>(appPath(path), init as RequestInit);
			},
			collection: (name: string) => new CollectionRef(name),
		};
	}
	return instance;
}

/** Escape a value for a filter string (kept for call-site compatibility). */
export function escapeFilterValue(value: string | number | boolean): string {
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "true" : "false";
	return `'${value.replace(/\0/g, "").replace(/'/g, "''")}'`;
}
