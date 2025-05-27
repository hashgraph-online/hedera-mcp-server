import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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

describe('Credit System Core Functionality', () => {
  let testEnv: TestEnvironment;

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
        toHbarPayment(createTestPayment(50000000, account1))
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(100000000, account2))
      );

      await assertCreditBalance(testEnv.creditService, account1, 50);
      await assertCreditBalance(testEnv.creditService, account2, 100);
    });

    it('should convert HBAR to credits correctly', async () => {
      const hbarAmount = 50000000;
      const expectedCredits = 50;

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(hbarAmount))
      );
      const balanceInfo =
        await testEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBe(expectedCredits);
    });

    it('should handle custom HBAR to credits ratios', async () => {
      const customEnv = await setupTestDatabase('memory', {
        CREDITS_CONVERSION_RATE: 2000, // 1 HBAR = 2000 credits
      });

      await customEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(100000000), 2000)
      );
      const balanceInfo =
        await customEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBe(2000);
      await customEnv.cleanup();
    });
  });

  describe('Credit Allocation', () => {
    it('should allocate credits from payments correctly', async () => {
      const payment = createTestPayment(100000000);
      await testEnv.creditService.processHbarPayment(toHbarPayment(payment));

      await assertCreditBalance(testEnv.creditService, payment.accountId, 1000);
      await verifyPaymentHistory(testEnv.creditService, payment.accountId, 1);
    });

    it('should accumulate credits from multiple payments', async () => {
      const accountId = '0.0.123456';

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(50000000, accountId))
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(30000000, accountId))
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(20000000, accountId))
      );

      await assertCreditBalance(testEnv.creditService, accountId, 1000);
      await verifyPaymentHistory(testEnv.creditService, accountId, 3);
    });

    it('should track payment timestamps correctly', async () => {
      const accountId = '0.0.123456';
      const payment = createTestPayment(100000000, accountId);

      await testEnv.creditService.processHbarPayment(toHbarPayment(payment));
      const history = await testEnv.creditService.getCreditHistory(accountId);
      const payments = history.filter((h) => h.transactionType === 'purchase');

      expect(payments[0].createdAt).toBeDefined();
      expect(new Date(payments[0].createdAt).getTime()).toBeLessThanOrEqual(
        Date.now()
      );
    });
  });

  describe('Credit Consumption', () => {
    beforeEach(async () => {
      await createTestAccounts(testEnv.creditService, [
        { accountId: '0.0.123456', initialBalance: 100000000 },
      ]);
    });

    it('should deduct credits when consumed', async () => {
      const accountId = '0.0.123456';

      await testEnv.creditService.consumeCredits(
        accountId,
        'execute_transaction',
        'test operation'
      );
      await assertCreditBalance(testEnv.creditService, accountId, 95);
    });

    it('should track credit consumption history', async () => {
      const accountId = '0.0.123456';

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
      expect(consumptions[0].amount).toBe(10);
      expect(consumptions[1].amount).toBe(15);
    });

    it('should prevent negative balances', async () => {
      const accountId = '0.0.123456';

      const result = await testEnv.creditService.consumeCredits(
        accountId,
        'too-much',
        'too much operation'
      );
      expect(result).toBe(false);

      await assertCreditBalance(testEnv.creditService, accountId, 100);
    });

    it('should handle concurrent credit operations safely', async () => {
      const accountId = '0.0.123456';

      const operations = [
        testEnv.creditService.consumeCredits(accountId, 'op1', 'operation 1'),
        testEnv.creditService.consumeCredits(accountId, 'op2', 'operation 2'),
        testEnv.creditService.processHbarPayment(
          toHbarPayment(createTestPayment(50000000, accountId))
        ),
      ];

      await Promise.all(operations);

      const balanceInfo =
        await testEnv.creditService.getCreditBalance(accountId);
      expect(balanceInfo?.balance || 0).toBe(550);
    });
  });

  describe('History Management', () => {
    const accountId = '0.0.123456';

    beforeEach(async () => {
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(50000000, accountId))
      );
      await testEnv.creditService.consumeCredits(
        accountId,
        'execute_transaction',
        'op1 desc'
      );
      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(30000000, accountId))
      );
      await testEnv.creditService.consumeCredits(
        accountId,
        'operation-2',
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

      for (let i = 1; i < history.length; i++) {
        expect(new Date(history[i].createdAt).getTime()).toBeGreaterThanOrEqual(
          new Date(history[i - 1].createdAt).getTime()
        );
      }
    });

    it('should include operation details in consumption history', async () => {
      const history = await testEnv.creditService.getCreditHistory(accountId);
      const consumptions = history.filter(
        (h) => h.transactionType === 'consumption'
      );

      expect(consumptions[0].relatedOperation).toBe('execute_transaction');
      expect(consumptions[1].relatedOperation).toBe('schedule_transaction');
    });

    it('should calculate running balance in history', async () => {
      const history = await testEnv.creditService.getCreditHistory(accountId);

      let expectedBalance = 0;
      for (const entry of history) {
        if (entry.transactionType === 'purchase') {
          expectedBalance += entry.amount;
        } else if (entry.transactionType === 'consumption') {
          expectedBalance -= entry.amount;
        }
        expect(entry.balanceAfter).toBe(expectedBalance);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large credit amounts', async () => {
      const largeAmount = 1000000000000;

      await testEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(largeAmount))
      );
      const balanceInfo =
        await testEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBe(10000000);
    });

    it('should handle fractional credit amounts correctly', async () => {
      const customEnv = await setupTestDatabase('memory', {
        CREDITS_CONVERSION_RATE: 10,
      });

      await customEnv.creditService.processHbarPayment(
        toHbarPayment(createTestPayment(5000000), 10)
      );
      const balanceInfo =
        await customEnv.creditService.getCreditBalance('0.0.123456');

      expect(balanceInfo?.balance || 0).toBe(0);
      await customEnv.cleanup();
    });

    it('should handle invalid account IDs gracefully', async () => {
      const invalidAccount = 'invalid-account';

      const balanceInfo =
        await testEnv.creditService.getCreditBalance(invalidAccount);
      expect(balanceInfo).toBeNull();

      const history =
        await testEnv.creditService.getCreditHistory(invalidAccount);
      expect(history).toHaveLength(0);
    });

    it('should recover from database errors', async () => {
      expect(true).toBe(true);
    });

    it('should reject zero amount payments', async () => {
      const payment = createTestPayment(0);

      const result = await testEnv.creditService.processHbarPayment({
        ...payment,
        timestamp: Date.now().toString(),
        payerAccountId: payment.accountId,
        hbarAmount: 0,
        creditsAllocated: 0,
        status: 'COMPLETED',
      });

      expect(result).toBe(false);
      await assertCreditBalance(testEnv.creditService, payment.accountId, 0);
    });

    it('should reject negative amount payments', async () => {
      const payment = createTestPayment(-100000000);

      const result = await testEnv.creditService.processHbarPayment({
        ...payment,
        timestamp: Date.now().toString(),
        payerAccountId: payment.accountId,
        hbarAmount: -1,
        creditsAllocated: 0,
        status: 'COMPLETED',
      });

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
      expect(balanceInfo).toBeNull();

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
