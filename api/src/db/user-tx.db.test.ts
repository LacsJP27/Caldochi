// RLS integration tests for withUserTx, against the local Supabase stack.
// Prerequisite: `supabase start && supabase db reset` (applies supabase/migrations).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import type { AuthUser } from '../auth/plugin.js';
import { nowSeconds } from '../auth/test-helpers.js';
import type { Database } from './types.js';
import { withUserTx } from './user-tx.js';

// `supabase start` always serves Postgres here, with these credentials.
const LOCAL_SUPABASE_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const databaseUrl = process.env.TEST_DATABASE_URL ?? LOCAL_SUPABASE_DB;

// These tests insert into auth.users and delete rows. Refuse anything that
// isn't a local database, so a stray TEST_DATABASE_URL can't hit production.
const { hostname } = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
	throw new Error(`refusing to run DB tests against non-local host ${hostname}`);
}

function userFor(id: string): AuthUser {
	const now = nowSeconds();
	return {
		id,
		claims: {
			iss: 'http://127.0.0.1:54321/auth/v1',
			aud: 'authenticated',
			sub: id,
			role: 'authenticated',
			iat: now,
			exp: now + 3600,
		},
	};
}

/** Role and claims as Postgres currently sees them on this connection. */
async function sessionState(conn: Kysely<Database>) {
	const { rows } = await sql<{ role: string; claims: string | null }>`
		select current_user as role,
		       current_setting('request.jwt.claims', true) as claims
	`.execute(conn);
	return rows[0];
}

describe('withUserTx (RLS)', () => {
	// One connection, so every query reuses it. That makes "does the role
	// leak to the next query on this connection?" an actual test.
	let db: Kysely<Database>;

	// Fresh ids each run, so reruns never collide with leftover rows.
	const aliceId = randomUUID();
	const bobId = randomUUID();
	const alice = userFor(aliceId);
	let aliceCalendarId: string;
	let bobCalendarId: string;

	beforeAll(async () => {
		db = new Kysely<Database>({
			dialect: new PostgresDialect({
				pool: new Pool({ connectionString: databaseUrl, max: 1 }),
			}),
		});

		// Seed as `postgres` (bypasses RLS). profiles.id references auth.users.
		await sql`
			insert into auth.users (id, email)
			values (${aliceId}, ${`${aliceId}@test.local`}),
			       (${bobId}, ${`${bobId}@test.local`})
		`.execute(db);
		await db
			.insertInto('profiles')
			.values([{ id: aliceId }, { id: bobId }])
			.execute();

		const calendars = await db
			.insertInto('calendars')
			.values([
				{ owner_id: aliceId, name: 'Alice cal' },
				{ owner_id: bobId, name: 'Bob cal' },
			])
			.returning(['id', 'owner_id'])
			.execute();
		aliceCalendarId = calendars.find((c) => c.owner_id === aliceId)!.id;
		bobCalendarId = calendars.find((c) => c.owner_id === bobId)!.id;

		await db
			.insertInto('events')
			.values([
				{ calendar_id: aliceCalendarId, title: 'Alice event', start_time: new Date(), duration_minutes: 30 },
				{ calendar_id: bobCalendarId, title: 'Bob event', start_time: new Date(), duration_minutes: 30 },
			])
			.execute();
	});

	afterAll(async () => {
		// Cascades to profiles, calendars, and events.
		await sql`delete from auth.users where id in (${aliceId}, ${bobId})`.execute(db);
		await db.destroy();
	});

	it('without withUserTx, the postgres login bypasses RLS and sees both users', async () => {
		const rows = await db
			.selectFrom('calendars')
			.select('owner_id')
			.where('owner_id', 'in', [aliceId, bobId])
			.execute();

		expect(rows).toHaveLength(2);
	});

	it('runs as authenticated with auth.uid() = sub inside the transaction', async () => {
		const result = await withUserTx(db, alice, async (trx) => {
			const { rows } = await sql<{ role: string; uid: string }>`
				select current_user as role, auth.uid() as uid
			`.execute(trx);
			return rows[0];
		});

		expect(result).toEqual({ role: 'authenticated', uid: aliceId });
	});

	it('shows a user only their own calendars', async () => {
		const rows = await withUserTx(db, alice, (trx) =>
			trx
				.selectFrom('calendars')
				.select('owner_id')
				.where('owner_id', 'in', [aliceId, bobId])
				.execute(),
		);

		expect(rows).toEqual([{ owner_id: aliceId }]);
	});

	it('shows a user only events in their own calendars', async () => {
		const rows = await withUserTx(db, alice, (trx) =>
			trx
				.selectFrom('events')
				.select('title')
				.where('calendar_id', 'in', [aliceCalendarId, bobCalendarId])
				.execute(),
		);

		expect(rows).toEqual([{ title: 'Alice event' }]);
	});

	it("rejects inserting an event into another user's calendar", async () => {
		const attempt = withUserTx(db, alice, (trx) =>
			trx
				.insertInto('events')
				.values({ calendar_id: bobCalendarId, title: 'sneaky', start_time: new Date(), duration_minutes: 30 })
				.execute(),
		);

		// 42501 = insufficient_privilege: "new row violates row-level security policy".
		await expect(attempt).rejects.toMatchObject({ code: '42501' });
	});

	it("can't update another user's calendar (RLS hides the row, 0 rows updated)", async () => {
		const result = await withUserTx(db, alice, (trx) =>
			trx
				.updateTable('calendars')
				.set({ name: 'hijacked' })
				.where('id', '=', bobCalendarId)
				.executeTakeFirst(),
		);

		expect(result.numUpdatedRows).toBe(0n);
		const bobCal = await db
			.selectFrom('calendars')
			.select('name')
			.where('id', '=', bobCalendarId)
			.executeTakeFirstOrThrow();
		expect(bobCal.name).toBe('Bob cal');
	});

	it('resets role and claims after the transaction commits', async () => {
		await withUserTx(db, alice, async () => {});

		const state = await sessionState(db);
		expect(state.role).toBe('postgres');
		// A custom setting that was only ever set locally reads back as ''
		// (or null if never set) once the transaction ends.
		expect(state.claims || null).toBeNull();
	});

	it('resets role and claims after the transaction rolls back', async () => {
		const attempt = withUserTx(db, alice, async () => {
			throw new Error('boom');
		});
		await expect(attempt).rejects.toThrow('boom');

		const state = await sessionState(db);
		expect(state.role).toBe('postgres');
		expect(state.claims || null).toBeNull();
	});
});
