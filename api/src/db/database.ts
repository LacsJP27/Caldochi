import { Database } from './types.js'; // this is the Database interface we defined earlier
import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';

export function createDb(databaseUrl: string): Kysely<Database> {
	const dialect = new PostgresDialect({
		pool: new Pool({
			connectionString: databaseUrl,
			max: 10,
		}),
	});

	return new Kysely<Database>({ dialect });
}
