import { beforeAll, describe, it, expect } from 'vitest';
import { generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { verifyAccessToken } from './verify.js';

describe('JWT verify', () => {
	let keys: CryptoKeyPair;
	beforeAll(async () => {
		keys = await generateKeyPair('ES256');
	});

	const ISSUER = 'https://test.supabase.co/auth/v1';
	const AUDIENCE = 'authenticated';

	// JWT times are in seconds, not milliseconds
	function nowSeconds() {
		return Math.floor(Date.now() / 1000);
	}

	function claims(overrides: JWTPayload = {}): JWTPayload {
		const now = nowSeconds();
		return {
			iss: ISSUER,
			aud: AUDIENCE,
			sub: 'user-123',
			role: 'authenticated',
			iat: now,
			exp: now + 3600,
			...overrides,
		};
	}

	function sign(payload: JWTPayload, privateKey: CryptoKey) {
		return new SignJWT(payload)
			.setProtectedHeader({ alg: 'ES256' })
			.sign(privateKey);
	}

	// Verifies against the test key pair with the expected issuer and audience.
	function verify(token: string) {
		return verifyAccessToken(token, {
			issuer: ISSUER,
			audience: AUDIENCE,
			keys: keys.publicKey,
		});
	}

	it('returns the claims for a valid token', async () => {
		const token = await sign(claims(), keys.privateKey);

		const result = await verify(token);

		expect(result.sub).toBe('user-123');
		expect(result.role).toBe('authenticated');
	});

	it('rejects a token signed by a different key', async () => {
		const attacker = await generateKeyPair('ES256');
		const token = await sign(claims(), attacker.privateKey);

		await expect(verify(token)).rejects.toMatchObject({
			code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
		});
	});

	it('rejects an expired token', async () => {
		const token = await sign(
			claims({ exp: nowSeconds() - 60 }),
			keys.privateKey,
		);

		await expect(verify(token)).rejects.toMatchObject({
			code: 'ERR_JWT_EXPIRED',
			claim: 'exp',
		});
	});

	it('rejects a token for a different audience', async () => {
		const token = await sign(claims({ aud: 'anon' }), keys.privateKey);

		await expect(verify(token)).rejects.toMatchObject({
			code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
			claim: 'aud',
		});
	});

	it('rejects a token from a different issuer', async () => {
		const token = await sign(
			claims({ iss: 'https://other.supabase.co/auth/v1' }),
			keys.privateKey,
		);

		await expect(verify(token)).rejects.toMatchObject({
			code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
			claim: 'iss',
		});
	});

	it.each(['exp', 'sub'] as const)(
		'rejects a token with no %s claim',
		async (claim) => {
			const payload = claims();
			delete payload[claim];
			const token = await sign(payload, keys.privateKey);

			await expect(verify(token)).rejects.toMatchObject({
				code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
				claim,
			});
		},
	);
});
