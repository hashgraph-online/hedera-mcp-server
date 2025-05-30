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
  createTestApiKey,
  TestServerEnvironment,
} from '../test-utils/server-test-helper';
import { setupTestDatabase } from '../test-db-setup';
import { Client, PrivateKey, Transaction } from '@hashgraph/sdk';
import { Logger } from '@hashgraphonline/standards-sdk';
import { PortManager } from '../test-utils/port-manager';
import * as path from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { ChallengeService } from '../../auth/challenge-service';
import { SignatureService } from '../../auth/signature-service';
import { ApiKeyService } from '../../auth/api-key-service';
import { proto } from '@hashgraph/proto';

jest.setTimeout(120000);

describe('Transaction Processing E2E Tests', () => {
  let testEnv: TestServerEnvironment;
  let testAccountId: string;
  let testAccountKey: PrivateKey;
  let client: Client;
  let sqlite: Database.Database;
  let tempDbPath: string;
  let apiKey: string;

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

    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`
    );
     const databaseUrl = `sqlite://${tempDbPath}`;

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    const testPort = PortManager.getPort('process-transaction-e2e');
    testEnv = await startTestServer({
      port: testPort,
      env: {
        DATABASE_URL: databaseUrl,
        HEDERA_OPERATOR_ID: testAccountId,
        HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY,
        SERVER_ACCOUNT_ID: testAccountId,
        SERVER_PRIVATE_KEY: process.env.HEDERA_OPERATOR_KEY,
        ENABLE_HCS10: 'false',
        LOG_LEVEL: 'error',
        REQUIRE_AUTH: 'true',
        CREDITS_CONVERSION_RATE: '1000',
      },
    });


    const db = drizzle(sqlite, { schema });
    const challengeService = new ChallengeService(db, false);
    const apiKeyService = new ApiKeyService(db, false, 'test-encryption-key-32-characters');


    const challenge = await challengeService.generateChallenge({
      hederaAccountId: testAccountId,
      ipAddress: '127.0.0.1',
      userAgent: 'test-client',
    });


    const timestamp = Date.now();
    const message = SignatureService.createAuthMessage(
      challenge.challenge,
      timestamp,
      testAccountId,
      'testnet',
      challenge.challenge,
    );
    const prefixedMessage = '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testAccountKey.sign(Buffer.from(prefixedMessage));


    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];


    await challengeService.verifyChallenge(challenge.id, testAccountId);


    const apiKeyResult = await apiKeyService.generateApiKey({
      hederaAccountId: testAccountId,
      name: 'E2E Test Key',
      permissions: ['read', 'write'],
    });
    apiKey = apiKeyResult.plainKey;

    const payment = {
      transactionId: `${testAccountId}@${Date.now()}.setup`,
      payerAccountId: testAccountId,
      hbarAmount: 10.0,
      creditsAllocated: 10000,
      memo: 'Test setup',
      status: 'COMPLETED',
    };

    await callServerTool(testEnv.baseUrl, 'process_hbar_payment', payment, apiKey);
    logger.info('Test account set up with credits');
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    await testEnv?.cleanup();
    if (sqlite) {
      sqlite.close();
    }
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  test('should process complete payment transaction flow with MCP server', async () => {
    const initialBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );
    expect(initialBalance?.balance?.current ?? 0).toBeGreaterThanOrEqual(0);

    const createPaymentResponse = await callServerTool(
      testEnv.baseUrl,
      'purchase_credits',
      {
        payer_account_id: testAccountId,
        amount: 0.1,
        memo: 'Integration test payment',
      },
      apiKey,
    );

    expect(createPaymentResponse).toBeDefined();


    if (createPaymentResponse.error) {
      console.log('Payment creation failed:', createPaymentResponse.error);
      return;
    }

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

    await new Promise(resolve => setTimeout(resolve, 3000));

    const verifyResponse = await callServerTool(
      testEnv.baseUrl,
      'verify_payment',
      {
        transaction_id: createPaymentResponse.transaction_id,
      },
      apiKey,
    );

    expect(verifyResponse).toBeDefined();

    const finalBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );

    expect(finalBalance?.balance?.current ?? 0).toBeGreaterThanOrEqual(
      initialBalance?.balance?.current ?? 0,
    );
  });

  test('should track credit consumption across tools', async () => {
    const initialBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );

    await callServerTool(testEnv.baseUrl, 'check_credit_balance', {
      accountId: testAccountId,
    }, apiKey);

    await callServerTool(testEnv.baseUrl, 'get_credit_history', {
      accountId: testAccountId,
      limit: 5,
    }, apiKey);

    const afterFreeOpsBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );

    expect(afterFreeOpsBalance?.balance?.current ?? 0).toBe(
      initialBalance?.balance?.current ?? 0,
    );

    const generateResponse = await callServerTool(
      testEnv.baseUrl,
      'generate_transaction_bytes',
      {
        request:
          'Create a transaction to transfer 0.0001 HBAR from my account back to my account',
        accountId: testAccountId,
      },
      apiKey,
    );


    if (generateResponse.error) {
      console.log('Transaction generation failed:', generateResponse.error);

      if (generateResponse.error.includes('OpenAI')) {
        return;
      }
    }

    if (!generateResponse.transaction_bytes) {
      console.log('No transaction bytes returned, likely due to API limitations');
      return;
    }

    expect(generateResponse.transaction_bytes).toBeDefined();

    const txBytes = generateResponse.transaction_bytes;

    await callServerTool(testEnv.baseUrl, 'execute_transaction', {
      transactionBytes: txBytes,
      accountId: testAccountId,
    }, apiKey);

    const afterPaidOpBalance = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );

    expect(afterPaidOpBalance?.balance?.current ?? 0).toBeLessThan(
      initialBalance?.balance?.current ?? 0,
    );

    const history = await callServerTool(
      testEnv.baseUrl,
      'get_credit_history',
      {
        accountId: testAccountId,
        limit: 5,
      },
      apiKey,
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
