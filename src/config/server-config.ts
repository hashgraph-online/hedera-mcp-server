import { z } from 'zod';
import * as dotenv from 'dotenv';
import { Logger } from '@hashgraphonline/standards-sdk';

dotenv.config();

const logger = new Logger({ module: 'ServerConfig' });

const ServerConfigSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  AUTH_API_PORT: z.string().default('3003').transform(Number),
  HTTP_API_PORT: z.string().default('3002').transform(Number),

  HEDERA_NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  HEDERA_OPERATOR_ID: z.string().min(1, 'Hedera operator ID is required'),
  HEDERA_OPERATOR_KEY: z
    .string()
    .min(1, 'Hedera operator private key is required'),

  SERVER_ACCOUNT_ID: z.string().min(1, 'Server account ID is required'),
  SERVER_PRIVATE_KEY: z.string().min(1, 'Server private key is required'),

  ENABLE_HCS10: z
    .string()
    .default('true')
    .transform(val => val === 'true'),

  FORCE_REREGISTER: z
    .string()
    .default('false')
    .transform(val => val === 'true'),

  PROFILE_CACHE_MINUTES: z.string().default('60').transform(Number),

  AGENT_NAME: z.string().default('Hedera MCP Server'),
  AGENT_DESCRIPTION: z
    .string()
    .default(
      'FastMCP-powered server providing Hedera network operations with credits system',
    ),
  AGENT_TYPE: z.enum(['autonomous', 'manual']).default('manual'),
  AGENT_MODEL: z.string().default('mcp-server-v1'),

  AGENT_CAPABILITIES: z
    .string()
    .default('0,1,4,5,11,14')
    .transform(val =>
      val
        .split(',')
        .map(Number)
        .filter(n => !isNaN(n)),
    ),

  AGENT_PROFILE_PICTURE: z.string().optional(),
  AGENT_PROFILE_PICTURE_URL: z.string().optional(),

  FEE_COLLECTOR_ACCOUNT_ID: z.string().optional(),
  AGENT_HBAR_FEE: z
    .string()
    .optional()
    .transform(val => (val ? Number(val) : undefined)),
  AGENT_TOKEN_FEE: z.string().optional(),
  AGENT_EXEMPT_ACCOUNTS: z
    .string()
    .optional()
    .transform(val =>
      val
        ? val
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        : undefined,
    ),

  PERSIST_AGENT_DATA: z
    .string()
    .default('true')
    .transform(val => val === 'true'),
  AGENT_DATA_PREFIX: z.string().default('AGENT'),

  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  DATABASE_TYPE: z.enum(['sqlite', 'postgres']).default('sqlite').optional(),

  REQUIRE_AUTH: z
    .string()
    .default('true')
    .transform(val => val === 'true'),
  API_KEY_ENCRYPTION_KEY: z.string().optional(),

  CREDITS_CONVERSION_RATE: z.string().default('1000').transform(Number),
  CREDITS_MINIMUM_PAYMENT: z.string().default('1').transform(Number),
  CREDITS_MAXIMUM_PAYMENT: z.string().default('10000').transform(Number),
  CREDITS_CONFIRMATION_BLOCKS: z.string().default('3').transform(Number),

  MCP_TRANSPORT: z.enum(['stdio', 'http', 'both']).default('both'),
  MCP_SERVER_VERSION: z.string().default('1.0.0'),

  RATE_LIMIT_MAX: z.string().default('100').transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),

  SERVER_DISPLAY_NAME: z.string().default('Hedera MCP Server'),
  SERVER_ALIAS: z.string().default('hedera_mcp'),
  SERVER_BIO: z
    .string()
    .default(
      'FastMCP-powered server providing Hedera network operations with credits system',
    ),

  VERIFICATION_TYPE: z.enum(['dns', 'signature', 'challenge']).default('dns'),
  VERIFICATION_DOMAIN: z.string().optional(),
  VERIFICATION_DNS_FIELD: z.string().default('hedera'),

  ENABLE_METRICS: z
    .string()
    .default('false')
    .transform(val => val === 'true'),
  METRICS_PORT: z.string().default('9100').transform(Number),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public errors: z.ZodError,
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Loads and validates server configuration from environment variables
 */
export function loadServerConfig(): ServerConfig {
  try {
    const env = { ...process.env };
    if (!env.DATABASE_TYPE && env.DATABASE_URL) {
      if (env.DATABASE_URL.startsWith('postgres')) {
        env.DATABASE_TYPE = 'postgres';
      } else if (env.DATABASE_URL.startsWith('sqlite')) {
        env.DATABASE_TYPE = 'sqlite';
      }
    }

    const config = ServerConfigSchema.parse(env);

    validateDualModeConfig(config);

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n');

      throw new ConfigurationError(
        `Configuration validation failed:\n${errorMessage}`,
        error,
      );
    }
    throw error;
  }
}

/**
 * Validates dual-mode configuration requirements
 * @param config - The server configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateDualModeConfig(config: ServerConfig): void {
  if (config.VERIFICATION_TYPE === 'dns' && !config.VERIFICATION_DOMAIN) {
    throw new Error('DNS verification requires VERIFICATION_DOMAIN to be set');
  }

  if (config.SERVER_ACCOUNT_ID === config.HEDERA_OPERATOR_ID) {
    logger.warn(
      'SERVER_ACCOUNT_ID and HEDERA_OPERATOR_ID are the same. Consider using separate accounts for security.',
    );
  }

  if (config.AGENT_TOKEN_FEE && config.AGENT_TOKEN_FEE.trim().length > 0) {
    const parts = config.AGENT_TOKEN_FEE.split(':');
    if (
      parts.length !== 2 ||
      !parts[0]?.match(/^0\.0\.\d+$/) ||
      isNaN(Number(parts[1]))
    ) {
      throw new Error(
        'AGENT_TOKEN_FEE must be in format "tokenId:amount" (e.g., "0.0.123456:10")',
      );
    }
  }

  if (
    config.AGENT_PROFILE_PICTURE &&
    config.AGENT_PROFILE_PICTURE_URL &&
    config.AGENT_PROFILE_PICTURE.length > 0 &&
    config.AGENT_PROFILE_PICTURE_URL.length > 0
  ) {
    logger.warn(
      'Both AGENT_PROFILE_PICTURE and AGENT_PROFILE_PICTURE_URL are set. AGENT_PROFILE_PICTURE will take precedence.',
    );
  }
}

/**
 * Parses token fee configuration from AGENT_TOKEN_FEE string
 * @param tokenFeeString - Token fee string in format "tokenId:amount"
 * @returns Parsed token fee object or undefined if invalid
 */
export function parseTokenFee(
  tokenFeeString?: string,
): { tokenId: string; amount: number } | undefined {
  if (!tokenFeeString || tokenFeeString.trim().length === 0) return undefined;

  const parts = tokenFeeString.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;

  const tokenId = parts[0].trim();
  const amount = Number(parts[1].trim());

  if (!tokenId.match(/^0\.0\.\d+$/) || isNaN(amount) || amount <= 0) {
    return undefined;
  }

  return { tokenId, amount };
}

export const config = loadServerConfig();
