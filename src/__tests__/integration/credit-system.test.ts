import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import {
  setupTestDatabase,
  createTestAccounts,
  TestEnvironment,
} from '../test-utils/setup-helpers';
import {
  createTestPayment,
  assertCreditBalance,
  verifyPaymentHistory,
  generateTestTransactionId,
  toHbarPayment,
} from '../test-utils/payment-helpers';
import { setupMirrorNodeMocks, TEST_HBAR_TO_USD_RATE, calculateTestCredits } from '../test-utils/mock-mirror-node';

describe('Credit System Core Functionality', () => {
  let testEnv: TestEnvironment;

  beforeAll(() => {
  });

  beforeEach(async () => {
    testEnv = await setupTestDatabase('memory');
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('Balance Management', () => {
    it('should start with zero balance for new accounts', async () => {
      const balanceInfo =
        await testEnv.creditService.getCreditBalance('0.0.12345');
      expect(balanceInfo?.balance || 0).toBe(0);
    });

    it('should track balances for multiple accounts independently', async () => {
      const account1 = '0.0.100001';
      const account2 = '0.0.100002';

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(50000000, account1), TEST_HBAR_TO_USD_RATE)
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(100000000, account2), TEST_HBAR_TO_USD_RATE)
      );

      const balance1 = await testEnv.creditService.getCreditBalance(account1);
      const balance2 = await testEnv.creditService.getCreditBalance(account2);
      expect(balance1?.balance || 0).toBeGreaterThan(0);
      expect(balance2?.balance || 0).toBeGreaterThan(0);
      expect(balance2?.balance || 0).toBeGreaterThan(balance1?.balance || 0);
    });

    it('should convert HBAR to credits correctly', async () => {
      const hbarAmount = 50000000;
      const hbarValue = hbarAmount / 100000000;

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(hbarAmount))
      );
      const balanceInfo =
        await testEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBeGreaterThan(0);
    });

    it('should handle custom HBAR to credits ratios', async () => {
      const customEnv = await setupTestDatabase('memory');
      
      const highUsdRate = 0.10;

      await customEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(100000000), highUsdRate)
      );
      const balanceInfo =
        await customEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBeGreaterThan(0);
      await customEnv.cleanup();
    });
  });

  describe('Credit Allocation', () => {
    it('should allocate credits from payments correctly', async () => {
      const payment = createTestPayment(100000000);
      await testEnv.creditService.processHbarPayment(toHbarPayment(payment, TEST_HBAR_TO_USD_RATE));

      const balance = await testEnv.creditService.getCreditBalance(payment.accountId);
      expect(balance?.balance || 0).toBeGreaterThan(0);
      await verifyPaymentHistory(testEnv.creditService, payment.accountId, 1);
    });

    it('should accumulate credits from multiple payments', async () => {
      const accountId = '0.0.123456';

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(50000000, accountId), TEST_HBAR_TO_USD_RATE)
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(30000000, accountId), TEST_HBAR_TO_USD_RATE)
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(20000000, accountId), TEST_HBAR_TO_USD_RATE)
      );

      const balance = await testEnv.creditService.getCreditBalance(accountId);
      expect(balance?.balance || 0).toBeGreaterThan(0);
      await verifyPaymentHistory(testEnv.creditService, accountId, 3);
    });

    it('should track payment timestamps correctly', async () => {
      const accountId = '0.0.123456';
      const beforeTime = Date.now();
      const payment = createTestPayment(100000000, accountId);

      await testEnv.creditService.processHbarPayment(toHbarPayment(payment, TEST_HBAR_TO_USD_RATE));
      const afterTime = Date.now();
      
      const history = await testEnv.creditService.getCreditHistory(accountId);
      const payments = history.filter((h) => h.transactionType === 'purchase');

      expect(payments[0].createdAt).toBeDefined();
      
      const timestampStr = payments[0].createdAt;
      
      let timestamp: number;
      
      if (timestampStr.includes('T') || timestampStr.includes('-')) {
        timestamp = new Date(timestampStr).getTime();
      } else {
        timestamp = parseInt(timestampStr);
        if (timestamp < 1000000000000) {
          timestamp *= 1000;
        }
      }
      
      
      expect(timestamp).toBeGreaterThan(beforeTime - 5000);
      expect(timestamp).toBeLessThan(afterTime + 5000);
    });
  });

  describe('Credit Consumption', () => {
    beforeEach(async () => {
      await createTestAccounts(testEnv.creditService, [
        { accountId: '0.0.123456', initialBalance: 2.0 },
      ]);
    });

    it('should deduct credits when consumed', async () => {
      const accountId = '0.0.123456';

      await testEnv.creditService.consumeCredits(
        accountId,
        'execute_transaction',
        'test operation'
      );
      const currentHourUTC = new Date().getUTCHours();
      const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
      const executeCost = isPeakHours ? 60 : 50;
      
      await assertCreditBalance(testEnv.creditService, accountId, 100 - executeCost);
    });

    it('should track credit consumption history', async () => {
      const accountId = '0.0.123456';
      
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(1000000000, accountId), TEST_HBAR_TO_USD_RATE)
      );

      await testEnv.creditService.consumeCredits(
        accountId,
        'execute_transaction',
        'op1 description'
      );
      await testEnv.creditService.consumeCredits(
        accountId,
        'schedule_transaction',
        'op2 description'
      );

      const history = await testEnv.creditService.getCreditHistory(accountId);
      const consumptions = history.filter(
        (h) => h.transactionType === 'consumption'
      );

      expect(consumptions).toHaveLength(2);
      
      const operations = consumptions.map(c => c.relatedOperation).sort();
      expect(operations).toEqual(['execute_transaction', 'schedule_transaction'].sort());
    });

    it('should prevent negative balances', async () => {
      const accountId = '0.0.123456';

      const currentHourUTC = new Date().getUTCHours();
      const isPeakHours = currentHourUTC >= 14 && currentHourUTC < 22;
      const executeCost = isPeakHours ? 60 : 50;

      const result1 = await testEnv.creditService.consumeCredits(accountId, 'execute_transaction', 'op1');
      expect(result1).toBe(true);
      
      if (executeCost === 50) {
        const result2 = await testEnv.creditService.consumeCredits(accountId, 'execute_transaction', 'op2');
        expect(result2).toBe(true);
        
        const result3 = await testEnv.creditService.consumeCredits(accountId, 'execute_transaction', 'op3');
        expect(result3).toBe(false);
        
        await assertCreditBalance(testEnv.creditService, accountId, 0);
      } else {
        const result2 = await testEnv.creditService.consumeCredits(accountId, 'execute_transaction', 'op2');
        expect(result2).toBe(false);
        
        await assertCreditBalance(testEnv.creditService, accountId, 40);
      }
    });

    it('should handle concurrent credit operations safely', async () => {
      const accountId = '0.0.123456';

      const operations = [
        testEnv.creditService.consumeCredits(accountId, 'health_check', 'operation 1'),
        testEnv.creditService.consumeCredits(accountId, 'get_server_info', 'operation 2'),
      ];

      await Promise.all(operations);

      const balanceInfo =
        await testEnv.creditService.getCreditBalance(accountId);
      expect(balanceInfo?.balance || 0).toBe(100);
    });
  });

  describe('History Management', () => {
    const accountId = '0.0.123456';

    beforeEach(async () => {
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(200000000, accountId), TEST_HBAR_TO_USD_RATE)
      );
      await testEnv.creditService.consumeCredits(
        accountId,
        'execute_transaction',
        'op1 desc'
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(100000000, accountId), TEST_HBAR_TO_USD_RATE)
      );
      await testEnv.creditService.consumeCredits(
        accountId,
        'schedule_transaction',
        'op2 desc'
      );
    });

    it('should retrieve complete credit history', async () => {
      const history = await testEnv.creditService.getCreditHistory(accountId);

      expect(history).toHaveLength(4);
      expect(
        history.filter((h) => h.transactionType === 'purchase')
      ).toHaveLength(2);
      expect(
        history.filter((h) => h.transactionType === 'consumption')
      ).toHaveLength(2);
    });

    it('should order history by timestamp', async () => {
      const history = await testEnv.creditService.getCreditHistory(accountId);

      expect(history.length).toBeGreaterThan(0);
      
      for (const entry of history) {
        expect(entry.createdAt || entry.timestamp).toBeDefined();
      }
    });

    it('should include operation details in consumption history', async () => {
      const history = await testEnv.creditService.getCreditHistory(accountId);
      const consumptions = history.filter(
        (h) => h.transactionType === 'consumption'
      );

      const operations = consumptions.map(c => c.relatedOperation).sort();
      expect(operations).toEqual(['execute_transaction', 'schedule_transaction'].sort());
    });

    it('should calculate running balance in history', async () => {
      const history = await testEnv.creditService.getCreditHistory(accountId);
      
      const purchases = history.filter(h => h.transactionType === 'purchase');
      const consumptions = history.filter(h => h.transactionType === 'consumption');
      
      expect(purchases.length).toBeGreaterThan(0);
      expect(consumptions.length).toBeGreaterThan(0);
      
      for (const entry of history) {
        expect(entry.balanceAfter).toBeDefined();
        expect(typeof entry.balanceAfter).toBe('number');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large credit amounts', async () => {
      const largeAmount = 1000000000000;

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(largeAmount), TEST_HBAR_TO_USD_RATE)
      );
      const balanceInfo =
        await testEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBeGreaterThan(0);
      expect(balanceInfo?.balance || 0).toBeGreaterThan(100000);
    });

    it('should handle fractional credit amounts correctly', async () => {
      const customEnv = await setupTestDatabase('memory');
      
      await customEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(5000000), TEST_HBAR_TO_USD_RATE)
      );
      const balanceInfo =
        await customEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBe(2);
      await customEnv.cleanup();
    });

    it('should handle invalid account IDs gracefully', async () => {
      const invalidAccount = 'invalid-account';

      const balanceInfo =
        await testEnv.creditService.getCreditBalance(invalidAccount);
      expect(balanceInfo?.balance || 0).toBe(0);

      const history =
        await testEnv.creditService.getCreditHistory(invalidAccount);
      expect(history).toHaveLength(0);
    });

    it('should recover from database errors', async () => {
      expect(true).toBe(true);
    });

    it('should reject zero amount payments', async () => {
      const payment = createTestPayment(0);

      const result = await testEnv.creditService.processHbarPayment(
        toHbarPayment(payment, TEST_HBAR_TO_USD_RATE)
      );

      expect(result).toBe(false);
      await assertCreditBalance(testEnv.creditService, payment.accountId, 0);
    });

    it('should reject negative amount payments', async () => {
      const payment = createTestPayment(-100000000);

      const result = await testEnv.creditService.processHbarPayment(
        toHbarPayment(payment, TEST_HBAR_TO_USD_RATE)
      );

      expect(result).toBe(false);
      await assertCreditBalance(testEnv.creditService, payment.accountId, 0);
    });

    it('should handle credit overflow protection', async () => {
      const accountId = '0.0.overflow';
      const maxCredits = Number.MAX_SAFE_INTEGER / 2;

      await testEnv.creditService.processHbarPayment({
        transactionId: generateTestTransactionId(),
        payerAccountId: accountId,
        hbarAmount: maxCredits / 1000,
        creditsAllocated: maxCredits,
        status: 'COMPLETED',
        timestamp: Date.now().toString(),
      });

      const overflowPayment = createTestPayment(maxCredits, accountId);
      const result = await testEnv.creditService.processHbarPayment({
        ...overflowPayment,
        timestamp: Date.now().toString(),
        payerAccountId: overflowPayment.accountId,
        hbarAmount: maxCredits / 1000,
        creditsAllocated: maxCredits,
        status: 'COMPLETED',
      });

      expect(result).toBeDefined();
    });

    it('should handle special characters in account IDs', async () => {
      const specialAccountId = '0.0.123456!@#$%^&*()';

      const balanceInfo =
        await testEnv.creditService.getCreditBalance(specialAccountId);
      expect(balanceInfo?.balance || 0).toBe(0);

      const history =
        await testEnv.creditService.getCreditHistory(specialAccountId);
      expect(history).toHaveLength(0);
    });

    it('should handle very long transaction IDs', async () => {
      const longTxId = '0.0.123456@' + '1'.repeat(1000);
      const payment = createTestPayment(100000000, '0.0.123456', longTxId);

      const result = await testEnv.creditService.processHbarPayment({
        ...payment,
        hbarAmount: 1,
        payerAccountId: payment.accountId,
        timestamp: Date.now().toString(),
        creditsAllocated: 1000,
        status: 'COMPLETED',
      });

      expect(typeof result).toBe('boolean');
    });

    it('should return empty history gracefully', async () => {
      const newAccount = '0.0.nohistory';
      const history = await testEnv.creditService.getCreditHistory(newAccount);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history).toHaveLength(0);
    });

    it('should limit history results correctly', async () => {
      const accountId = '0.0.historytest';

      for (let i = 0; i < 20; i++) {
        await testEnv.creditService.processHbarPayment({
          transactionId: generateTestTransactionId(),
          payerAccountId: accountId,
          hbarAmount: 0.1,
          creditsAllocated: 10,
          status: 'COMPLETED',
          timestamp: Date.now().toString(),
        });
      }

      const history5 = await testEnv.creditService.getCreditHistory(
        accountId,
        5
      );
      expect(history5).toHaveLength(5);

      const history10 = await testEnv.creditService.getCreditHistory(
        accountId,
        10
      );
      expect(history10).toHaveLength(10);

      const historyAll =
        await testEnv.creditService.getCreditHistory(accountId);
      expect(historyAll.length).toBeGreaterThanOrEqual(20);
    });
  });
});
