import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { loadServerConfig } from '../../config/server-config';
import { HederaAgentKit, ServerSigner } from '@hashgraphonline/hedera-agent-kit';
import { Logger } from '@hashgraphonline/standards-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
describe('Database Abstraction Layer Integration', () => {
  let hederaKit: HederaAgentKit;
  let logger: Logger;
  let testAccountId: string;
  beforeAll(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error('Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars');
    }
    testAccountId = process.env.HEDERA_OPERATOR_ID;
    logger = Logger.getInstance({
      level: 'error',
      module: 'DatabaseAbstractionTest',
      prettyPrint: true,
    });
    const signer = new ServerSigner(
      process.env.HEDERA_OPERATOR_ID,
      process.env.HEDERA_OPERATOR_KEY,
      'testnet'
    );
    hederaKit = new HederaAgentKit(signer, {}, 'directExecution');
    await hederaKit.initialize();
  });
  afterAll(async () => {
    if (hederaKit?.client) {
      hederaKit.client.close();
    }
  });
  describe('SQLite Database Implementation', () => {
    let dbPath: string;
    beforeAll(() => {
      dbPath = path.join(os.tmpdir(), `test-sqlite-${Date.now()}.db`);
    });
    afterAll(() => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });
    test('should create SQLite credit manager through factory', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(
          config,
          hederaKit,
          logger
        );
        expect(creditManager).toBeDefined();
        expect(creditManager.constructor.name).toBe('CreditService');
        await creditManager.initialize();
        const balance = await creditManager.getCreditBalance(testAccountId);
        expect(balance).toBeDefined();
        expect(balance?.balance).toBe(0);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
    test('should handle complete HBAR payment flow with SQLite', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(
          config,
          hederaKit,
          logger
        );
        await creditManager.initialize();
        const testTxId = `sqlite-test-${Date.now()}`;
        const paymentResult = await creditManager.processHbarPayment({
          transactionId: testTxId,
          payerAccountId: testAccountId,
          hbarAmount: 2.0,
          creditsAllocated: 2000,
          memo: 'SQLite test payment',
          status: 'COMPLETED',
        });
        expect(paymentResult).toBe(true);
        const balance = await creditManager.getCreditBalance(testAccountId);
        expect(balance?.balance).toBe(2000);
        expect(balance?.totalPurchased).toBe(2000);
        const success = await creditManager.consumeCredits(
          testAccountId,
          'execute_transaction',
          'SQLite test operation'
        );
        expect(success).toBe(true);
        const updatedBalance = await creditManager.getCreditBalance(testAccountId);
        expect(updatedBalance?.balance).toBe(1985);
        expect(updatedBalance?.totalConsumed).toBe(15);
        const history = await creditManager.getCreditHistory(testAccountId);
        expect(history).toHaveLength(2);
        expect(history[0]?.transactionType).toBe('consumption');
        expect(history[1]?.transactionType).toBe('purchase');
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
  });
  describe('PostgreSQL Database Implementation', () => {
    test('should create PostgreSQL credit manager through factory', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(
          config,
          hederaKit,
          logger
        );
        expect(creditManager).toBeDefined();
        expect(creditManager.constructor.name).toBe('CreditService');
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
  });
  describe('In-Memory Fallback Implementation', () => {
    test('should create in-memory credit manager for unsupported URLs', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = 'redis://localhost:6379';
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(
          config,
          hederaKit,
          logger
        );
        expect(creditManager).toBeDefined();
        expect(creditManager.constructor.name).toBe('CreditManager');
        await creditManager.initialize();
        const balance = await creditManager.getCreditBalance(testAccountId);
        expect(balance?.balance).toBe(0);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
  });
  describe('Migration System', () => {
    test('should run migrations automatically on SQLite', async () => {
      const tempDbPath = path.join(os.tmpdir(), `test-migration-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = `sqlite://${tempDbPath}`;
        const config = loadServerConfig();
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
        const healthCost = costs.find(c => c.operationName === 'health_check');
        expect(healthCost?.baseCost).toBe(0);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (fs.existsSync(tempDbPath)) {
          fs.unlinkSync(tempDbPath);
        }
      }
    });
  });
  describe('Business Logic Consistency', () => {
    test('should have consistent behavior across implementations', async () => {
      const sqliteDbPath = path.join(os.tmpdir(), `test-consistency-sqlite-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        const testData = {
          transactionId: `consistency-test-${Date.now()}`,
          payerAccountId: testAccountId,
          hbarAmount: 1.0,
          creditsAllocated: 0,
          memo: 'Consistency test',
          status: 'completed' as const,
        };
        process.env.DATABASE_URL = `sqlite://${sqliteDbPath}`;
        const config1 = loadServerConfig();
        const sqliteManager = await CreditManagerFactory.create(config1, hederaKit, logger);
        await sqliteManager.initialize();
        process.env.DATABASE_URL = 'memory://test';
        const config2 = loadServerConfig();
        const memoryManager = await CreditManagerFactory.create(config2, hederaKit, logger);
        await memoryManager.initialize();
        await sqliteManager.processHbarPayment(testData);
        await memoryManager.processHbarPayment(testData);
        const sqliteBalance = await sqliteManager.getCreditBalance(testAccountId);
        const memoryBalance = await memoryManager.getCreditBalance(testAccountId);
        expect(sqliteBalance?.balance).toBe(memoryBalance?.balance);
        expect(sqliteBalance?.totalPurchased).toBe(memoryBalance?.totalPurchased);
        const sqliteCheck = await sqliteManager.checkSufficientCredits(testAccountId, 'execute_transaction');
        const memoryCheck = await memoryManager.checkSufficientCredits(testAccountId, 'execute_transaction');
        expect(sqliteCheck.sufficient).toBe(memoryCheck.sufficient);
        expect(sqliteCheck.requiredCredits).toBe(memoryCheck.requiredCredits);
        await sqliteManager.close?.();
        await memoryManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (fs.existsSync(sqliteDbPath)) {
          fs.unlinkSync(sqliteDbPath);
        }
      }
    });
  });
  describe('Error Handling and Edge Cases', () => {
    test('should handle duplicate payments consistently', async () => {
      const dbPath = path.join(os.tmpdir(), `test-duplicates-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(config, hederaKit, logger);
        await creditManager.initialize();
        const testTxId = `duplicate-test-${Date.now()}`;
        const result1 = await creditManager.processHbarPayment({
          transactionId: testTxId,
          payerAccountId: testAccountId,
          hbarAmount: 0.5,
          creditsAllocated: 0,
          memo: 'Duplicate test',
          status: 'completed',
        });
        const result2 = await creditManager.processHbarPayment({
          transactionId: testTxId,
          payerAccountId: testAccountId,
          hbarAmount: 0.5,
          creditsAllocated: 0,
          memo: 'Duplicate test',
          status: 'completed',
        });
        expect(result1).toBe(true);
        expect(result2).toBe(false);
        const balance = await creditManager.getCreditBalance(testAccountId);
        expect(balance?.balance).toBe(500);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      }
    });
    test('should handle insufficient credits gracefully', async () => {
      const dbPath = path.join(os.tmpdir(), `test-insufficient-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(config, hederaKit, logger);
        await creditManager.initialize();
        const poorAccountId = '0.0.999999';
        const check = await creditManager.checkSufficientCredits(poorAccountId, 'execute_transaction');
        expect(check.sufficient).toBe(false);
        expect(check.shortfall).toBe(15);
        const success = await creditManager.consumeCredits(poorAccountId, 'execute_transaction');
        expect(success).toBe(false);
        const balance = await creditManager.getCreditBalance(poorAccountId);
        expect(balance?.balance).toBe(0);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      }
    });
  });
});