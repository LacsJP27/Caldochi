// GET /api/calendars end to end: signed token -> auth plugin -> withUserTx -> RLS.
// Prerequisite: `supabase start && supabase db reset` (applies supabase/migrations).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPair } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { signTestToken, testClaims, TEST_AUDIENCE, TEST_ISSUER } from '../auth/test-helpers.js';
import type { Database } from '../db/types.js';

// `supabase start` always serves Postgres here, with these credentials.
const LOCAL_SUPABASE_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const databaseUrl = process.env.TEST_DATABASE_URL ?? LOCAL_SUPABASE_DB;

// These tests insert into auth.users and delete rows. Refuse anything that
// isn't a local database, so a stray TEST_DATABASE_URL can't hit production.
const { hostname } = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
	throw new Error(`refusing to run DB tests against non-local host ${hostname}`);
}

describe('GET /api/calendars', () => {
	let app: FastifyInstance;
	let privateKey: CryptoKey;

	// Fresh ids each run, so reruns never collide with leftover rows.
	const aliceId = randomUUID();
	const bobId = randomUUID();
	const carolId = randomUUID(); // has a profile but no calendars

	function getCalendars(userId: string) {
		return signTestToken(testClaims({ sub: userId }), privateKey).then((token) =>
			app.inject({
				method: 'GET',
				url: '/api/calendars',
				headers: { authorization: `Bearer ${token}` },
			}),
		);
	}

	beforeAll(async () => {
		const keys = await generateKeyPair('ES256');
		privateKey = keys.privateKey;

		const db = new Kysely<Database>({
			dialect: new PostgresDialect({ pool: new Pool({ connectionString: databaseUrl }) }),
		});
		// The app owns the db from here: app.close() destroys it (onClose hook).
		app = buildApp(db, { issuer: TEST_ISSUER, audience: TEST_AUDIENCE, keys: keys.publicKey });

		// Seed as `postgres` (bypasses RLS). profiles.id references auth.users.
		await sql`
			insert into auth.users (id, email)
			values (${aliceId}, ${`${aliceId}@test.local`}),
			       (${bobId}, ${`${bobId}@test.local`}),
			       (${carolId}, ${`${carolId}@test.local`})
		`.execute(db);
		await db
			.insertInto('profiles')
			.values([{ id: aliceId }, { id: bobId }, { id: carolId }])
			.execute();

		// Inserted out of order so the test proves the route sorts them.
		await db
			.insertInto('calendars')
			.values([
				{ owner_id: aliceId, name: 'Work', color: '#0000ff' },
				{ owner_id: aliceId, name: 'Personal', is_default: true },
				{ owner_id: aliceId, name: 'Gym', kind: 'suggested' },
				{ owner_id: bobId, name: 'Bob only' },
			])
			.execute();
	});

	afterAll(async () => {
		// Cascades to profiles and calendars.
		await sql`delete from auth.users where id in (${aliceId}, ${bobId}, ${carolId})`.execute(
			app.db,
		);
		await app.close();
	});

	it("returns only the caller's calendars, default first, then by name", async () => {
		const response = await getCalendars(aliceId);

		expect(response.statusCode).toBe(200);
		const { calendars } = response.json();
		expect(calendars.map((c: { name: string }) => c.name)).toEqual([
			'Personal', // is_default
			'Gym',
			'Work',
		]);
	});

	it('returns exactly the public calendar fields', async () => {
		const response = await getCalendars(aliceId);

		const work = response.json().calendars.find((c: { name: string }) => c.name === 'Work');
		expect(work).toEqual({
			id: expect.any(String),
			name: 'Work',
			color: '#0000ff',
			kind: 'personal',
			is_default: false,
		});
	});

	it('returns 200 with an empty array for a user with no calendars', async () => {
		const response = await getCalendars(carolId);

		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ calendars: [] });
	});
});
