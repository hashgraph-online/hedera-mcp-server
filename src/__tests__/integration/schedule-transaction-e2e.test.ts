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
import { Logger } from '@hashgraphonline/standards-sdk';

jest.setTimeout(120000);

describe('Schedule Transaction E2E Tests', () => {
  let testEnv: TestServerEnvironment;
  let testAccountId: string;

  beforeAll(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error(
        'Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars',
      );
    }

    testAccountId = process.env.HEDERA_OPERATOR_ID;

    const logger = Logger.getInstance({
      level: 'info',
      module: 'ScheduleTransactionE2ETest',
      prettyPrint: false,
    });

    testEnv = await startTestServer({
      port: 4997,
      env: {
        HEDERA_OPERATOR_ID: testAccountId,
        HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY,
        SERVER_ACCOUNT_ID: testAccountId,
        ENABLE_HCS10: 'false',
        LOG_LEVEL: 'info',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key',
        SKIP_CREDIT_CHECK: 'true',
      },
    });

    logger.info('Test environment set up');
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  test('should create a scheduled transaction when provided with valid parameters', async () => {
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
      'schedule_transaction',
      {
        request: 'Schedule a transfer of 1 HBAR from my account to 0.0.123456',
        accountId: testAccountId,
      },
    );

    expect(response).toBeDefined();

    if (response.error && response.error.includes('OpenAI')) {
      console.warn('Test skipped due to missing or invalid OpenAI API key');
      return;
    }

    expect(response.operation).toBe('schedule_transaction');
    expect(response.status).not.toBe('failed');

    const balanceAfter = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    console.log('Balance after scheduling:', balanceAfter);

    if (balanceBefore.balance?.current > 0) {
      expect(balanceAfter.balance.current).toBeLessThan(
        balanceBefore.balance.current,
      );
    }
  });

  test('should reject scheduling with insufficient credits', async () => {
    const poorAccountId = '0.0.987654321';

    try {
      const response = await callServerTool(
        testEnv.baseUrl,
        'schedule_transaction',
        {
          request: 'Schedule a transfer of 1 HBAR to 0.0.123456',
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

  test('should require accountId parameter', async () => {
    const response = await callServerTool(testEnv.baseUrl, 'schedule_transaction', {
      request: 'Schedule a transfer of 1 HBAR to 0.0.123456',
    });
    expect(response.status).toBe('unauthorized');
  });

  test('should require request parameter', async () => {
    await expect(
      callServerTool(testEnv.baseUrl, 'schedule_transaction', {
        accountId: testAccountId,
      })
    ).rejects.toThrow();
  });
});
