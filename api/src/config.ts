export type AppConfig = {
	port: number;
	host: string;
	dbUrl: URL;
	auth: {
		issuer: string;
		jwksUrl: URL;
	};
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const SUPABASE_HOST = /^([a-z0-9]+)\.supabase\.co$/;
	const POOLER_USER = /^postgres\.([a-z0-9]+)$/;
	const DIRECT_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/;
	const port = Number(env.PORT ?? 3000);
	const host = env.HOST ?? 'localhost';
	let dbUrl: URL;
	let supaUrl: URL;

	if (!env.DATABASE_URL) {
		throw new Error('Empty database url');
	}

	if (!env.SUPABASE_URL) {
		throw new Error('Empty supabase url');
	}

	try {
		supaUrl = new URL(env.SUPABASE_URL ?? '');
	} catch {
		throw new Error('Invalid Supabase Url');
	}

	try {
		dbUrl = new URL(env.DATABASE_URL ?? '');
	} catch {
		throw new Error('Invalid Database Url');
	}

	if (supaUrl.protocol !== 'https:') {
		throw new Error('Invalid Supabase protocol');
	}

	if (!['postgres:', 'postgresql:'].includes(dbUrl.protocol)) {
		throw new Error('Invalid database protocol');
	}

	const supaRef = SUPABASE_HOST.exec(supaUrl.hostname)?.[1];
	let dbRef = DIRECT_HOST.exec(dbUrl.hostname)?.[1];

	if (!supaRef) {
		throw new Error('Invalid Supabase Url');
	}

	if (!dbRef) {
		dbRef = POOLER_USER.exec(dbUrl.username)?.[1];
		if (!dbRef) {
			throw new Error('Invalid Database Url');
		}
	}

	if (supaRef !== dbRef) {
		throw new Error(
			'supabase project reference does not match database project reference',
		);
	}

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('Invalid port');
	}

	if (host === '') {
		throw new Error('Invalid host');
	}

	// Reject hosts containing whitespace while allowing values like localhost,
	// 127.0.0.1, 0.0.0.0, ::1, and valid domain names.
	if (/\s/.test(host)) {
		throw new Error('Invalid host');
	}

	const issuer = new URL('/auth/v1', supaUrl).toString();
	const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supaUrl);

	return {
		port,
		host,
		dbUrl,
		auth: {
			issuer,
			jwksUrl,
		},
	};
}
