import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from './db/types.js';
import { buildApp } from './app.js';
import { createDb } from './db/database.js';

const TEST_DATABASE_URL = 'postgresql://postgres:test@test.co:5432/postgres';

describe('API app', () => {
	let app: FastifyInstance;
	let testdb: Kysely<Database>;

	beforeEach(() => {
		testdb = createDb(TEST_DATABASE_URL);
	});

	afterEach(async () => {
		await app?.close();
	});

	it('reports that the API is healthy', async () => {
		app = buildApp(testdb);

		const response = await app.inject({
			method: 'GET',
			url: '/api/healthz',
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: 'ok' });
	});

	it('returns not found for an unknown route', async () => {
		app = buildApp(testdb);

		const response = await app.inject({
			method: 'GET',
			url: '/api/does-not-exist',
		});

		expect(response.statusCode).toBe(404);
		expect(response.json()).toEqual({
			error: {
				code: 'NOT_FOUND',
				message: 'Route GET /api/does-not-exist not found',
				details: {},
			},
		});
	});

	it('returns internal server error for a route that throws', async () => {
		app = buildApp(testdb);
		app.get('/api/test-error', async () => {
			throw new Error('Simulated error');
		});

		const response = await app.inject({
			method: 'GET',
			url: '/api/test-error',
		});

		expect(response.statusCode).toBe(500);
		expect(response.json()).toEqual({
			error: {
				code: 'INTERNAL_ERROR',
				message: 'Internal server error',
				details: {},
			},
		});
	});
});
