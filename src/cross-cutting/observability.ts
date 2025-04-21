import { createRequire } from 'node:module';
import { trace, SpanStatusCode, type AttributeValue, type Span } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import { Secret } from '../lib/secret.js';
import { EnvironmentConfigurationProvider } from '../ports/driven/EnvironmentConfigurationProvider.js';

type Fn<P extends Array<unknown>, R> = (...args: P) => R;
type FnAny = Fn<Array<unknown>, unknown>;

const { name, version } = createRequire(import.meta.url)('../../package.json');

const ATTRIBUTE_PREFIX = 'app';

const {
	observability: { otlpEndpoint, otlpHeaderKey, otlpHeaderValue },
} = new EnvironmentConfigurationProvider().getConfiguration();

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: name,
		[ATTR_SERVICE_VERSION]: version,
	}),
	traceExporter: new OTLPTraceExporter({
		url: otlpEndpoint,
		headers: {
			[otlpHeaderKey]: otlpHeaderValue.unsafeReveal(),
		},
	}),
	instrumentations: [
		getNodeAutoInstrumentations({
			'@opentelemetry/instrumentation-fs': {
				enabled: false,
			},
		}),
	],
	serviceName: name,
});

sdk.start();

const isDirectlySerializable = (value: object): boolean =>
	Array.isArray(value) &&
	(value.every((v) => typeof v === 'string') ||
		value.every((v) => typeof v === 'number') ||
		value.every((v) => typeof v === 'boolean'));

const MAX_ARRAY_ITEMS = 20;
const MAX_KEYS_PER_OBJECT = 20;
const MAX_OBJECT_SERIALIZATION_DEPTH = 5;
const MAX_STRING_LENGTH = 100;
const MAX_ERROR_MESSAGE_LENGTH = 2000;

const normalizeString = (input: string): string => {
	if (input.length <= MAX_STRING_LENGTH) {
		return input;
	}
	return `${input.slice(0, MAX_STRING_LENGTH)}...`;
};

const serializeToAttribute = (
	prefix: string,
	arg: unknown,
	depth = 0,
): ReadonlyArray<[string, AttributeValue]> => {
	switch (typeof arg) {
		case 'number':
		case 'boolean':
			return [[prefix, arg]];
		case 'string':
			return [[prefix, normalizeString(arg)]];
		case 'bigint':
		case 'symbol':
			return [[prefix, arg.toString()]];
		case 'function':
			return [[prefix, arg.name]];
		case 'undefined':
			return [[prefix, 'undefined']];
		case 'object': {
			if (arg === null) {
				return [[prefix, 'null']];
			}
			if (arg instanceof Secret) {
				return [[prefix, arg.toString()]];
			}
			if (Array.isArray(arg)) {
				const includedArgs = arg.slice(0, MAX_ARRAY_ITEMS);
				if (isDirectlySerializable(includedArgs)) {
					return [[prefix, includedArgs]];
				}
				return [
					[`${prefix}.length`, arg.length],
					...includedArgs.flatMap((arg, index) => serializeToAttribute(`${prefix}.${index}`, arg)),
				];
			}
			const entries = Object.entries(arg);
			if (depth > MAX_OBJECT_SERIALIZATION_DEPTH || entries.length > MAX_KEYS_PER_OBJECT) {
				let json;
				try {
					json = normalizeString(JSON.stringify(arg));
				} catch (e) {
					json = '<not stringifiable>';
				}
				return [[prefix, json]];
			}
			return Object.entries(arg).flatMap(([key, value]) => {
				return serializeToAttribute(`${prefix}.${key}`, value);
			});
		}
	}
};

const serializeToAttributes = (...args: Array<unknown>): Record<string, AttributeValue> => {
	return Object.fromEntries(
		args.flatMap((arg, index) => {
			const prefix = `${ATTRIBUTE_PREFIX}.arguments.${index}`;
			return serializeToAttribute(prefix, arg);
		}),
	);
};

const handleErrorInSpan = (span: Span, error: unknown): void => {
	if (error instanceof Error) {
		if (error.message.length > MAX_ERROR_MESSAGE_LENGTH) {
			const streamlinedMessage = error.message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
			span.recordException(streamlinedMessage);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: streamlinedMessage,
			});
		} else {
			span.recordException(error);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error.message,
			});
		}
	} else if (typeof error === 'string') {
		span.recordException(error);
		span.setStatus({ code: SpanStatusCode.ERROR, message: error });
	} else {
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error?.toString(),
		});
	}
	span.end();
};

const instrumentFunction = function <P extends Array<unknown>, R>(
	spanName: string,
	fn: Fn<P, R>,
): Fn<P, R> {
	return function (...args) {
		const result = trace.getTracer(name, version).startActiveSpan(spanName, function (span) {
			try {
				const result = fn(...args);
				span.setAttributes(serializeToAttributes(...args));
				if (result instanceof Promise) {
					return result
						.then((value) => {
							span.setAttributes(
								Object.fromEntries(serializeToAttribute(`${ATTRIBUTE_PREFIX}.return`, value)),
							);
							span.end();
							return value;
						})
						.catch((error) => {
							handleErrorInSpan(span, error);
							throw error;
						}) as R;
				}
				span.setAttributes(
					Object.fromEntries(serializeToAttribute(`${ATTRIBUTE_PREFIX}.return`, result)),
				);
				span.end();
				return result;
			} catch (error) {
				handleErrorInSpan(span, error);
				throw error;
			}
		});
		return result;
	};
};

const skippedMethods = new Set<FnAny>();

function instrument() {
	return function <T extends FnAny>(klass: T): T {
		const { prototype, name } = klass;
		Object.getOwnPropertyNames(prototype).forEach((key) => {
			const value = prototype[key];
			if (typeof value !== 'function') {
				return;
			}

			if (skippedMethods.has(value)) {
				return;
			}

			const newValue = function (this: unknown, ...args: Array<unknown>) {
				const inner = instrumentFunction(`${name} - ${key}`, value.bind(this));
				return inner(...args);
			};

			prototype[key] = newValue;
		});
		return klass;
	};
}

function skipInstrumentation() {
	return function <T extends FnAny>(method: T): T {
		skippedMethods.add(method);
		return method;
	};
}

const instrumentFatalError = async (error: unknown): Promise<void> => {
	instrumentFunction('shutdown - unhandledRejection', () => {
		const span = trace.getActiveSpan()!;
		if (error instanceof Error) {
			span.recordException(error);
			span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
		} else {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error?.toString(),
			});
		}
	})();
	const outerSpan = trace.getActiveSpan();
	if (outerSpan) {
		outerSpan.end();
	}
	await sdk.shutdown();
};

const instrumentSignal = async (signal: string): Promise<void> => {
	instrumentFunction('shutdown - signal', () => {
		trace.getActiveSpan()!.setAttribute(`${ATTRIBUTE_PREFIX}.shutdown.signal`, signal);
	})();
	const outerSpan = trace.getActiveSpan();
	if (outerSpan) {
		outerSpan.end();
	}
	await sdk.shutdown();
};
export {
	instrument,
	instrumentFunction,
	instrumentFatalError,
	instrumentSignal,
	skipInstrumentation,
};
