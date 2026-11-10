// Shared helpers for tests that need Supabase-shaped access tokens.
// Tests play the role of Supabase: they sign tokens with a locally generated
// ES256 private key and verify with the matching public key.
import { SignJWT, type JWTPayload } from 'jose';

export const TEST_ISSUER = 'https://test.supabase.co/auth/v1';
export const TEST_AUDIENCE = 'authenticated';
export const TEST_USER_ID = 'user-123';

/** Current time in seconds. JWT times are seconds, not milliseconds. */
export function nowSeconds() {
	return Math.floor(Date.now() / 1000);
}

/** Valid claims for TEST_ISSUER/TEST_AUDIENCE; `overrides` replaces any of them. */
export function testClaims(overrides: JWTPayload = {}): JWTPayload {
	const now = nowSeconds();
	return {
		iss: TEST_ISSUER,
		aud: TEST_AUDIENCE,
		sub: TEST_USER_ID,
		role: 'authenticated',
		iat: now,
		exp: now + 3600,
		...overrides,
	};
}

/** Signs `payload` the way Supabase does: ES256 with the given private key. */
export function signTestToken(payload: JWTPayload, privateKey: CryptoKey) {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: 'ES256' })
		.sign(privateKey);
}
