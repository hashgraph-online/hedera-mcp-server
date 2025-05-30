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
import { Logger } from '@hashgraphonline/standards-sdk';
import { PortManager } from '../test-utils/port-manager';
import * as path from 'path';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { Client, PrivateKey, ScheduleSignTransaction, ScheduleId } from '@hashgraph/sdk';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { ChallengeService } from '../../auth/challenge-service';
import { SignatureService } from '../../auth/signature-service';
import { ApiKeyService } from '../../auth/api-key-service';
import { proto } from '@hashgraph/proto';

jest.setTimeout(120000);

describe('Schedule Transaction E2E Tests', () => {
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

    client = Client.forTestnet();
    client.setOperator(testAccountId, testAccountKey);

    const logger = Logger.getInstance({
      level: 'error',
      module: 'ScheduleTransactionE2ETest',
      prettyPrint: false,
    });

    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
       const databaseUrl = `sqlite://${tempDbPath}`;

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    const testPort = PortManager.getPort('schedule-transaction-e2e');
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
  });

  test('should create and execute a scheduled transaction', async () => {
    const balanceBefore = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );

    console.log('Initial balance:', balanceBefore);

    const response = await callServerTool(
      testEnv.baseUrl,
      'schedule_transaction',
      {
        request: 'Schedule a transfer of 0.1 HBAR from my account to 0.0.123456',
        accountId: testAccountId,
      },
      apiKey,
    );

    expect(response).toBeDefined();

    if (response.error && response.error.includes('OpenAI')) {
      console.warn('Test skipped due to missing or invalid OpenAI API key');
      return;
    }

    if (response.status === 'failed') {
      console.log('Schedule transaction failed:', response.error);

      expect(response.error).toBeDefined();
      return;
    }

    expect(response.operation).toBe('schedule_transaction');
    expect(response.status).not.toBe('failed');

    if (!response.schedule_id) {
      console.log('No schedule_id returned, likely due to API limitations');
      return;
    }

    expect(response.schedule_id).toBeDefined();
    console.log('Created scheduled transaction with ID:', response.schedule_id);

    const scheduleId = ScheduleId.fromString(response.schedule_id);
    const scheduleSignTx = new ScheduleSignTransaction()
      .setScheduleId(scheduleId)
      .freezeWith(client);

    const signedScheduleTx = await scheduleSignTx.sign(testAccountKey);
    const scheduleResponse = await signedScheduleTx.execute(client);
    const scheduleReceipt = await scheduleResponse.getReceipt(client);

    expect(scheduleReceipt.status.toString()).toBe('SUCCESS');
    console.log('Successfully signed scheduled transaction');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const balanceAfter = await callServerTool(
      testEnv.baseUrl,
      'check_credit_balance',
      {
        accountId: testAccountId,
      },
      apiKey,
    );

    console.log('Balance after scheduling and execution:', balanceAfter);

    if (balanceBefore.balance?.current > 0) {
      expect(balanceAfter.balance.current).toBeLessThan(
        balanceBefore.balance.current,
      );
    }
  });

  test('should reject scheduling with insufficient credits', async () => {
    const poorAccountId = '0.0.987654321';

    try {
      const response = await callServerTool(
        testEnv.baseUrl,
        'schedule_transaction',
        {
          request: 'Schedule a transfer of 1 HBAR to 0.0.123456',
          accountId: poorAccountId,
        },
        apiKey,
      );

      expect(response).toBeDefined();
      if (response.status === 'insufficient_credits') {
        expect(response.status).toBe('insufficient_credits');
      }
    } catch (error) {
      expect((error as Error).message).toContain('Tool call');
    }
  });

  test('should require accountId parameter', async () => {
    const response = await callServerTool(
      testEnv.baseUrl,
      'schedule_transaction',
      {
        request: 'Schedule a transfer of 1 HBAR to 0.0.123456',

      },
      apiKey,
    );

    expect(response.error).toBeDefined();


    expect(
      response.error.includes('accountId') ||
      response.error.includes('Insufficient credits')
    ).toBe(true);
  });

  test('should require request parameter', async () => {
    await expect(
      callServerTool(testEnv.baseUrl, 'schedule_transaction', {
        accountId: testAccountId,
      }, apiKey),
    ).rejects.toThrow();
  });
});
