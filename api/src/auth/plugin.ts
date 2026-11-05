import fp from 'fastify-plugin';
import { errors, type JWTPayload } from 'jose';
import { verifyAccessToken } from './verify.js';

/** Same shape `verifyAccessToken` takes: issuer, audience, keys. */
export type AuthPluginOptions = Parameters<typeof verifyAccessToken>[1];

export type AuthUser = {
	/** The `sub` claim: the Supabase user id, as `auth.uid()` will see it. */
	id: string;
	/** The full verified payload, for `request.jwt.claims` in Postgres. */
	claims: JWTPayload;
};

declare module 'fastify' {
	interface FastifyRequest {
		/** Set by the auth plugin. Non-null in any route registered in its scope. */
		user: AuthUser | null;
	}
}

/**
 * `jose` error codes that mean the token itself is bad, so the client should
 * get a 401. Any other error (JWKS fetch timeout, network failure, malformed
 * JWKS response) is our problem, not the client's, and becomes a 500.
 */
const INVALID_TOKEN_CODES: ReadonlySet<string> = new Set([
	'ERR_JWT_EXPIRED',
	'ERR_JWT_CLAIM_VALIDATION_FAILED',
	'ERR_JWT_INVALID',
	'ERR_JWS_INVALID',
	'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
	'ERR_JOSE_ALG_NOT_ALLOWED',
	'ERR_JOSE_NOT_SUPPORTED',
	'ERR_JWKS_NO_MATCHING_KEY',
	'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
]);

const UNAUTHORIZED_BODY = {
	error: {
		code: 'UNAUTHORIZED',
		message: 'Invalid or missing access token',
		details: {},
	},
};

/** Returns the token from `Bearer <token>`, or null for any other shape. */
function parseBearer(header: string | undefined): string | null {
	if (!header) return null;

	const parts = header.trim().split(/\s+/);
	if (parts.length !== 2) return null;

	const [scheme, token] = parts;
	// The auth scheme name is case-insensitive (RFC 9110 §11.1).
	if (scheme.toLowerCase() !== 'bearer') return null;

	return token;
}

/**
 * Requires a valid Supabase access token on every route in the scope that
 * registers this plugin, and sets `request.user`.
 *
 * Wrapped in `fastify-plugin` so the `onRequest` hook applies to sibling
 * routes in the registering scope, not only to routes inside this plugin.
 * Keep public routes (like `/api/healthz`) outside that scope.
 */
export const authPlugin = fp<AuthPluginOptions>(
	async (app, opts) => {
		app.decorateRequest('user', null);

		app.addHook('onRequest', async (request, reply) => {
			const token = parseBearer(request.headers.authorization);
			if (!token) {
				request.log.info({ reason: 'missing_or_malformed_header' }, 'auth rejected');
				return reply
					.code(401)
					.header('www-authenticate', 'Bearer')
					.send(UNAUTHORIZED_BODY);
			}

			let claims: JWTPayload;
			try {
				claims = await verifyAccessToken(token, opts);
			} catch (err) {
				if (err instanceof errors.JOSEError && INVALID_TOKEN_CODES.has(err.code)) {
					// Log why, but never the token itself.
					request.log.info({ reason: err.code }, 'auth rejected');
					return reply
						.code(401)
						.header('www-authenticate', 'Bearer error="invalid_token"')
						.send(UNAUTHORIZED_BODY);
				}
				// Not the client's fault: let the app error handler send a 500.
				throw err;
			}

			// requiredClaims guarantees `sub`, but JWTPayload types it as optional.
			if (typeof claims.sub !== 'string') {
				throw new Error('verified token has no string sub claim');
			}

			request.user = { id: claims.sub, claims };
		});
	},
	{ name: 'auth' },
);
