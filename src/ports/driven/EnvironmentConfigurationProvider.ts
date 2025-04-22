import { z } from 'zod';
import { config } from 'dotenv';
import {
	ConfigurationProvider,
	configurationSchema,
	type Configuration,
} from '../../adapters/ConfigurationProvider.js';
import { Secret } from '../../lib/secret.js';

export class EnvironmentConfigurationProvider implements ConfigurationProvider {
	constructor() {
		config();
	}
	getConfiguration(): Configuration {
		try {
			const config = this.extractConfigFromEnvironment(configurationSchema, []);
			return configurationSchema.parse(config);
		} catch (error) {
			throw new Error(
				`Failed to load configuration from environment: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private extractConfigFromEnvironment(
		schema: z.ZodObject<z.ZodRawShape>,
		prefix: ReadonlyArray<string>,
	): Record<string, unknown> {
		const config: Record<string, unknown> = {};
		const shape = schema.shape;

		Object.entries(shape).forEach(([key, zodType]) => {
			const currentPrefix = [...prefix, key.toUpperCase()];

			if (zodType instanceof z.ZodObject) {
				config[key] = this.extractConfigFromEnvironment(zodType, currentPrefix);
				return;
			}

			const envKey = currentPrefix.join('_');
			const envValue = process.env[envKey];

			if (envValue === undefined) {
				throw new Error(`Required environment variable ${envKey} is missing`);
			}

			if (zodType instanceof z.ZodNumber) {
				const parsedValue = Number(envValue);
				if (isNaN(parsedValue)) {
					throw new Error(
						`Environment variable ${envKey} with value "${envValue}" cannot be parsed as a number`,
					);
				}
				config[key] = parsedValue;
			} else if (zodType instanceof z.ZodString) {
				config[key] = envValue;
			} else if (zodType.description === 'Secret') {
				config[key] = new Secret(envValue);
			} else {
				throw new Error(
					'Values in the configuration schema must be either strings, numbers, or secrets',
				);
			}
		});

		return config;
	}
}
