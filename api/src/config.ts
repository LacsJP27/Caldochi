export type AppConfig = {
	port: number;
	host: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const port = Number(env.PORT ?? 3000);
	const host = env.HOST ?? 'localhost';

	if (isNaN(port) || port < 1 || port > 65535) {
		throw new Error('Invalid port');
	}

	if (host === '') {
		throw new Error('Empty host');
	}

    // reject whitespace-only host values
    // reject hosts containing white space
    // allow values like localhost, 127.0.0.1, 0.0.0, ::1, and valid domain names
    if (/\s/.test(host)) {
        throw new Error('Invalid host');
    }

	return {
		port,
		host,
	};
}
