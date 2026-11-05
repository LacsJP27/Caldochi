import {
	jwtVerify,
	type KeyInput,
	type JWTVerifyGetKey,
	type JWTPayload,
} from 'jose';

export type Claims = JWTPayload;

/**
 * Verifies a Supabase access token and returns its claims.
 *
 * Checks the ES256 signature against the given keys, then checks that the
 * token has not expired and that `iss` and `aud` match.
 *
 * @param token - The raw JWT string (the `eyJ...` part, without `Bearer `).
 * @param opts - What a valid token must match, and where to get the public keys.
 * @param opts.issuer - Expected `iss` claim, compared exactly. Pass `config.auth.issuer`.
 * @param opts.audience - Expected `aud` claim. Supabase user tokens use `'authenticated'`.
 * @param opts.keys - Source of public keys for checking the signature: in production,
 *   `createRemoteJWKSet(config.auth.jwksUrl)`; in tests, a locally generated public key.
 * @returns A promise that resolves to the verified claims (`sub`, `role`, `exp`, ...).
 * @throws A `jose` error if the signature is invalid, the token is expired, `exp` or `sub` is missing,
 *   `iss`/`aud` don't match, or `alg` isn't ES256.
 */
export async function verifyAccessToken(
	token: string,
	opts: { issuer: string; audience: string; keys: KeyInput | JWTVerifyGetKey },
): Promise<Claims> {
	const { payload } = await jwtVerify(token, opts.keys, {
		requiredClaims: ['exp', 'sub'],
		algorithms: ['ES256'],
		issuer: opts.issuer,
		audience: opts.audience,
	});

	return payload;
}
