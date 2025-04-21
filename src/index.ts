// This import MUST be here first.
import './cross-cutting/observability.js';

import { instrumentFunction } from './cross-cutting/observability.js';
import { startServer } from './ports/driving/server.js';
import { registerShutdownHandlers } from './ports/driving/shutdown.js';

const initialize = instrumentFunction('initialization', async () => {
	const abortController = new AbortController();
	registerShutdownHandlers(abortController);

	return { abortController };
});

async function main(): Promise<void> {
	const { abortController } = await initialize();
	startServer(abortController.signal);
}

main();
