import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
	it('uses default values when environment variables are not set', () => {
		const config = loadConfig({});

		expect(config.port).toBe(3000);
		expect(config.host).toBe('localhost');
	});

	it('loads the configuration from environment variables', () => {
		const config = loadConfig({
			PORT: '4000',
			HOST: 'example.com',
		});

		expect(config.port).toBe(4000);
		expect(config.host).toBe('example.com');
	});

	it('throws an error for invalid port values', () => {
		expect(() => loadConfig({ PORT: 'invalid' })).toThrow('Invalid port');
	});

	it('throws an error for non-integer port values', () => {
		expect(() => loadConfig({ PORT: '3000.5' })).toThrow('Invalid port');
	});

	it('throws an error for invalid host values', () => {
		expect(() =>
			loadConfig({ PORT: '4000', HOST: 'invalid host' }),
		).toThrow('Invalid host');
	});

	it('throws an error for empty host values', () => {
		expect(() => loadConfig({ HOST: '' })).toThrow('Invalid host');
	});
});
