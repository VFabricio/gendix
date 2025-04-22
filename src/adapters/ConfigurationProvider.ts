import { z } from 'zod';
import { Secret } from '../lib/secret.js';

export const configurationSchema = z.object({
	observability: z.object({
		otlpEndpoint: z.string(),
		otlpHeaderKey: z.string(),
		otlpHeaderValue: z.instanceof(Secret).describe('Secret'),
	}),
});

export type Configuration = z.infer<typeof configurationSchema>;

export interface ConfigurationProvider {
	getConfiguration(): Configuration;
}
