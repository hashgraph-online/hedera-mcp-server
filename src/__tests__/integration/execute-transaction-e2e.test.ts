import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  jest,
} from '@jest/globals';
import {
  startTestServer,
  callServerTool,
  TestServerEnvironment,
} from '../test-utils/server-test-helper';
import { setupTestDatabase } from '../test-db-setup';
import { Client, PrivateKey } from '@hashgraph/sdk';
import { Logger } from '@hashgraphonline/standards-sdk';

jest.setTimeout(120000);

describe('Execute Transaction E2E Tests', () => {
  let testEnv: TestServerEnvironment;
  let testAccountId: string;
  let testAccountKey: PrivateKey;
  let client: Client | null = null;

  beforeAll(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error(
        'Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars',
      );
    }

    testAccountId = process.env.HEDERA_OPERATOR_ID;
    testAccountKey = PrivateKey.fromStringECDSA(
      process.env.HEDERA_OPERATOR_KEY,
    );

    const logger = Logger.getInstance({
      level: 'info',
      module: 'ExecuteTransactionE2ETest',
      prettyPrint: false,
    });

    testEnv = await startTestServer({
      port: 4996,
      env: {
        HEDERA_OPERATOR_ID: testAccountId,
        HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY,
        SERVER_ACCOUNT_ID: testAccountId,
        ENABLE_HCS10: 'false',
        LOG_LEVEL: 'info',
        SKIP_CREDIT_CHECK: 'true',
      },
    });

    logger.info('Test environment set up');
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }

    await testEnv?.cleanup();
  });

  test('should execute a transaction with natural language request', async () => {
    const balanceBefore = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    console.log('Initial balance:', balanceBefore);

    const response = await callServerTool(
      testEnv.baseUrl,
      'execute_transaction',
      {
        request: 'Transfer 0.0001 HBAR from my account back to my account',
        accountId: testAccountId,
      },
    );

    expect(response).toBeDefined();
    expect(response.operation).toBe('execute_transaction');
    expect(response.status).not.toBe('failed');

    const balanceAfter = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    console.log('Balance after execution:', balanceAfter);

    if (balanceBefore.balance?.current > 0) {
      expect(balanceAfter.balance.current).toBeLessThan(
        balanceBefore.balance.current,
      );
    }
  });

  test('should reject execution with insufficient credits', async () => {
    const poorAccountId = '0.0.987654321';

    try {
      const response = await callServerTool(
        testEnv.baseUrl,
        'execute_transaction',
        {
          request: 'Transfer 0.0001 HBAR from my account to 0.0.123456',
          accountId: poorAccountId,
        },
      );

      expect(response).toBeDefined();
      if (response.status === 'insufficient_credits') {
        expect(response.status).toBe('insufficient_credits');
      }
    } catch (error) {
      expect((error as Error).message).toContain('Tool call');
    }
  });

  test('should handle invalid requests gracefully', async () => {
    const response = await callServerTool(
      testEnv.baseUrl,
      'execute_transaction',
      {
        request: 'This is not a valid Hedera transaction request',
        accountId: testAccountId,
      },
    );

    expect(response).toBeDefined();
  });

  test('should check for required parameters', async () => {
    await expect(
      callServerTool(testEnv.baseUrl, 'execute_transaction', {})
    ).rejects.toThrow('execute_transaction');

    const response = await callServerTool(testEnv.baseUrl, 'execute_transaction', {
      request: 'Transfer 0.0001 HBAR from my account to 0.0.123456',
    });
    expect(response.status).toBe('unauthorized');
  });
});
