import { describe, expect, it } from "vitest";

import { ResizeBusyError, ResizeGate } from "../../../src/server/http/resize-gate";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("resize gate", () => {
	it("runs up to the limit and hands a released slot to the next waiter", async () => {
		const gate = new ResizeGate({ maxActive: 1, maxQueue: 2, waitMs: 100 });
		const first = await gate.acquire();

		let secondAcquired = false;
		const second = gate.acquire().then((release) => {
			secondAcquired = true;
			return release;
		});

		await tick();
		expect(secondAcquired).toBe(false);
		expect(gate.stats()).toMatchObject({ active: 1, queued: 1 });

		first();
		const releaseSecond = await second;
		expect(secondAcquired).toBe(true);
		expect(gate.stats()).toMatchObject({ active: 1, queued: 0 });

		releaseSecond();
		expect(gate.stats()).toMatchObject({ active: 0 });
	});

	it("rejects immediately when the queue is full", async () => {
		const gate = new ResizeGate({ maxActive: 1, maxQueue: 1, waitMs: 1_000 });
		const release = await gate.acquire();
		const queued = gate.acquire();
		await expect(gate.acquire()).rejects.toBeInstanceOf(ResizeBusyError);

		release();
		(await queued)();
	});

	it("rejects a waiter that waits past the timeout", async () => {
		const gate = new ResizeGate({ maxActive: 1, maxQueue: 2, waitMs: 20 });
		const release = await gate.acquire();
		await expect(gate.acquire()).rejects.toBeInstanceOf(ResizeBusyError);
		release();
		expect(gate.stats()).toMatchObject({ active: 0, queued: 0 });
	});

	it("is idempotent about release, so a double call cannot leak a slot", async () => {
		const gate = new ResizeGate({ maxActive: 1, maxQueue: 1, waitMs: 100 });
		const release = await gate.acquire();
		release();
		release();
		expect(gate.stats()).toMatchObject({ active: 0 });

		const again = await gate.acquire();
		expect(gate.stats()).toMatchObject({ active: 1 });
		again();
	});
});
