import { createRemoteJWKSet } from 'jose';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/database.js';

const config = loadConfig();
const db = createDb(config.dbUrl.toString());
const app = buildApp(db, {
	issuer: config.auth.issuer,
	audience: 'authenticated',
	keys: createRemoteJWKSet(config.auth.jwksUrl),
});

try {
	await app.listen({ port: config.port, host: config.host });
} catch (error) {
	app.log.error(error);
	process.exit(1);
}
