import { CreditManagerBase } from '../../db/credit-manager-base';
import { 
    TransactionId, 
    Timestamp,
    PrivateKey,
    TransferTransaction,
    Hbar,
    HbarUnit
} from '@hashgraph/sdk';

export interface TestPayment {
    accountId: string;
    amount: number;
    transactionId: string;
    timestamp: number;
}

/**
 * Converts a test payment to HbarPayment format
 */
export function toHbarPayment(testPayment: TestPayment, conversionRate: number = 1000) {
    return {
        transactionId: testPayment.transactionId,
        payerAccountId: testPayment.accountId,
        hbarAmount: testPayment.amount,
        creditsAllocated: Math.floor(testPayment.amount * conversionRate / 100000000),
        status: 'COMPLETED' as const,
        timestamp: new Date(testPayment.timestamp).toISOString()
    };
}

/**
 * Creates a test payment object with optional overrides
 */
export function createTestPayment(amount: number, accountId?: string, transactionId?: string): TestPayment {
    const account = accountId || '0.0.123456';
    const txId = transactionId || TransactionId.generate(account).toString();
    
    return {
        accountId: account,
        amount,
        transactionId: txId,
        timestamp: Date.now()
    };
}

/**
 * Creates a signed transfer transaction for testing
 */
export async function createSignedTransaction(
    fromAccount: string,
    toAccount: string,
    amount: number,
    privateKey: PrivateKey
): Promise<Uint8Array> {
    const transaction = new TransferTransaction()
        .setTransactionId(TransactionId.generate(fromAccount))
        .addHbarTransfer(fromAccount, new Hbar(-amount, HbarUnit.Tinybar))
        .addHbarTransfer(toAccount, new Hbar(amount, HbarUnit.Tinybar))
        .setMaxTransactionFee(new Hbar(1))
        .freeze();

    const signedTx = await transaction.sign(privateKey);
    return signedTx.toBytes();
}

/**
 * Verifies payment history contains expected number of payments
 */
export async function verifyPaymentHistory(
    creditService: CreditManagerBase, 
    accountId: string,
    expectedCount: number
): Promise<void> {
    const history = await creditService.getCreditHistory(accountId);
    const payments = history.filter(h => h.transactionType === 'purchase');
    
    if (payments.length !== expectedCount) {
        throw new Error(`Expected ${expectedCount} payments, found ${payments.length}`);
    }
}

/**
 * Asserts credit balance matches expected value
 */
export async function assertCreditBalance(
    creditService: CreditManagerBase, 
    accountId: string, 
    expected: number
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
    timeoutMs: number = 30000
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
export function generateTestTransactionId(accountId: string = '0.0.123456'): string {
    const timestamp = Timestamp.generate();
    return `${accountId}@${timestamp.seconds}.${timestamp.nanos}`;
}