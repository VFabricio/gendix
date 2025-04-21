import { instrumentFatalError, instrumentSignal } from '../../cross-cutting/observability.js';

const handleFatalError =
	(abortController: AbortController) =>
	async (error: unknown): never => {
		abortController.abort();
		await instrumentFatalError(error);
		process.exit(1);
	};

const SIGNALS_TO_HANDLE = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const;
type Signal = (typeof SIGNALS_TO_HANDLE)[number];

// This follows the convention where the exit code is 128 + signal number. The signal numbers used here are valid for x86, ARM and most other common platforms.
const SIGNAL_EXIT_CODES = {
	SIGHUP: 129,
	SIGINT: 130,
	SIGTERM: 143,
} as const satisfies Record<Signal, number>;

const handleSignal =
	(abortController: AbortController) =>
	async (signal: Signal): never => {
		abortController.abort();
		await instrumentSignal(signal);
		process.exit(SIGNAL_EXIT_CODES[signal]);
	};

const registerShutdownHandlers = (abortController: AbortController): never => {
	const handler = handleFatalError(abortController);
	process.on('uncaughtException', handler);
	process.on('unhandledRejection', handler);
	SIGNALS_TO_HANDLE.forEach((signal) => {
		process.on(signal, handleSignal(abortController));
	});
};

export { registerShutdownHandlers };
