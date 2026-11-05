import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const TEST_DATABASE_URL =
	'postgresql://postgres:test@db.test.supabase.co:5432/postgres';
const TEST_SUPABASE_URL = 'https://test.supabase.co/rest/v1/';

describe('loadConfig', () => {
	it('uses default values when environment variables are not set', () => {
		const config = loadConfig({
			SUPABASE_URL: TEST_SUPABASE_URL,
			DATABASE_URL: TEST_DATABASE_URL,
		});

		expect(config.port).toBe(3000);
		expect(config.host).toBe('localhost');
	});

	it('loads the configuration from environment variables', () => {
		const config = loadConfig({
			PORT: '4000',
			HOST: 'example.com',
			SUPABASE_URL: TEST_SUPABASE_URL,
			DATABASE_URL: TEST_DATABASE_URL,
		});

		expect(config.port).toBe(4000);
		expect(config.host).toBe('example.com');
		expect(config.dbUrl.toString()).toBe(TEST_DATABASE_URL);
	});

	it('throws an error for invalid port values', () => {
		expect(() =>
			loadConfig({
				PORT: 'invalid',
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid port');
	});

	it('throws an error for non-integer port values', () => {
		expect(() =>
			loadConfig({
				PORT: '3000.5',
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid port');
	});

	it('throws an error for invalid host values', () => {
		expect(() =>
			loadConfig({
				PORT: '4000',
				HOST: 'invalid host',
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid host');
	});

	it('throws an error for empty host values', () => {
		expect(() =>
			loadConfig({
				HOST: '',
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid host');
	});

	it('throws an error for an invalid protocol', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL: 'https://test@testdb.co:5432/postgres',
			}),
		).toThrow('Invalid database protocol');
	});

	it('throws an error for an invalid database url', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL: 'invalid',
			}),
		).toThrow('Invalid Database Url');
	});

	it('throws an error for an empty database url', () => {
		expect(() => loadConfig({})).toThrow('Empty database url');
	});

	it('throws an error for an empty supabase url', () => {
		expect(() => loadConfig({ DATABASE_URL: TEST_DATABASE_URL })).toThrow(
			'Empty supabase url',
		);
	});

	it('throws an error for a non-https supabase url', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: 'http://test.supabase.co',
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid Supabase protocol');
	});

	it('throws an error for a non-supabase host', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: 'https://evil.example.com',
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid Supabase Url');
	});

	it('throws an error for a host with extra labels after supabase.co', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: 'https://test.supabase.co.evil.com',
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid Supabase Url');
	});

	it('throws an error when the project refs do not match', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: 'https://staging.supabase.co',
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow(
			'supabase project reference does not match database project reference',
		);
	});

	it('accepts a pooler database url whose username carries the project ref', () => {
		const poolerUrl =
			'postgresql://postgres.test:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
		const config = loadConfig({
			SUPABASE_URL: TEST_SUPABASE_URL,
			DATABASE_URL: poolerUrl,
		});

		expect(config.dbUrl.toString()).toBe(poolerUrl);
	});

	it('throws an error for a pooler database url without a project ref', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL:
					'postgresql://postgres:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
			}),
		).toThrow('Invalid Database Url');
	});

	it('throws an error when pooler and supabase refs do not match', () => {
		expect(() =>
			loadConfig({
				SUPABASE_URL: TEST_SUPABASE_URL,
				DATABASE_URL:
					'postgresql://postgres.staging:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
			}),
		).toThrow(
			'supabase project reference does not match database project reference',
		);
	});

	it.each([
		'https://test.supabase.co',
		'https://test.supabase.co/',
		'https://test.supabase.co/rest/v1/',
	])('derives the exact issuer and jwks url from %s', (supabaseUrl) => {
		const config = loadConfig({
			SUPABASE_URL: supabaseUrl,
			DATABASE_URL: TEST_DATABASE_URL,
		});

		expect(config.auth.issuer).toBe('https://test.supabase.co/auth/v1');
		expect(config.auth.jwksUrl.href).toBe(
			'https://test.supabase.co/auth/v1/.well-known/jwks.json',
		);
	});
});
