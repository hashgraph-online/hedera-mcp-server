import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { startTestServer, callServerTool, TestServerEnvironment } from '../test-utils/server-test-helper';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { HederaAgentKit, ServerSigner } from '@hashgraphonline/hedera-agent-kit';
import { Logger } from '@hashgraphonline/standards-sdk';
import { loadServerConfig } from '../../config/server-config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import fetch from 'node-fetch';

jest.setTimeout(120000);

describe('MCP Server E2E Tests', () => {
  let testEnv: TestServerEnvironment;
  let testAccountId: string;
  let logger: Logger;

  beforeAll(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error('Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars');
    }

    testAccountId = process.env.HEDERA_OPERATOR_ID;
    logger = Logger.getInstance({
      level: 'error',
      module: 'MCPServerE2E',
      prettyPrint: false,
    });

    testEnv = await startTestServer({
      port: 4998,
      env: {
        HEDERA_OPERATOR_ID: testAccountId,
        HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY,
        SERVER_ACCOUNT_ID: testAccountId,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key',
        ENABLE_HCS10: 'false',
      }
    });

    const payment = {
      transactionId: `${testAccountId}@${Date.now()}.setup`,
      payerAccountId: testAccountId,
      hbarAmount: 10.0,
      creditsAllocated: 10000,
      memo: 'Test setup',
      status: 'COMPLETED',
    };

    const config = loadServerConfig();
    const signer = new ServerSigner(
      config.HEDERA_OPERATOR_ID,
      config.HEDERA_OPERATOR_KEY,
      config.HEDERA_NETWORK
    );
    const hederaKit = new HederaAgentKit(signer);
    await hederaKit.initialize();
    
    const creditManager = await CreditManagerFactory.create(config, hederaKit, logger);
    await creditManager.initialize();
    await creditManager.processHbarPayment(payment);
    await creditManager.close?.();
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  describe('Server Health and Info', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`${testEnv.baseUrl}/health`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.status).toBe('ok');
    });

    test('should provide server info through MCP tool', async () => {
      const response = await callServerTool(testEnv.baseUrl, 'get_server_info');
      expect(response).toBeDefined();
      expect(response.serverAccount).toBeDefined();
      expect(response.network).toBeDefined();
      expect(response.creditsConversionRate).toBeDefined();
    });

    test('should list available tools', async () => {
      const response = await fetch(`${testEnv.baseUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        })
      });

      const data = await response.json();
      expect(data.result).toBeDefined();
      expect(data.result.tools).toBeDefined();
      expect(Array.isArray(data.result.tools)).toBe(true);
      expect(data.result.tools.length).toBeGreaterThan(0);

      const toolNames = data.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('check_credit_balance');
      expect(toolNames).toContain('generate_transaction_bytes');
      expect(toolNames).toContain('execute_transaction');
    });
  });

  describe('Credit Management', () => {
    test('should check credit balance', async () => {
      const response = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });

      expect(response).toBeDefined();
      expect(response.balance).toBeDefined();
      expect(response.balance.current).toBeGreaterThanOrEqual(0);
      expect(response.balance.totalPurchased).toBeGreaterThanOrEqual(0);
      expect(response.balance.totalConsumed).toBeGreaterThanOrEqual(0);
    });

    test('should get credit history', async () => {
      const response = await callServerTool(testEnv.baseUrl, 'get_credit_history', {
        accountId: testAccountId,
        limit: 10,
      });

      expect(response).toBeDefined();
      expect(response.history).toBeDefined();
      expect(Array.isArray(response.history)).toBe(true);
      expect(response.summary).toBeDefined();
    });

    test('should get credit balance for non-existent account', async () => {
      const response = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: '0.0.99999999',
      });

      expect(response).toBeDefined();
      expect(response.balance.current).toBe(0);
      expect(response.balance.totalPurchased).toBe(0);
      expect(response.balance.totalConsumed).toBe(0);
    });
  });

  describe('Transaction Tools', () => {
    test('should consume credits for generate_transaction_bytes', async () => {
      const balanceBefore = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'generate_transaction_bytes', {
        request: 'Send 1 HBAR to 0.0.123456',
        accountId: testAccountId,
      });

      expect(response).toBeDefined();
      
      if (response.error && response.error.includes('OpenAI')) {
        expect(response.status).toBe('failed');
        expect(response.error).toContain('OpenAI API key');
      } else {
        expect(response.operation).toBe('generate_transaction_bytes');
      }

      const balanceAfter = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance - 5);
    });

    test('should consume credits for scheduled transactions', async () => {
      const balanceBefore = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'schedule_transaction', {
        request: 'Schedule a transfer of 1 HBAR to 0.0.123456',
        accountId: testAccountId,
      });

      expect(response).toBeDefined();
      
      if (response.error && response.error.includes('OpenAI')) {
        expect(response.status).toBe('failed');
        expect(response.error).toContain('OpenAI API key');
      } else {
        expect(response.operation).toBe('schedule_transaction');
      }

      const balanceAfter = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance - 10);
    });

    test('should consume credits for transaction execution', async () => {
      const balanceBefore = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'execute_transaction', {
        transactionBytes: 'dummy-transaction-bytes',
        accountId: testAccountId,
      });

      expect(response).toBeDefined();

      const balanceAfter = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance - 15);
    });
  });

  describe('Free Operations', () => {
    test('should not consume credits for health check', async () => {
      const balanceBefore = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'health_check');
      expect(response).toBeDefined();
      expect(response.status).toBe('healthy');

      const balanceAfter = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance);
    });

    test('should not consume credits for server info', async () => {
      const balanceBefore = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const beforeBalance = balanceBefore.balance.current;

      const response = await callServerTool(testEnv.baseUrl, 'get_server_info');
      expect(response).toBeDefined();

      const balanceAfter = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: testAccountId,
      });
      const afterBalance = balanceAfter.balance.current;

      expect(afterBalance).toBe(beforeBalance);
    });
  });

  describe('Insufficient Credits', () => {
    test('should reject operations when insufficient credits', async () => {
      const poorAccountId = '0.0.987654321';

      const balance = await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
        accountId: poorAccountId,
      });
      expect(balance.balance.current).toBe(0);

      const response = await callServerTool(testEnv.baseUrl, 'execute_transaction', {
        transactionBytes: 'dummy-bytes',
        accountId: poorAccountId,
      });

      expect(response).toBeDefined();
      expect(response.error).toContain('Insufficient credits');
    });

    test('should show required credits in error message', async () => {
      const poorAccountId = '0.0.987654322';

      const response = await callServerTool(testEnv.baseUrl, 'schedule_transaction', {
        request: 'Schedule something',
        accountId: poorAccountId,
      });

      expect(response).toBeDefined();
      expect(response.error).toContain('Insufficient credits');
      expect(response.error).toContain('10');
    });
  });

  describe('Payment Processing', () => {
    test('should reject duplicate payments', async () => {
      const duplicateTxId = `${testAccountId}@${Date.now()}.dup`;

      const response1 = await callServerTool(testEnv.baseUrl, 'create_payment_transaction', {
        transactionId: duplicateTxId,
        payerAccountId: testAccountId,
        hbarAmount: 0.5,
        memo: 'Duplicate test',
      });

      const response2 = await callServerTool(testEnv.baseUrl, 'create_payment_transaction', {
        transactionId: duplicateTxId,
        payerAccountId: testAccountId,
        hbarAmount: 0.5,
        memo: 'Duplicate test',
      });

      const results = [response1, response2];
      const successes = results.filter(r => r.success).length;
      const failures = results.filter(r => !r.success).length;

      expect(successes).toBe(1);
      expect(failures).toBe(1);
    });
  });

  describe('Database Operations', () => {
    test('should persist data across manager instances', async () => {
      const config = loadServerConfig();
      const signer = new ServerSigner(
        config.HEDERA_OPERATOR_ID,
        config.HEDERA_OPERATOR_KEY,
        config.HEDERA_NETWORK
      );
      const hederaKit = new HederaAgentKit(signer);
      await hederaKit.initialize();
      
      const creditManager1 = await CreditManagerFactory.create(
        config,
        hederaKit,
        logger
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
        logger
      );
      await creditManager2.initialize();
      
      const balance2 = await creditManager2.getCreditBalance(testAccountId);
      expect(balance2?.balance).toBe(balance1?.balance);
      expect(balance2?.totalPurchased).toBe(balance1?.totalPurchased);
      
      await creditManager2.close?.();
    });
    
    test('should run migrations automatically', async () => {
      const tempDbPath = path.join(os.tmpdir(), `test-migration-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      
      try {
        process.env.DATABASE_URL = `sqlite://${tempDbPath}`;
        const config = loadServerConfig();
        const signer = new ServerSigner(
          config.HEDERA_OPERATOR_ID,
          config.HEDERA_OPERATOR_KEY,
          config.HEDERA_NETWORK
        );
        const hederaKit = new HederaAgentKit(signer);
        await hederaKit.initialize();
        
        const creditManager = await CreditManagerFactory.create(
          config,
          hederaKit,
          logger
        );
        await creditManager.initialize();
        
        expect(fs.existsSync(tempDbPath)).toBe(true);
        
        const costs = await creditManager.getOperationCosts();
        expect(costs.length).toBeGreaterThan(0);
        
        const executeCost = costs.find(c => c.operationName === 'execute_transaction');
        expect(executeCost?.baseCost).toBe(15);
        
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
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
        config.HEDERA_NETWORK
      );
      const hederaKit = new HederaAgentKit(signer);
      await hederaKit.initialize();
      
      const creditManager = await CreditManagerFactory.create(
        config,
        hederaKit,
        logger
      );
      await creditManager.initialize();
      
      const check = await creditManager.checkSufficientCredits(
        testAccountId,
        'invalid_operation'
      );
      expect(check.sufficient).toBe(true);
      expect(check.requiredCredits).toBe(0);
      
      await creditManager.close?.();
    });
  });
});