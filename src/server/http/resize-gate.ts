/**
 * Concurrency gate for image resizing.
 *
 * `sharp` is CPU-bound and libvips fans a single resize out across threads, so a
 * handful of simultaneous `?w=` requests can saturate every core and turn the
 * whole site into a queue. The rate limiter in `rate-limit.ts` bounds requests
 * per minute, but a burst inside the allowance is still enough to stall the
 * event loop's neighbours.
 *
 * This gate keeps at most `maxActive` resizes in flight and holds a bounded
 * queue. Past the queue the request fails fast (the caller answers 429) rather
 * than joining an unbounded wait, because an unbounded wait is the denial of
 * service it is trying to prevent.
 */

export class ResizeBusyError extends Error {
	constructor() {
		super("Image resize capacity exhausted");
		this.name = "ResizeBusyError";
	}
}

interface Waiter {
	resolve: (release: () => void) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface ResizeGateOptions {
	/** Resizes allowed to run at once. */
	maxActive?: number;
	/** Requests allowed to wait for a slot. */
	maxQueue?: number;
	/** How long a queued request waits before it is refused. */
	waitMs?: number;
}

export class ResizeGate {
	private active = 0;
	private readonly waiters: Waiter[] = [];
	private readonly maxActive: number;
	private readonly maxQueue: number;
	private readonly waitMs: number;

	constructor(options: ResizeGateOptions = {}) {
		this.maxActive = Math.max(1, options.maxActive ?? 2);
		this.maxQueue = Math.max(0, options.maxQueue ?? 16);
		this.waitMs = Math.max(0, options.waitMs ?? 5_000);
	}

	/** Resolve with an idempotent release function, or reject with ResizeBusyError. */
	async acquire(): Promise<() => void> {
		if (this.active < this.maxActive) {
			this.active += 1;
			return this.releaser();
		}

		if (this.waiters.length >= this.maxQueue) throw new ResizeBusyError();

		return new Promise<() => void>((resolve, reject) => {
			const waiter: Waiter = {
				resolve,
				timer: setTimeout(() => {
					const index = this.waiters.indexOf(waiter);
					if (index !== -1) this.waiters.splice(index, 1);
					reject(new ResizeBusyError());
				}, this.waitMs),
			};
			// Do not keep a Node process alive for a queued image.
			waiter.timer.unref?.();
			this.waiters.push(waiter);
		});
	}

	/** Exposed for the health endpoint and tests. */
	stats(): { active: number; queued: number; maxActive: number; maxQueue: number } {
		return {
			active: this.active,
			queued: this.waiters.length,
			maxActive: this.maxActive,
			maxQueue: this.maxQueue,
		};
	}

	private releaser(): () => void {
		let released = false;
		return () => {
			if (released) return;
			released = true;

			const next = this.waiters.shift();
			if (next) {
				// Hand the slot straight over: `active` stays the same.
				clearTimeout(next.timer);
				next.resolve(this.releaser());
				return;
			}
			this.active = Math.max(0, this.active - 1);
		};
	}
}

/** The process-wide gate. Bounds are deliberately small; a resize is ~0.3–0.7 s. */
export const resizeGate = new ResizeGate({ maxActive: 2, maxQueue: 16, waitMs: 5_000 });
