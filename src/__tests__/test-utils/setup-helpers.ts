import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { CreditManagerBase } from '../../db/credit-manager-base';
import type { ServerConfig } from '../../config/server-config';
import {
  HederaAgentKit,
  ServerSigner,
} from '@hashgraphonline/hedera-agent-kit';
import { execSync } from 'child_process';
import { join } from 'path';
import * as fs from 'fs/promises';
import { Logger } from '@hashgraphonline/standards-sdk';

const TEST_DB_PREFIX = 'test-db';

export interface TestEnvironment {
  creditService: CreditManagerBase;
  config: Partial<ServerConfig>;
  cleanup: () => Promise<void>;
}

/**
 * Creates a test configuration with sensible defaults
 */
export function createTestConfig(
  overrides?: Partial<ServerConfig>
): Partial<ServerConfig> {
  return {
    DATABASE_URL: 'sqlite://:memory:',
    HEDERA_NETWORK:
      (process.env.HEDERA_NETWORK as 'mainnet' | 'testnet') || 'testnet',
    HEDERA_OPERATOR_ID: process.env.HEDERA_OPERATOR_ID || '0.0.999999',
    HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY || 'test-key',
    SERVER_ACCOUNT_ID:
      process.env.SERVER_ACCOUNT_ID ||
      process.env.HEDERA_OPERATOR_ID ||
      '0.0.999999',
    SERVER_PRIVATE_KEY:
      process.env.SERVER_PRIVATE_KEY ||
      process.env.HEDERA_OPERATOR_KEY ||
      'test-key',
    CREDITS_CONVERSION_RATE: 1000,
    CREDITS_MINIMUM_PAYMENT: 1,
    CREDITS_MAXIMUM_PAYMENT: 10000,
    ...overrides,
  };
}

/**
 * Sets up a test database with automatic cleanup
 */
export async function setupTestDatabase(
  type: 'sqlite' | 'postgres' | 'memory' = 'memory',
  configOverrides?: Partial<ServerConfig>
): Promise<TestEnvironment> {
  const logger = new Logger({ module: 'test' });
  let databaseUrl: string;
  let cleanup: () => Promise<void>;

  switch (type) {
    case 'memory':
      databaseUrl = 'sqlite://:memory:';
      cleanup = async () => {};
      break;

    case 'sqlite':
      const dbPath = join(
        __dirname,
        `../../${TEST_DB_PREFIX}-${Date.now()}.sqlite`
      );
      databaseUrl = `sqlite://${dbPath}`;
      cleanup = async () => {
        try {
          await fs.unlink(dbPath);
        } catch (error) {}
      };
      break;

    case 'postgres':
      // For PostgreSQL tests, assume database is already set up
      databaseUrl =
        process.env.TEST_POSTGRES_URL ||
        'postgresql://test:test@localhost:5432/test';
      cleanup = async () => {
        // Drop all tables in test database
        const testLogger = new Logger({ module: 'test-cleanup' });
        const testSigner = new ServerSigner('0.0.1', 'test-key', 'testnet');
        const testKit = new HederaAgentKit(testSigner);

        const testConfig = createTestConfig({
          DATABASE_URL: databaseUrl,
        }) as ServerConfig;

        const creditService = await CreditManagerFactory.create(
          testConfig,
          testKit,
          testLogger
        );

        // Clean up tables
        if (
          'cleanup' in creditService &&
          typeof creditService['cleanup'] === 'function'
        ) {
          await creditService['cleanup']();
        }
      };
      break;
  }

  const testConfig = createTestConfig({
    ...configOverrides,
    DATABASE_URL: databaseUrl,
  });

  // Create HederaAgentKit for testing
  const signer = new ServerSigner(
    testConfig.HEDERA_OPERATOR_ID!,
    testConfig.HEDERA_OPERATOR_KEY!,
    testConfig.HEDERA_NETWORK as 'mainnet' | 'testnet'
  );
  const hederaKit = new HederaAgentKit(signer);

  const creditService = await CreditManagerFactory.create(
    testConfig as ServerConfig,
    hederaKit,
    logger
  );

  // Add test operations with known costs
  creditService['operationCosts'].set('test-operation', 5);
  creditService['operationCosts'].set('operation-1', 10);
  creditService['operationCosts'].set('operation-2', 15);
  creditService['operationCosts'].set('op1', 20);
  creditService['operationCosts'].set('op2', 30);
  creditService['operationCosts'].set('too-much', 150);
  creditService['operationCosts'].set('execute_transaction', 15);
  creditService['operationCosts'].set('generate_transaction_bytes', 5);
  creditService['operationCosts'].set('schedule_transaction', 10);

  return {
    creditService,
    config: testConfig,
    cleanup,
  };
}

/**
 * Runs database migrations for testing
 */
export async function runTestMigrations(
  databaseUrl: string,
  type: 'sqlite' | 'postgres'
): Promise<void> {
  const migrateScript = join(__dirname, '../../scripts/migrate.ts');

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_TYPE: type,
  };

  try {
    execSync(`npx tsx ${migrateScript}`, { env, stdio: 'pipe' });
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

/**
 * Creates multiple test accounts with initial balances
 */
export async function createTestAccounts(
  creditService: CreditManagerBase,
  accounts: Array<{ accountId: string; initialBalance?: number }>
): Promise<void> {
  for (const account of accounts) {
    if (account.initialBalance && account.initialBalance > 0) {
      await creditService.processHbarPayment({
        transactionId: `init-${account.accountId}-${Date.now()}`,
        payerAccountId: account.accountId,
        hbarAmount: account.initialBalance,
        creditsAllocated: Math.floor(account.initialBalance * 1000),
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Waits for database to be ready
 */
export async function waitForDatabaseReady(
  creditService: CreditManagerBase,
  timeoutMs: number = 10000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try a simple operation to check if DB is ready
      await creditService.getCreditBalance('0.0.test');
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error('Database did not become ready in time');
}
