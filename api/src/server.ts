import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const app = buildApp();
const config = loadConfig();

try {
	await app.listen({ port: config.port, host: config.host });
} catch (error) {
	app.log.error(error);
	process.exit(1);
}
