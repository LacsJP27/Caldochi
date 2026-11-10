import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		// Database tests need a running database; see vitest.db.config.ts.
		exclude: [...configDefaults.exclude, 'src/**/*.db.test.ts'],
	},
});
