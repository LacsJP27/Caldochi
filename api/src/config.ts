export type AppConfig = {
	port: number;
	host: string;
	databaseUrl: URL;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const port = Number(env.PORT ?? 3000);
	const host = env.HOST ?? 'localhost';
	let databaseUrl: URL;

	if (!env.DATABASE_URL) {
		throw new Error('Empty database url');
	}

	try {
		databaseUrl = new URL(env.DATABASE_URL ?? '');
	} catch {
		throw new Error('Invalid database url');
	}

	if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
		throw new Error('Invalid database protocol');
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

	return {
		port,
		host,
		databaseUrl,
	};
}
