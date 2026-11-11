import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { generateKeyPair } from 'jose';
import { buildApp } from './app.js';
import { createDb } from './db/database.js';
import { createShutdownHandler } from './shutdown.js';
import { TEST_AUDIENCE, TEST_ISSUER } from './auth/test-helpers.js';

const TEST_DATABASE_URL = 'postgresql://postgres:test@test.co:5432/postgres';

// Minimal stand-in for cases where a real app.close() can't be made to hang or fail.
function stubApp(close: () => Promise<void>) {
	return {
		close: vi.fn(close),
		log: { info: vi.fn(), error: vi.fn() },
	} as unknown as FastifyInstance;
}

describe('createShutdownHandler', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('closes the app, destroys the db pool, and exits 0', async () => {
		const db = createDb(TEST_DATABASE_URL);
		const destroy = vi.spyOn(db, 'destroy');
		const { publicKey } = await generateKeyPair('ES256');
		const app = buildApp(db, { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, keys: publicKey });
		await app.ready();
		const exit = vi.fn();

		await createShutdownHandler(app, { exit })('SIGTERM');

		expect(destroy).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it('only shuts down once when signalled repeatedly', async () => {
		const app = stubApp(async () => {});
		const exit = vi.fn();
		const shutdown = createShutdownHandler(app, { exit });

		await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

		expect(app.close).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it('exits 1 when close fails', async () => {
		const app = stubApp(async () => {
			throw new Error('pool end failed');
		});
		const exit = vi.fn();

		await createShutdownHandler(app, { exit })('SIGTERM');

		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
		expect(app.log.error).toHaveBeenCalled();
	});

	it('exits 1 when close hangs past the timeout', async () => {
		vi.useFakeTimers();
		const app = stubApp(() => new Promise(() => {}));
		const exit = vi.fn();

		void createShutdownHandler(app, { exit, timeoutMs: 1_000 })('SIGTERM');

		await vi.advanceTimersByTimeAsync(999);
		expect(exit).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
	});
});
