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
import { Client, PrivateKey, Transaction } from '@hashgraph/sdk';
import { Logger } from '@hashgraphonline/standards-sdk';

jest.setTimeout(120000);

describe('Transaction Processing E2E Tests', () => {
  let testEnv: TestServerEnvironment;
  let testAccountId: string;
  let testAccountKey: PrivateKey;
  let client: Client;

  beforeAll(async () => {
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      throw new Error(
        'Test requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars',
      );
    }

    testAccountId = process.env.HEDERA_OPERATOR_ID;
    testAccountKey = PrivateKey.fromStringECDSA(
      process.env.HEDERA_OPERATOR_KEY,
    );

    const logger = Logger.getInstance({
      level: 'error',
      module: 'ProcessTransactionE2ETest',
      prettyPrint: false,
    });

    client = Client.forTestnet();
    client.setOperator(testAccountId, testAccountKey);

    testEnv = await startTestServer({
      port: 4995,
      env: {
        HEDERA_OPERATOR_ID: testAccountId,
        HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY,
        SERVER_ACCOUNT_ID: testAccountId,
        ENABLE_HCS10: 'false',
        LOG_LEVEL: 'error',
      },
    });

    const payment = {
      transactionId: `${testAccountId}@${Date.now()}.setup`,
      payerAccountId: testAccountId,
      hbarAmount: 10.0,
      creditsAllocated: 10000,
      memo: 'Test setup',
      status: 'COMPLETED',
    };

    await callServerTool(testEnv.baseUrl, 'process_hbar_payment', payment);
    logger.info('Test account set up with credits');
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    await testEnv?.cleanup();
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('should process complete payment transaction flow with MCP server', async () => {
    const initialBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );
    expect(initialBalance.balance.current).toBeGreaterThanOrEqual(1000);

    const createPaymentResponse = await callServerTool(
      testEnv.baseUrl,
      'create_payment_transaction',
      {
        payerAccountId: testAccountId,
        amount: 0.1,
        memo: 'Integration test payment',
      },
    );

    expect(createPaymentResponse).toBeDefined();
    expect(createPaymentResponse.transaction_bytes).toBeDefined();
    expect(createPaymentResponse.transaction_id).toBeDefined();
    expect(createPaymentResponse.expected_credits).toBeGreaterThan(0);

    const transactionBytes = Buffer.from(
      createPaymentResponse.transaction_bytes,
      'base64',
    );
    const transaction = Transaction.fromBytes(transactionBytes);

    const signedTx = await transaction.sign(testAccountKey);
    const txResponse = await signedTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    expect(receipt.status.toString()).toBe('SUCCESS');

    await new Promise(resolve => setTimeout(resolve, 15000));

    const verifyResponse = await callServerTool(
      testEnv.baseUrl,
      'verify_payment',
      {
        transactionId: createPaymentResponse.transaction_id,
      },
    );

    expect(verifyResponse).toBeDefined();

    const finalBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    expect(finalBalance.balance.current).toBeGreaterThanOrEqual(
      initialBalance.balance.current,
    );
  });

  test('should track credit consumption across tools', async () => {
    const initialBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
      accountId: testAccountId,
    });

    await callServerTool(testEnv.baseUrl, 'get_credit_history', {
      accountId: testAccountId,
      limit: 5,
    });

    const afterFreeOpsBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    expect(afterFreeOpsBalance.balance.current).toBe(
      initialBalance.balance.current,
    );

    const generateResponse = await callServerTool(
      testEnv.baseUrl,
      'generate_transaction_bytes',
      {
        request:
          'Create a transaction to transfer 0.0001 HBAR from my account back to my account',
        accountId: testAccountId,
      },
    );

    expect(generateResponse.transaction_bytes).toBeDefined();

    const txBytes = generateResponse.transaction_bytes;

    await callServerTool(testEnv.baseUrl, 'execute_transaction', {
      transactionBytes: txBytes,
      accountId: testAccountId,
    });

    const afterPaidOpBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
    );

    expect(afterPaidOpBalance.balance.current).toBeLessThan(
      initialBalance.balance.current,
    );

    const history = await callServerTool(
      testEnv.baseUrl,
      'get_credit_history',
      {
        accountId: testAccountId,
        limit: 5,
      },
    );

    expect(history).toBeDefined();
    expect(history.transactions).toBeDefined();

    const executeTransaction = history.transactions.find(
      (tx: any) =>
        tx.transactionType === 'consumption' &&
        tx.relatedOperation === 'execute_transaction',
    );

    expect(executeTransaction).toBeDefined();
    expect(executeTransaction.amount).toBeLessThan(0);
  });
});
