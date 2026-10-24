import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const TEST_DATABASE_URL = 'postgresql://postgres:test@test.co:5432/postgres';

describe('loadConfig', () => {
	it('uses default values when environment variables are not set', () => {
		const config = loadConfig({ DATABASE_URL: TEST_DATABASE_URL });

		expect(config.port).toBe(3000);
		expect(config.host).toBe('localhost');
	});

	it('loads the configuration from environment variables', () => {
		const config = loadConfig({
			PORT: '4000',
			HOST: 'example.com',
			DATABASE_URL: TEST_DATABASE_URL,
		});

		expect(config.port).toBe(4000);
		expect(config.host).toBe('example.com');
		expect(config.databaseUrl.toString()).toBe(TEST_DATABASE_URL);
	});

	it('throws an error for invalid port values', () => {
		expect(() =>
			loadConfig({
				PORT: 'invalid',
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid port');
	});

	it('throws an error for non-integer port values', () => {
		expect(() =>
			loadConfig({ PORT: '3000.5', DATABASE_URL: TEST_DATABASE_URL }),
		).toThrow('Invalid port');
	});

	it('throws an error for invalid host values', () => {
		expect(() =>
			loadConfig({
				PORT: '4000',
				HOST: 'invalid host',
				DATABASE_URL: TEST_DATABASE_URL,
			}),
		).toThrow('Invalid host');
	});

	it('throws an error for empty host values', () => {
		expect(() =>
			loadConfig({ HOST: '', DATABASE_URL: TEST_DATABASE_URL }),
		).toThrow('Invalid host');
	});

	it('throws an error for an invalid protocol', () => {
		expect(() =>
			loadConfig({
				DATABASE_URL: 'https://test@testdb.co:5432/postgres',
			}),
		).toThrow('Invalid database protocol');
	});

	it('throws an error for an invalid database url', () => {
		expect(() =>
			loadConfig({
				DATABASE_URL: 'invalid',
			}),
		).toThrow('Invalid database url');
	});

	it('throws an error for an empty database url', () => {
		expect(() => loadConfig({})).toThrow('Empty database url');
	});
});
