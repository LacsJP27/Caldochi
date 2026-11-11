import { sql, type Kysely, type Transaction } from 'kysely';
import type { AuthUser } from '../auth/plugin.js';
import type { Database } from './types.js';

/**
 * Runs `fn` in a transaction as the signed-in user, so RLS policies apply.
 *
 * The pool logs in as `postgres`, which bypasses RLS. Inside the transaction
 * this switches to the `authenticated` role and sets `request.jwt.claims`, which
 * `auth.uid()` reads `sub` from. Both settings are transaction-local (third
 * argument `true`), so they reset on COMMIT or ROLLBACK and never leak to the
 * next request that borrows the pooled connection.
 *
 * Every query that `fn` runs must go through `trx`, not the outer `db`;
 * queries on `db` run on another connection as `postgres`.
 */
export function withUserTx<T>(
	db: Kysely<Database>,
	user: AuthUser,
	fn: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
	return db.transaction().execute(async (trx) => {
		await sql`
			select
				set_config('role', 'authenticated', true),
				set_config('request.jwt.claims', ${JSON.stringify(user.claims)}, true)
		`.execute(trx);

		return fn(trx);
	});
}
