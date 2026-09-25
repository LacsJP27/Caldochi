import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

export function buildApp() {
	const app = Fastify({
		logger: true,
	});

	app.register(healthRoutes, { prefix: '/api' });

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

	return app;
}
