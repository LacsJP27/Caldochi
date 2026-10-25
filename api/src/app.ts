import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import type { Database } from './db/types.js';
import type { Kysely } from 'kysely';

declare module 'fastify' {
	interface FastifyInstance {
		db: Kysely<Database>;
	}
}

export function buildApp(db: Kysely<Database>) {
	const app = Fastify({
		logger: true,
	});

	app.register(healthRoutes, { prefix: '/api' });
	app.decorate('db', db);

	app.setNotFoundHandler((request, reply) => {
		const msg = {
			error: {
				code: 'NOT_FOUND',
				message: `Route ${request.method} ${request.url} not found`,
				details: {},
			},
		};

		reply.status(404).send(msg);
	});

	app.setErrorHandler((error, request, reply) => {
		const msg = {
			error: {
				code: 'INTERNAL_ERROR',
				message: 'Internal server error',
				details: {},
			},
		};
		request.log.error({ err: error }, 'Unhandled request error');
		reply.status(500).send(msg);
	});

	app.addHook('onClose', async (instance) => {
		await instance.db.destroy();
	});

	return app;
}
