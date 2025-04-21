import { serve } from '@hono/node-server';
import { Hono } from 'hono';

function startServer(_abortSignal: AbortSignal): void {
	const app = new Hono();

	app.get('/', (c) => {
		return c.text('Gendix Chat API');
	});

	serve({
		fetch: app.fetch,
		port: 3000,
	});
}

export { startServer };
