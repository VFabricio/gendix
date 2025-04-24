import { serve } from '@hono/node-server';
import { Env, Hono, MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z, ZodSchema } from 'zod';
import { signupSchema } from '../../core/models/signup.js';

const ERROR_TYPE_PREFIX = 'https://gendix.com.br/errors';

function jsonValidator<S extends ZodSchema, E extends Env, P extends string>(
	schema: S,
): MiddlewareHandler<E, P, { in: { json: z.input<S> }; out: { json: z.output<S> } }> {
	return zValidator('json', schema, (result, c) => {
		if (!result.success) {
			return createProblemResponse(
				400,
				'invalid-request-body',
				'Validation Failed',
				'The request payload does not match the expected schema',
				c.req.url,
				{ issues: result.error.issues },
			);
		}
	});
}

function createProblemResponse(
	status: number,
	type: string,
	title: string,
	detail: string,
	instance?: string,
	extraDetails?: Record<string, unknown>,
): Response {
	const problem = {
		type: `${ERROR_TYPE_PREFIX}/${type}`,
		title,
		status,
		detail,
		...(instance && { instance }),
		...extraDetails,
	};

	return new Response(JSON.stringify(problem), {
		status,
		headers: {
			'Content-Type': 'application/problem+json',
		},
	});
}

function startServer(_abortSignal: AbortSignal): void {
	const app = new Hono();

	app.get('/', (c) => {
		return c.text('Gendix Chat API');
	});

	app.get('/signup', serveStatic({ path: './static/signup.html' }));
	app.get('/signup-success', serveStatic({ path: './static/signup-success.html' }));
	app.get('/assets/zxcvbn.js', serveStatic({ path: './static/assets/zxcvbn.js' }));

	app.post('/api/signup', jsonValidator(signupSchema), async (c) => {
		c.req.valid('json');
		return c.json({ success: true });
	});

	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			const status = err.status;
			const type = status === 405 ? 'method-not-allowed' : 'internal-server-error';
			const title = status === 405 ? 'Method Not Allowed' : 'Server Error';
			const detail = err.message || 'An error occurred while processing your request';

			return createProblemResponse(status, type, title, detail, c.req.url);
		}

		return createProblemResponse(
			500,
			'internal-server-error',
			'Server Error',
			'An unexpected error occurred',
			c.req.url,
		);
	});

	app.notFound(async (c) => {
		const path = new URL(c.req.url).pathname;
		const method = c.req.method;

		const registeredRoutes = app.routes.map((route) => ({
			path: route.path,
			method: route.method,
		}));

		const pathExists = registeredRoutes.some(
			(route) => route.path === path && route.method !== method,
		);

		if (pathExists) {
			throw new HTTPException(405, {
				message: 'The requested method is not allowed for this resource',
			});
		}

		return createProblemResponse(
			404,
			'not-found',
			'Not Found',
			'The requested resource could not be found',
			c.req.url,
		);
	});

	serve({
		fetch: app.fetch,
		port: 3000,
		hostname: '0.0.0.0',
	});
}

export { startServer };
