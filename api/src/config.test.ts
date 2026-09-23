import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
	it('uses default values when environment variables are not set', () => {
		const config = loadConfig({});

		expect(config.port).toBe(3000);
		expect(config.host).toBe('localhost');
	});

	it('loads the configuration from environment variables', () => {
		process.env.PORT = '4000';
		process.env.HOST = 'example.com';

		const config = loadConfig();

		expect(config.port).toBe(4000);
		expect(config.host).toBe('example.com');
	});

	it('throws an error for invalid port values', () => {
		process.env.PORT = 'invalid';

		expect(() => loadConfig()).toThrow('Invalid port');
	});

	it('throws an error for invalid host values', () => {
		process.env.PORT = '4000';
		process.env.HOST = 'invalid host';

		expect(() => loadConfig()).toThrow('Invalid host');
	});

	it('throws an error for empty host values', () => {
		process.env.HOST = '';

		expect(() => loadConfig()).toThrow('Empty host');
	});
});
