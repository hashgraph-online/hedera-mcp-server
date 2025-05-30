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
  callServerToolHTTP,
  createTestApiKey,
  TestServerEnvironment,
} from '../test-utils/server-test-helper';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import {
  HederaAgentKit,
  ServerSigner,
} from '@hashgraphonline/hedera-agent-kit';
import { Logger } from '@hashgraphonline/standards-sdk';
import { loadServerConfig } from '../../config/server-config';
import { setupTestDatabase } from '../test-db-setup';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import fetch from 'node-fetch';
import { PortManager } from '../test-utils/port-manager';
import { ApiKeyService } from '../../auth/api-key-service';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../../db/schema';
import { randomBytes } from 'crypto';

jest.setTimeout(120000);

describe('MCP Server E2E Tests', () => {
  let testEnv: TestServerEnvironment;
  let testAccountId: string;
  let logger: Logger;
  let apiKey: string;
  let sqlite: Database.Database;
  let tempDbPath: string;

  beforeAll(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error(
        'Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars',
      );
    }

    testAccountId = process.env.HEDERA_OPERATOR_ID;
    logger = Logger.getInstance({
      level: 'debug',
      module: 'MCPServerE2E',
      prettyPrint: false,
    });

    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
     const databaseUrl = `sqlite://${tempDbPath}`;

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    const testPort = PortManager.getPort();
    testEnv = await startTestServer({
      port: testPort,
      env: {
        DATABASE_URL: databaseUrl,
        HEDERA_OPERATOR_ID: testAccountId,
        HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY,
        SERVER_ACCOUNT_ID: testAccountId,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key',
        ENABLE_HCS10: 'false',
        REQUIRE_AUTH: 'true',
        CREDITS_CONVERSION_RATE: '1000',
        LOG_LEVEL: 'debug',
      },
    });

    const payment = {
      transactionId: `${testAccountId}@${Date.now()}.setup`,
      payerAccountId: testAccountId,
      targetAccountId: testAccountId,
      hbarAmount: 10.0,
      creditsAllocated: 10000,
      memo: 'Test setup',
      status: 'COMPLETED' as const,
      timestamp: new Date().toISOString(),
    };

    const config = loadServerConfig();
    const signer = new ServerSigner(
      config.HEDERA_OPERATOR_ID,
      config.HEDERA_OPERATOR_KEY,
      config.HEDERA_NETWORK,
    );
    const hederaKit = new HederaAgentKit(signer);
    await hederaKit.initialize();

    const creditManager = await CreditManagerFactory.create(
      config,
      hederaKit,
      logger,
    );
    await creditManager.initialize();
    await creditManager.processHbarPayment(payment);
    await creditManager.close?.();

    apiKey = await createTestApiKey(testAccountId, ['read', 'write', 'admin']);
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
    if (sqlite) {
      sqlite.close();
    }
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {}
  });

  describe('Server Health and Info', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`${testEnv.baseUrl}/api/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe('ok');
    });

    test('should provide server info through MCP tool', async () => {
      const response = await callServerTool(testEnv.baseUrl, 'get_server_info');
      console.log('Server info response:', response);
      expect(response).toBeDefined();
      if (response) {
        expect(response.serverAccount).toBeDefined();
        expect(response.hederaNetwork).toBeDefined();
        expect(response.creditsConversionRate).toBeDefined();
      }
    });

    test('should list available tools', async () => {
      const { Client } = await import(
        '@modelcontextprotocol/sdk/client/index.js'
      );
      const { StreamableHTTPClientTransport } = await import(
        '@modelcontextprotocol/sdk/client/streamableHttp.js'
      );

      const streamUrl =
        testEnv.baseUrl.replace(/(\d+)$/, port => {
          const newPort = parseInt(port) - 1;
          return newPort.toString();
        }) + '/stream';

      const transport = new StreamableHTTPClientTransport(
        new URL(streamUrl),
      ) as any;
      const client = new Client(
        {
          name: 'test-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await client.connect(transport);

      const tools = await client.listTools();
      await client.close();

      expect(tools).toBeDefined();
      expect(tools.tools).toBeDefined();
      expect(Array.isArray(tools.tools)).toBe(true);
      expect(tools.tools.length).toBeGreaterThan(0);

      const toolNames = tools.tools.map((t: any) => t.name);
      console.log('Available tools:', toolNames);
      expect(toolNames).toContain('check_credit_balance');
      expect(toolNames).toContain('generate_transaction_bytes');
      expect(toolNames).toContain('execute_transaction');
      expect(toolNames).toContain('purchase_credits');
    });
  });

  describe('Credit Management', () => {
    test('should check credit balance', async () => {
      const response = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );

      console.log(
        'Credit balance response:',
        JSON.stringify(response, null, 2),
      );
      console.log('API key used:', apiKey ? 'present' : 'missing');

      expect(response).toBeDefined();
      expect(response.balance).toBeDefined();
      expect(response.balance.current).toBeGreaterThanOrEqual(0);
      expect(response.balance.totalPurchased).toBeGreaterThanOrEqual(0);
      expect(response.balance.totalConsumed).toBeGreaterThanOrEqual(0);
    });

    test('should get credit history', async () => {
      const response = await callServerTool(
        testEnv.baseUrl,
        'get_credit_history',
        {
          accountId: testAccountId,
          limit: 10,
        },
        apiKey,
      );

      expect(response).toBeDefined();
      expect(response.transactions).toBeDefined();
      expect(Array.isArray(response.transactions)).toBe(true);
      expect(response.pagination).toBeDefined();
    });

    test('should get credit balance for non-existent account', async () => {
      const response = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: '0.0.99999999',
        },
        apiKey,
      );

      expect(response).toBeDefined();
      expect(response.balance.current).toBe(0);
      expect(response.balance.totalPurchased).toBe(0);
      expect(response.balance.totalConsumed).toBe(0);
    });
  });

  describe('Transaction Tools', () => {
    test('should consume credits for generate_transaction_bytes', async () => {
      const balanceBefore = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(
        testEnv.baseUrl,
        'generate_transaction_bytes',
        {
          request: 'Send 1 HBAR to 0.0.123456',
          accountId: testAccountId,
        },
        apiKey,
      );

      expect(response).toBeDefined();

      if (response.error && response.error.includes('OpenAI')) {
        expect(response.status).toBe('failed');
        expect(response.error).toContain('OpenAI API key');
      } else {
        expect(response.operation).toBe('generate_transaction_bytes');
      }

      const balanceAfter = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBeLessThan(beforeBalance);
      expect(afterBalance).toBeGreaterThanOrEqual(beforeBalance - 15);
    });

    test('should consume credits for scheduled transactions', async () => {
      const balanceBefore = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(
        testEnv.baseUrl,
        'schedule_transaction',
        {
          request: 'Schedule a transfer of 1 HBAR to 0.0.123456',
          accountId: testAccountId,
        },
        apiKey,
      );

      expect(response).toBeDefined();

      if (response.error && response.error.includes('OpenAI')) {
        expect(response.status).toBe('failed');
        expect(response.error).toContain('OpenAI API key');
      } else {
        expect(response.operation).toBe('schedule_transaction');
      }

      const balanceAfter = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBeLessThan(beforeBalance);
      expect(afterBalance).toBeGreaterThanOrEqual(beforeBalance - 25);
    });

    test('should consume credits for transaction execution', async () => {
      const balanceBefore = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(
        testEnv.baseUrl,
        'execute_transaction',
        {
          request: 'send 1 HBAR to 0.0.123456',
          accountId: testAccountId,
        },
        apiKey,
      );

      expect(response).toBeDefined();

      const balanceAfter = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBeLessThan(beforeBalance);
      expect(afterBalance).toBeGreaterThanOrEqual(beforeBalance - 60);
    });
  });

  describe('Free Operations', () => {
    test('should not consume credits for health check', async () => {
      const balanceBefore = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'health_check');
      expect(response).toBeDefined();
      expect(response.status).toBe('healthy');

      const balanceAfter = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance);
    });

    test('should not consume credits for server info', async () => {
      const balanceBefore = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'get_server_info');
      expect(response).toBeDefined();

      const balanceAfter = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: testAccountId,
        },
        apiKey,
      );
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance);
    });
  });

  describe('Insufficient Credits', () => {
    test('should reject operations when insufficient credits', async () => {
      const poorAccountId = '0.0.987654321';

      const balance = await callServerTool(
        testEnv.baseUrl,
        'check_credit_balance',
        {
          accountId: poorAccountId,
        },
        apiKey,
      );
      expect(balance.balance.current).toBe(0);

      const response = await callServerTool(
        testEnv.baseUrl,
        'execute_transaction',
        {
          request: 'send 1 HBAR to 0.0.123456',
          accountId: poorAccountId,
        },
        apiKey,
      );

      expect(response).toBeDefined();
      expect(response.error).toContain('Insufficient credits');
    });

    test('should show required credits in error message', async () => {
      const poorAccountId = '0.0.987654322';

      const response = await callServerTool(
        testEnv.baseUrl,
        'schedule_transaction',
        {
          request: 'Schedule something',
          accountId: poorAccountId,
        },
        apiKey,
      );

      expect(response).toBeDefined();
      expect(response.error).toContain('Insufficient credits');
      expect(response.error).toContain('24');
    });
  });

  describe('Payment Processing', () => {
    test('should create unique transaction IDs for each payment', async () => {
      const response1 = await callServerTool(
        testEnv.baseUrl,
        'purchase_credits',
        {
          payer_account_id: testAccountId,
          amount: 0.5,
          memo: 'Payment test 1',
        },
        apiKey,
      );

      console.log(
        'Purchase credits response1:',
        JSON.stringify(response1, null, 2),
      );

      if (response1?.error) {
        console.log('Error in response1:', response1.error);

        const unauthorizedResponse = await callServerTool(
          testEnv.baseUrl,
          'purchase_credits',
          {
            payer_account_id: testAccountId,
            amount: 0.5,
            memo: 'Payment test 1 - unauthorized',
          },
        );
        console.log(
          'Unauthorized response:',
          JSON.stringify(unauthorizedResponse, null, 2),
        );

        expect(response1.error).toContain('Authentication required');
        return;
      }

      const response2 = await callServerTool(
        testEnv.baseUrl,
        'purchase_credits',
        {
          payer_account_id: testAccountId,
          amount: 0.5,
          memo: 'Payment test 2',
        },
        apiKey,
      );

      console.log(
        'Purchase credits response2:',
        JSON.stringify(response2, null, 2),
      );

      expect(response1).toBeDefined();
      expect(response2).toBeDefined();
      expect(response1.transaction_id).toBeDefined();
      expect(response2.transaction_id).toBeDefined();
      expect(response1.transaction_id).not.toBe(response2.transaction_id);
      expect(response1.transaction_bytes).toBeDefined();
      expect(response2.transaction_bytes).toBeDefined();
    });
  });

  describe('Database Operations', () => {
    test('should persist data across manager instances', async () => {
      const config = loadServerConfig();
      const signer = new ServerSigner(
        config.HEDERA_OPERATOR_ID,
        config.HEDERA_OPERATOR_KEY,
        config.HEDERA_NETWORK,
      );
      const hederaKit = new HederaAgentKit(signer);
      await hederaKit.initialize();

      const creditManager1 = await CreditManagerFactory.create(
        config,
        hederaKit,
        logger,
      );
      await creditManager1.initialize();

      const testTxId = `persistence-test-${Date.now()}`;
      await creditManager1.processHbarPayment({
        transactionId: testTxId,
        payerAccountId: testAccountId,
        hbarAmount: 0.5,
        creditsAllocated: 0,
        memo: 'Persistence test',
        status: 'COMPLETED',
      });

      const balance1 = await creditManager1.getCreditBalance(testAccountId);
      await creditManager1.close?.();

      const creditManager2 = await CreditManagerFactory.create(
        config,
        hederaKit,
        logger,
      );
      await creditManager2.initialize();

      const balance2 = await creditManager2.getCreditBalance(testAccountId);
      expect(balance2?.balance).toBe(balance1?.balance);
      expect(balance2?.totalPurchased).toBe(balance1?.totalPurchased);

      await creditManager2.close?.();
    });

    test('should run migrations automatically', async () => {
      const tempDbPath = path.join(
        os.tmpdir(),
        `test-migration-${Date.now()}.db`,
      );
      const originalDbUrl = process.env.DATABASE_URL;
      let tempDb: Database.Database | undefined;

      try {
          const databaseUrl = `sqlite://${tempDbPath}`;
        process.env.DATABASE_URL = databaseUrl;

        tempDb = await setupTestDatabase(databaseUrl, logger);

        const config = loadServerConfig();
        const signer = new ServerSigner(
          config.HEDERA_OPERATOR_ID,
          config.HEDERA_OPERATOR_KEY,
          config.HEDERA_NETWORK,
        );
        const hederaKit = new HederaAgentKit(signer);
        await hederaKit.initialize();

        const creditManager = await CreditManagerFactory.create(
          config,
          hederaKit,
          logger,
        );
        await creditManager.initialize();

        expect(fs.existsSync(tempDbPath)).toBe(true);

        const costs = await creditManager.getOperationCosts();
        expect(costs.length).toBeGreaterThan(0);

        const executeCost = costs.find(
          c => c.operationName === 'execute_transaction',
        );
        expect(executeCost?.baseCost).toBe(50);

        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (tempDb) {
          tempDb.close();
        }
        if (fs.existsSync(tempDbPath)) {
          fs.unlinkSync(tempDbPath);
        }
      }
    });

    test('should handle invalid operation names gracefully', async () => {
      const config = loadServerConfig();
      const signer = new ServerSigner(
        config.HEDERA_OPERATOR_ID,
        config.HEDERA_OPERATOR_KEY,
        config.HEDERA_NETWORK,
      );
      const hederaKit = new HederaAgentKit(signer);
      await hederaKit.initialize();

      const creditManager = await CreditManagerFactory.create(
        config,
        hederaKit,
        logger,
      );
      await creditManager.initialize();

      const check = await creditManager.checkSufficientCredits(
        testAccountId,
        'invalid_operation',
      );
      expect(check.sufficient).toBe(true);
      expect(check.requiredCredits).toBe(0);

      await creditManager.close?.();
    });
  });
});
