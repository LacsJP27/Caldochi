import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { generateKeyPair } from 'jose';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from './db/types.js';
import { buildApp } from './app.js';
import { createDb } from './db/database.js';
import type { AuthPluginOptions } from './auth/plugin.js';
import {
	TEST_AUDIENCE,
	TEST_ISSUER,
	TEST_USER_ID,
	nowSeconds,
	signTestToken,
	testClaims,
} from './auth/test-helpers.js';

const TEST_DATABASE_URL = 'postgresql://postgres:test@test.co:5432/postgres';

describe('API app', () => {
	let app: FastifyInstance;
	let testdb: Kysely<Database>;
	let auth: AuthPluginOptions;
	let keys: CryptoKeyPair;

	beforeAll(async () => {
		keys = await generateKeyPair('ES256');
		auth = {
			issuer: TEST_ISSUER,
			audience: TEST_AUDIENCE,
			keys: keys.publicKey,
		};
	});

	beforeEach(() => {
		testdb = createDb(TEST_DATABASE_URL);
	});

	afterEach(async () => {
		await app?.close();
	});

	it('reports that the API is healthy', async () => {
		app = buildApp(testdb, auth);

		const response = await app.inject({
			method: 'GET',
			url: '/api/healthz',
		});

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ status: 'ok' });
	});

	it('returns not found for an unknown route', async () => {
		app = buildApp(testdb, auth);

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
		app = buildApp(testdb, auth);
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

	describe('GET /api/me (protected)', () => {
		const UNAUTHORIZED = {
			error: {
				code: 'UNAUTHORIZED',
				message: 'Invalid or missing access token',
				details: {},
			},
		};

		beforeEach(() => {
			app = buildApp(testdb, auth);
		});

		function getMe(authorization?: string) {
			return app.inject({
				method: 'GET',
				url: '/api/me',
				headers: authorization ? { authorization } : {},
			});
		}

		it('returns the signed-in user for a valid token', async () => {
			const token = await signTestToken(testClaims(), keys.privateKey);

			const response = await getMe(`Bearer ${token}`);

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({ id: TEST_USER_ID });
		});

		it('rejects a request with no Authorization header', async () => {
			const response = await getMe();

			expect(response.statusCode).toBe(401);
			expect(response.headers['www-authenticate']).toBe('Bearer');
			expect(response.json()).toEqual(UNAUTHORIZED);
		});

		it.each([
			['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
			['Bearer with no token', 'Bearer'],
			['Bearer with extra parts', 'Bearer a b'],
		])('rejects a malformed header: %s', async (_name, header) => {
			const response = await getMe(header);

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual(UNAUTHORIZED);
		});

		it('rejects a token that is not a JWT', async () => {
			const response = await getMe('Bearer not-a-jwt');

			expect(response.statusCode).toBe(401);
			expect(response.headers['www-authenticate']).toBe(
				'Bearer error="invalid_token"',
			);
			expect(response.json()).toEqual(UNAUTHORIZED);
		});

		it('rejects an expired token', async () => {
			const token = await signTestToken(
				testClaims({ exp: nowSeconds() - 60 }),
				keys.privateKey,
			);

			const response = await getMe(`Bearer ${token}`);

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual(UNAUTHORIZED);
		});

		it('rejects a token signed by a different key', async () => {
			const attacker = await generateKeyPair('ES256');
			const token = await signTestToken(testClaims(), attacker.privateKey);

			const response = await getMe(`Bearer ${token}`);

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual(UNAUTHORIZED);
		});

		it('keeps /api/healthz public', async () => {
			const response = await app.inject({ method: 'GET', url: '/api/healthz' });

			expect(response.statusCode).toBe(200);
		});
	});
});
