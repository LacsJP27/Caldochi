import { defineConfig } from 'vitest/config';

// Database integration tests. They need the local Supabase stack:
//   supabase start && supabase db reset
// Run with `npm run test:db`. Kept out of `npm test` so unit tests stay fast
// and don't need Docker.
export default defineConfig({
	test: {
		include: ['src/**/*.db.test.ts'],
		// Test files share one database; run them one at a time.
		fileParallelism: false,
	},
});
