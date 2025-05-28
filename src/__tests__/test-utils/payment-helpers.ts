import { CreditManagerBase } from '../../db/credit-manager-base';
import { 
    TransactionId, 
    PrivateKey,
    TransferTransaction,
    Hbar,
    HbarUnit
} from '@hashgraph/sdk';
import { calculateTestCredits } from './mock-mirror-node';

export interface TestPayment {
  accountId: string;
  amount: number;
  transactionId: string;
  timestamp: number;
}

/**
 * Converts a test payment to HbarPayment format
 * @param testPayment The test payment data
 * @param hbarToUsdRate The HBAR to USD exchange rate (default: 0.05)
 */
export function toHbarPayment(
  testPayment: TestPayment,
  hbarToUsdRate: number = 0.05,
) {
  const hbarAmount = testPayment.amount / 100000000;
  const usdAmount = hbarAmount * hbarToUsdRate;
  const creditsAllocated = Math.floor(usdAmount * 1000);
  
  return {
    transactionId: testPayment.transactionId,
    payerAccountId: testPayment.accountId,
    targetAccountId: testPayment.accountId,
    hbarAmount: hbarAmount,
    creditsAllocated: creditsAllocated,
    status: 'COMPLETED' as const,
    timestamp: new Date(testPayment.timestamp).toISOString(),
  };
}

/**
 * Creates a test payment object with optional overrides
 */
export function createTestPayment(amount: number, accountId?: string, transactionId?: string): TestPayment {
    const account = accountId || '0.0.123456';
    let txId = transactionId;
    
    if (!txId) {
        try {
            txId = TransactionId.generate(account).toString();
        } catch (error) {
            txId = generateTestTransactionId(account);
        }
    }
    
    return {
        accountId: account,
        amount,
        transactionId: txId,
        timestamp: Date.now()
    };
}

/**
 * Verifies payment history contains expected number of payments
 */
export async function verifyPaymentHistory(
  creditService: CreditManagerBase,
  accountId: string,
  expectedCount: number,
): Promise<void> {
  const history = await creditService.getCreditHistory(accountId);
  const payments = history.filter(h => h.transactionType === 'purchase');

  if (payments.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} payments, found ${payments.length}`,
    );
  }
}

/**
 * Asserts credit balance matches expected value
 */
export async function assertCreditBalance(
  creditService: CreditManagerBase,
  accountId: string,
  expected: number,
): Promise<void> {
  const balanceInfo = await creditService.getCreditBalance(accountId);
  const balance = balanceInfo?.balance || 0;

  if (balance !== expected) {
    throw new Error(`Expected balance ${expected}, got ${balance}`);
  }
}

/**
 * Waits for a payment to be processed with timeout
 */
export async function waitForPayment(
  creditService: CreditManagerBase,
  transactionId: string,
  timeoutMs: number = 30000,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const payment = await creditService.getHbarPayment(transactionId);

    if (payment) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return false;
}

/**
 * Generates a unique transaction ID for testing
 */
export function generateTestTransactionId(
  accountId: string = '0.0.123456',
): string {
  const now = Date.now();
  const seconds = Math.floor(now / 1000);
  const nanos = (now % 1000) * 1000000;
  return `${accountId}@${seconds}.${nanos}`;
}
