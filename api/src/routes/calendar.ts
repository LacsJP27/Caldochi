import { FastifyPluginAsync } from 'fastify';
import { withUserTx } from '../db/user-tx.js';

export const calendarRoute: FastifyPluginAsync = async (app) => {
	app.get('/calendars', async (request) => {
		const user = request.user;
		if (!user)
			throw new Error('GET /calendars registered without the auth plugin');

		const calendars = await withUserTx(app.db, user, (trx) =>
			trx
				.selectFrom('calendars')
				// No owner_id filter: the query runs as `authenticated` with
				// auth.uid() = user.id, so RLS already returns only this user's rows.
				.select(['id', 'name', 'color', 'kind', 'is_default'])
				.orderBy('is_default', 'desc')
				.orderBy('name')
				.orderBy('id')
				.execute(),
		);

		return { calendars };
	});
};
