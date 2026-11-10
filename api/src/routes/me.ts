import { FastifyPluginAsync } from 'fastify';

export const meRoutes: FastifyPluginAsync = async (app) => {
	app.get('/me', {}, async (request) => {
		const id = request.user!.id;
		return { id: id };
	});
};
