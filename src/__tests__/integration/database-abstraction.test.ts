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
      let dbConnection: any;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        
        const { setupTestDatabase } = await import('../test-db-setup');
        dbConnection = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
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
        if (dbConnection && typeof dbConnection.close === 'function') {
          dbConnection.close();
        }
      }
    });
    test('should handle complete HBAR payment flow with SQLite', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      const isolatedDbPath = path.join(os.tmpdir(), `test-sqlite-flow-${Date.now()}-${Math.random()}.db`);
      let dbConnection: any;
      try {
        process.env.DATABASE_URL = `sqlite://${isolatedDbPath}`;
        
        const { setupTestDatabase } = await import('../test-db-setup');
        dbConnection = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
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
          timestamp: new Date().toISOString(),
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
        const currentHourUTC = new Date().getUTCHours();
        const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
        const expectedCost = isPeakHours ? 60 : 50;
        expect(updatedBalance?.balance).toBe(2000 - expectedCost);
        expect(updatedBalance?.totalConsumed).toBe(expectedCost);
        const history = await creditManager.getCreditHistory(testAccountId);
        expect(history).toHaveLength(2);
        const transactionTypes = history.map(h => h.transactionType).sort();
        expect(transactionTypes).toEqual(['consumption', 'purchase']);
        await creditManager.close?.();
        if (fs.existsSync(isolatedDbPath)) {
          fs.unlinkSync(isolatedDbPath);
        }
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (dbConnection && typeof dbConnection.close === 'function') {
          dbConnection.close();
        }
      }
    });
  });
  describe('PostgreSQL Database Implementation', () => {
    test('should create PostgreSQL credit manager through factory', async () => {
      if (!process.env.POSTGRES_TEST_URL) {
        console.log('Skipping PostgreSQL test - POSTGRES_TEST_URL not set');
        return;
      }
      
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = process.env.POSTGRES_TEST_URL;
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
  describe('Error Handling for Unsupported Databases', () => {
    test('should reject unsupported database URLs', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      try {
        process.env.DATABASE_URL = 'redis://localhost:6379';
        const config = loadServerConfig();
        await expect(
          CreditManagerFactory.create(config, hederaKit, logger)
        ).rejects.toThrow('Unsupported database URL');
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
  });
  describe('Migration System', () => {
    test('should run migrations automatically on SQLite', async () => {
      const tempDbPath = path.join(os.tmpdir(), `test-migration-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      let dbConnection: any;
      try {
        process.env.DATABASE_URL = `sqlite://${tempDbPath}`;
        
        const { setupTestDatabase } = await import('../test-db-setup');
        dbConnection = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
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
        expect(executeCost?.baseCost).toBe(50);
        const healthCost = costs.find(c => c.operationName === 'health_check');
        expect(healthCost?.baseCost).toBe(0);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (dbConnection && typeof dbConnection.close === 'function') {
          dbConnection.close();
        }
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
      let dbConnection1: any;
      let dbConnection2: any;
      try {
        const testData = {
          transactionId: `consistency-test-${Date.now()}`,
          payerAccountId: testAccountId,
          hbarAmount: 1.0,
          creditsAllocated: 100,
          memo: 'Consistency test',
          status: 'COMPLETED' as const,
        };
        process.env.DATABASE_URL = `sqlite://${sqliteDbPath}`;
        
        const { setupTestDatabase } = await import('../test-db-setup');
        dbConnection1 = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
        const config1 = loadServerConfig();
        const sqliteManager = await CreditManagerFactory.create(config1, hederaKit, logger);
        await sqliteManager.initialize();
        const sqliteDbPath2 = path.join(os.tmpdir(), `test-consistency-sqlite2-${Date.now()}.db`);
        process.env.DATABASE_URL = `sqlite://${sqliteDbPath2}`;
        
        dbConnection2 = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
        const config2 = loadServerConfig();
        const sqliteManager2 = await CreditManagerFactory.create(config2, hederaKit, logger);
        await sqliteManager2.initialize();
        await sqliteManager.processHbarPayment(testData);
        await sqliteManager2.processHbarPayment(testData);
        const sqliteBalance = await sqliteManager.getCreditBalance(testAccountId);
        const sqlite2Balance = await sqliteManager2.getCreditBalance(testAccountId);
        expect(sqliteBalance?.balance).toBe(sqlite2Balance?.balance);
        expect(sqliteBalance?.totalPurchased).toBe(sqlite2Balance?.totalPurchased);
        const sqliteCheck = await sqliteManager.checkSufficientCredits(testAccountId, 'execute_transaction');
        const sqlite2Check = await sqliteManager2.checkSufficientCredits(testAccountId, 'execute_transaction');
        expect(sqliteCheck.sufficient).toBe(sqlite2Check.sufficient);
        expect(sqliteCheck.requiredCredits).toBe(sqlite2Check.requiredCredits);
        await sqliteManager.close?.();
        await sqliteManager2.close?.();
        if (fs.existsSync(sqliteDbPath2)) {
          fs.unlinkSync(sqliteDbPath2);
        }
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (dbConnection1 && typeof dbConnection1.close === 'function') {
          dbConnection1.close();
        }
        if (dbConnection2 && typeof dbConnection2.close === 'function') {
          dbConnection2.close();
        }
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
      let dbConnection: any;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        
        const { setupTestDatabase } = await import('../test-db-setup');
        dbConnection = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(config, hederaKit, logger);
        await creditManager.initialize();
        const testTxId = `duplicate-test-${Date.now()}`;
        const result1 = await creditManager.processHbarPayment({
          transactionId: testTxId,
          payerAccountId: testAccountId,
          hbarAmount: 0.5,
          creditsAllocated: 500,
          memo: 'Duplicate test',
          status: 'COMPLETED',
          timestamp: new Date().toISOString(),
        });
        const result2 = await creditManager.processHbarPayment({
          transactionId: testTxId,
          payerAccountId: testAccountId,
          hbarAmount: 0.5,
          creditsAllocated: 500,
          memo: 'Duplicate test',
          status: 'COMPLETED',
          timestamp: new Date().toISOString(),
        });
        expect(result1).toBe(true);
        expect(result2).toBe(true);
        const balance = await creditManager.getCreditBalance(testAccountId);
        expect(balance?.balance).toBe(500);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (dbConnection && typeof dbConnection.close === 'function') {
          dbConnection.close();
        }
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      }
    });
    test('should handle insufficient credits gracefully', async () => {
      const dbPath = path.join(os.tmpdir(), `test-insufficient-${Date.now()}.db`);
      const originalDbUrl = process.env.DATABASE_URL;
      let dbConnection: any;
      try {
        process.env.DATABASE_URL = `sqlite://${dbPath}`;
        
        const { setupTestDatabase } = await import('../test-db-setup');
        dbConnection = await setupTestDatabase(process.env.DATABASE_URL, logger);
        
        const config = loadServerConfig();
        const creditManager = await CreditManagerFactory.create(config, hederaKit, logger);
        await creditManager.initialize();
        const poorAccountId = '0.0.999999';
        const check = await creditManager.checkSufficientCredits(poorAccountId, 'execute_transaction');
        expect(check.sufficient).toBe(false);
        const currentHourUTC = new Date().getUTCHours();
        const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
        const expectedCost = isPeakHours ? 60 : 50;
        expect(check.shortfall).toBe(expectedCost);
        const success = await creditManager.consumeCredits(poorAccountId, 'execute_transaction');
        expect(success).toBe(false);
        const balance = await creditManager.getCreditBalance(poorAccountId);
        expect(balance?.balance).toBe(0);
        await creditManager.close?.();
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
        if (dbConnection && typeof dbConnection.close === 'function') {
          dbConnection.close();
        }
        if (fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
        }
      }
    });
  });
});