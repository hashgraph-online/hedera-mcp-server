/**
 * Credit System End-to-End Integration Test
 * Tests the complete payment flow using PaymentTools like the working crash test
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { Logger } from '@hashgraphonline/standards-sdk';
import {
  HederaAgentKit,
  ServerSigner,
} from '@hashgraphonline/hedera-agent-kit';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { PaymentTools } from '../../tools/payment-tools';
import { Client, PrivateKey, Transaction } from '@hashgraph/sdk';
import { loadServerConfig } from '../../config/server-config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { setupTestDatabase } from '../test-db-setup';
import { setupMirrorNodeMocks, TEST_HBAR_TO_USD_RATE, calculateTestCredits } from '../test-utils/mock-mirror-node';

describe('Credit System E2E Integration', () => {
  let creditManager: any;
  let paymentTools: PaymentTools;
  let hederaKit: HederaAgentKit;
  let testConfig: any;
  let logger: Logger;
  let client: Client;
  let testClient: Client;
  let testDbPath: string;
  let testAccountId: string;

  beforeAll(() => {
    setupMirrorNodeMocks();
  });

  beforeEach(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error(
        'Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars'
      );
    }

    logger = Logger.getInstance({ module: 'CreditE2ETest', level: 'error' });
    logger.info('Initializing Credit System E2E Test...');

    testAccountId = process.env.HEDERA_OPERATOR_ID;

    testDbPath = path.join(
      process.cwd(),
      `test-credits-e2e-${Date.now()}-${Math.random()}.db`
    );
    const dbUrl = `sqlite://${testDbPath}`;
    process.env.DATABASE_URL = dbUrl;
    process.env.LOG_LEVEL = 'error';

    if (!process.env.SERVER_ACCOUNT_ID) {
      process.env.SERVER_ACCOUNT_ID = process.env.HEDERA_OPERATOR_ID;
    }
    if (!process.env.SERVER_PRIVATE_KEY) {
      process.env.SERVER_PRIVATE_KEY = process.env.HEDERA_OPERATOR_KEY;
    }

    testConfig = loadServerConfig();

    try {
      await setupTestDatabase(dbUrl, logger);

      const signer = new ServerSigner(
        testConfig.HEDERA_OPERATOR_ID,
        testConfig.HEDERA_OPERATOR_KEY,
        testConfig.HEDERA_NETWORK
      );
      hederaKit = new HederaAgentKit(signer, {}, 'directExecution');
      await hederaKit.initialize();

      creditManager = await CreditManagerFactory.create(
        testConfig,
        hederaKit,
        logger
      );
      await creditManager.initialize();

      paymentTools = new PaymentTools(
        testConfig.SERVER_ACCOUNT_ID || testConfig.HEDERA_OPERATOR_ID,
        testConfig.HEDERA_NETWORK,
        creditManager,
        logger
      );

      client = Client.forTestnet();
      client.setOperator(
        testAccountId,
        testConfig.HEDERA_OPERATOR_KEY
      );

      testClient = Client.forTestnet();
      testClient.setOperator(
        testAccountId,
        testConfig.HEDERA_OPERATOR_KEY
      );

      logger.info('Test configuration', {
        testAccountId,
        operatorId: testConfig.HEDERA_OPERATOR_ID,
        serverAccountId:
          testConfig.SERVER_ACCOUNT_ID || testConfig.HEDERA_OPERATOR_ID,
        network: testConfig.HEDERA_NETWORK,
      });

    } catch (error) {
      logger.error('Failed to initialize credit system', { error });
      throw error;
    }
  });

  afterEach(async () => {
    try {
      await creditManager?.close();
      if (hederaKit?.client) {
        hederaKit.client.close();
      }
      client?.close();
      testClient?.close();

      try {
        await fs.unlink(testDbPath);
      } catch (error) {
      }
    } catch (error) {
      logger.error('Cleanup error', { error });
    }
  });

  describe('Payment Flow using PaymentTools (what MCP server uses internally)', () => {
    it('should create payment transaction and return transaction bytes', async () => {
      const paymentRequest = {
        payerAccountId: testAccountId,
        amount: 0.1,
        memo: 'Credit purchase test',
      };

      const result =
        await paymentTools.createPaymentTransaction(paymentRequest);

      expect(result.transactionBytes).toBeDefined();
      expect(result.transactionId).toBeDefined();
      const expectedCredits = calculateTestCredits(0.1);
      expect(result.expectedCredits).toBe(expectedCredits);
      expect(result.amount).toBe(0.1);
    });

    it('should process complete payment flow like admin portal: create → execute → verify', async () => {
      const paymentAmount = 0.2;

      const paymentRequest = {
        payerAccountId: testAccountId,
        amount: paymentAmount,
        memo: 'E2E payment test',
      };

      const paymentResult =
        await paymentTools.createPaymentTransaction(paymentRequest);

      const transactionBytes = Buffer.from(
        paymentResult.transactionBytes,
        'base64'
      );
      const transaction = Transaction.fromBytes(transactionBytes);

      const response = await transaction.execute(client);
      const receipt = await response.getReceipt(client);

      expect(receipt.status.toString()).toBe('SUCCESS');

      await new Promise((resolve) => setTimeout(resolve, 15000));

      const verifyResult = await paymentTools.verifyAndProcessPayment(
        paymentResult.transactionId
      );
      expect(verifyResult).toBe(true);

      const balance = await creditManager.getCreditBalance(testAccountId);
      expect(balance.totalPurchased).toBe(20);
    });

    it('should handle payment status tracking', async () => {
      const paymentAmount = 0.15;

      const paymentRequest = {
        payerAccountId: testAccountId,
        amount: paymentAmount,
        memo: 'Status tracking test',
      };

      const paymentResult =
        await paymentTools.createPaymentTransaction(paymentRequest);

      const initialStatus = await paymentTools.getPaymentStatus(
        paymentResult.transactionId
      );
      expect(initialStatus.status).toBe('pending');

      const transactionBytes = Buffer.from(
        paymentResult.transactionBytes,
        'base64'
      );
      const transaction = Transaction.fromBytes(transactionBytes);

      const response = await transaction.execute(client);
      await response.getReceipt(client);
      await new Promise((resolve) => setTimeout(resolve, 15000));

      await paymentTools.verifyAndProcessPayment(paymentResult.transactionId);

      const finalStatus = await paymentTools.getPaymentStatus(
        paymentResult.transactionId
      );
      expect(finalStatus.status).toBe('completed');
      expect(finalStatus.credits).toBe(15);
    });
  });

  describe('Credit System Functionality', () => {
    it('should check and consume credits for operations', async () => {
      const currentHourUTC = new Date().getUTCHours();
      const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
      const expectedCost = isPeakHours ? 18 : 15;

      await creditManager.processHbarPayment({
        transactionId: `${testAccountId}@${Date.now()}.consume-test-setup`,
        payerAccountId: testAccountId,
        hbarAmount: 1.0,
        creditsAllocated: 100,
        memo: 'Consume test setup',
        status: 'COMPLETED',
      });

      const balanceBefore = await creditManager.getCreditBalance(testAccountId);

      const check = await creditManager.checkSufficientCredits(
        testAccountId,
        'execute_transaction'
      );
      expect(check.sufficient).toBe(true);
      expect(check.requiredCredits).toBe(expectedCost);

      const success = await creditManager.consumeCredits(
        testAccountId,
        'execute_transaction',
        'Test transaction execution'
      );
      expect(success).toBe(true);

      const balanceAfter = await creditManager.getCreditBalance(testAccountId);
      expect(balanceAfter.balance).toBe(balanceBefore.balance - expectedCost);
      expect(balanceAfter.totalConsumed).toBe(expectedCost);
    });

    it('should handle insufficient credits gracefully', async () => {
      const poorAccountId = '0.0.99999999';

      const check = await creditManager.checkSufficientCredits(
        poorAccountId,
        'execute_transaction'
      );
      expect(check.sufficient).toBe(false);
      expect(check.shortfall).toBeGreaterThan(0);

      const success = await creditManager.consumeCredits(
        poorAccountId,
        'execute_transaction',
        'Should fail'
      );
      expect(success).toBe(false);
    });

    it('should allow free operations without credit deduction', async () => {
      await creditManager.processHbarPayment({
        transactionId: `${testAccountId}@${Date.now()}.free-test-setup`,
        payerAccountId: testAccountId,
        hbarAmount: 0.5,
        creditsAllocated: 50,
        memo: 'Free test setup',
        status: 'COMPLETED',
      });

      const balanceBefore = await creditManager.getCreditBalance(testAccountId);

      const success = await creditManager.consumeCredits(
        testAccountId,
        'health_check',
        'Free health check'
      );
      expect(success).toBe(true);

      const balanceAfter = await creditManager.getCreditBalance(testAccountId);
      expect(balanceAfter.balance).toBe(balanceBefore.balance);
    });

    it('should calculate operation costs correctly', async () => {
      const costs = await creditManager.getOperationCosts();

      const executeCost = costs.find(
        (c: any) => c.operationName === 'execute_transaction'
      );
      const scheduleCost = costs.find(
        (c: any) => c.operationName === 'schedule_transaction'
      );
      const bytesCost = costs.find(
        (c: any) => c.operationName === 'generate_transaction_bytes'
      );
      const healthCost = costs.find(
        (c: any) => c.operationName === 'health_check'
      );

      expect(executeCost?.baseCost).toBe(15);
      expect(scheduleCost?.baseCost).toBe(10);
      expect(bytesCost?.baseCost).toBe(5);
      expect(healthCost?.baseCost).toBe(0);
    });

    it('should track credit history correctly', async () => {
      await creditManager.processHbarPayment({
        transactionId: `${testAccountId}@${Date.now()}.history-test-setup`,
        payerAccountId: testAccountId,
        hbarAmount: 1.0,
        creditsAllocated: 100,
        memo: 'History test setup',
        status: 'COMPLETED',
      });

      const historyBefore = await creditManager.getCreditHistory(testAccountId);
      const initialCount = historyBefore.length;

      await creditManager.consumeCredits(
        testAccountId,
        'generate_transaction_bytes',
        'History Test 1 - Generate Bytes'
      );
      await creditManager.consumeCredits(
        testAccountId,
        'schedule_transaction',
        'History Test 2 - Schedule Transaction'
      );

      const historyAfter = await creditManager.getCreditHistory(testAccountId);

      expect(historyAfter.length).toBe(initialCount + 2);

      const generateBytesTransaction = historyAfter.find(
        (tx) => tx.description === 'History Test 1 - Generate Bytes'
      );
      const scheduleTransaction = historyAfter.find(
        (tx) => tx.description === 'History Test 2 - Schedule Transaction'
      );

      const currentHourUTC = new Date().getUTCHours();
      const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
      const expectedBytesCost = isPeakHours ? 6 : 5;
      const expectedScheduleCost = isPeakHours ? 12 : 10;

      expect(generateBytesTransaction).toBeDefined();
      expect(generateBytesTransaction.transactionType).toBe('consumption');
      expect(generateBytesTransaction.amount).toBe(expectedBytesCost);
      expect(generateBytesTransaction.relatedOperation).toBe(
        'generate_transaction_bytes'
      );

      expect(scheduleTransaction).toBeDefined();
      expect(scheduleTransaction.transactionType).toBe('consumption');
      expect(scheduleTransaction.amount).toBe(expectedScheduleCost);
      expect(scheduleTransaction.relatedOperation).toBe('schedule_transaction');
    });

    it('should persist data across manager instances', async () => {
      const balanceBefore = await creditManager.getCreditBalance(testAccountId);

      await creditManager.close();

      const newCreditManager = await CreditManagerFactory.create(
        testConfig,
        hederaKit,
        logger
      );
      await newCreditManager.initialize();

      const balanceAfter =
        await newCreditManager.getCreditBalance(testAccountId);

      expect(balanceAfter?.balance).toBe(balanceBefore?.balance);
      expect(balanceAfter?.totalPurchased).toBe(balanceBefore?.totalPurchased);
      expect(balanceAfter?.totalConsumed).toBe(balanceBefore?.totalConsumed);

      creditManager = newCreditManager;
    });
  });

  describe('Advanced Payment Scenarios', () => {
    it('should handle duplicate payment processing', async () => {
      const paymentRequest = {
        payerAccountId: testAccountId,
        amount: 0.05,
        memo: 'Duplicate test',
      };

      const paymentResult =
        await paymentTools.createPaymentTransaction(paymentRequest);

      const transactionBytes = Buffer.from(
        paymentResult.transactionBytes,
        'base64'
      );
      const transaction = Transaction.fromBytes(transactionBytes);

      const response = await transaction.execute(client);
      await response.getReceipt(client);
      await new Promise((resolve) => setTimeout(resolve, 15000));

      const result1 = await paymentTools.verifyAndProcessPayment(
        paymentResult.transactionId
      );
      expect(result1).toBe(true);

      const result2 = await paymentTools.verifyAndProcessPayment(
        paymentResult.transactionId
      );
      expect(result2).toBe(false);
    });

    it('should handle multiple concurrent payments', async () => {
      const paymentPromises = Array(2)
        .fill(null)
        .map(async (_, i) => {
          const paymentResult = await paymentTools.createPaymentTransaction({
            payerAccountId: testAccountId,
            amount: 0.1,
            memo: `Concurrent payment ${i}`,
          });

          const transactionBytes = Buffer.from(
            paymentResult.transactionBytes,
            'base64'
          );
          const transaction = Transaction.fromBytes(transactionBytes);

          const response = await transaction.execute(client);
          await response.getReceipt(client);

          return paymentResult.transactionId;
        });

      const transactionIds = await Promise.all(paymentPromises);

      await new Promise((resolve) => setTimeout(resolve, 15000));

      const verifyPromises = transactionIds.map((txId) =>
        paymentTools.verifyAndProcessPayment(txId)
      );

      const results = await Promise.all(verifyPromises);

      results.forEach((result) => expect(result).toBe(true));

      const finalBalance = await creditManager.getCreditBalance(testAccountId);
      expect(finalBalance.totalPurchased).toBe(20);
    });

    it('should handle invalid operation names', async () => {
      const check = await creditManager.checkSufficientCredits(
        testAccountId,
        'invalid_operation_name'
      );
      expect(check.sufficient).toBe(true);
      expect(check.requiredCredits).toBe(0);

      const success = await creditManager.consumeCredits(
        testAccountId,
        'invalid_operation_name',
        'Invalid operation test'
      );
      expect(success).toBe(true);
    });

    it('should handle concurrent operations safely', async () => {
      await creditManager.processHbarPayment({
        transactionId: `${testAccountId}@${Date.now()}.concurrent-test-setup`,
        payerAccountId: testAccountId,
        hbarAmount: 1.0,
        creditsAllocated: 100,
        memo: 'Concurrent test setup',
        status: 'COMPLETED',
      });

      const operations = Array(5)
        .fill(null)
        .map((_, i) =>
          creditManager.consumeCredits(
            testAccountId,
            'generate_transaction_bytes',
            `Concurrent operation ${i}`
          )
        );

      const results = await Promise.all(operations);

      results.forEach((result) => expect(result).toBe(true));

      const history = await creditManager.getCreditHistory(testAccountId);
      const recentConsumptions = history
        .filter((tx: any) => tx.description?.includes('Concurrent operation'))
        .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);

      const currentHourUTC = new Date().getUTCHours();
      const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
      const expectedConsumption = isPeakHours ? 30 : 25;
      expect(recentConsumptions).toBe(expectedConsumption);
    });

    it('should validate payment amounts', async () => {
      try {
        await paymentTools.createPaymentTransaction({
          payerAccountId: testAccountId,
          amount: 0.0001,
          memo: 'Very small amount',
        });
      } catch (error) {
        expect(error).toBeDefined();
      }

      try {
        const result = await paymentTools.createPaymentTransaction({
          payerAccountId: testAccountId,
          amount: 10001,
          memo: 'Very large amount',
        });

        expect(result.transactionBytes).toBeDefined();
      } catch (error) {
        expect(error.message).toContain('HBAR');
      }
    });

    it('should handle payment verification edge cases', async () => {
      try {
        const result =
          await paymentTools.verifyAndProcessPayment('invalid-tx-id');
        expect(result).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }

      try {
        const result =
          await paymentTools.verifyAndProcessPayment('0.0.123@malformed');
        expect(result).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
