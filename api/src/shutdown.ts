import type { FastifyInstance } from 'fastify';

// Fly sends SIGTERM on deploy/stop; Ctrl-C locally sends SIGINT.
export const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

// Fly's default kill_timeout is 5 s (docker stop: 10 s). Give up just before
// that so the forced exit is ours and gets logged, not a silent SIGKILL.
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 4_000;

export interface ShutdownOptions {
	timeoutMs?: number;
	exit?: (code: number) => void;
}

/**
 * Returns a handler that closes the app once (stop accepting connections,
 * let in-flight requests finish, run onClose hooks such as db.destroy())
 * and then exits: 0 on a clean close, 1 if close fails or exceeds timeoutMs.
 * Repeated calls return the same in-progress shutdown.
 */
export function createShutdownHandler(
	app: FastifyInstance,
	{ timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS, exit = (code) => process.exit(code) }: ShutdownOptions = {},
): (signal: NodeJS.Signals) => Promise<void> {
	let shuttingDown: Promise<void> | undefined;

	return (signal) => {
		if (shuttingDown) return shuttingDown;

		app.log.info({ signal }, 'Shutting down');

		const timer = setTimeout(() => {
			app.log.error({ timeoutMs }, 'Shutdown timed out; forcing exit');
			exit(1);
		}, timeoutMs);

		shuttingDown = app.close().then(
			() => {
				clearTimeout(timer);
				app.log.info('Shutdown complete');
				exit(0);
			},
			(err: unknown) => {
				clearTimeout(timer);
				app.log.error({ err }, 'Shutdown failed');
				exit(1);
			},
		);

		return shuttingDown;
	};
}

export function registerShutdownHandlers(app: FastifyInstance, options?: ShutdownOptions): void {
	const shutdown = createShutdownHandler(app, options);
	for (const signal of SHUTDOWN_SIGNALS) {
		process.once(signal, shutdown);
	}
}
