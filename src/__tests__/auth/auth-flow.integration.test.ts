import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from '@jest/globals';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { ChallengeService } from '../../auth/challenge-service';
import { SignatureService } from '../../auth/signature-service';
import { ApiKeyService } from '../../auth/api-key-service';
import { Logger } from '@hashgraphonline/standards-sdk';
import * as schema from '../../db/schema';
import {
  PrivateKey,
  AccountCreateTransaction,
  Hbar,
  Client,
  AccountId,
} from '@hashgraph/sdk';
import { proto } from '@hashgraph/proto';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import { setupTestDatabase } from '../test-db-setup';

/**
 * Integration tests for complete authentication flow
 */
describe('Authentication Flow Integration', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let challengeService: ChallengeService;
  let signatureService: SignatureService;
  let apiKeyService: ApiKeyService;
  let logger: Logger;
  let testPrivateKey: PrivateKey;
  let testAccountId: string;
  let tempDbPath: string;
  let client: Client;

  const SKIP_NETWORK_TESTS = process.env.SKIP_NETWORK_TESTS === 'true';

  beforeAll(async () => {
    if (!SKIP_NETWORK_TESTS) {
      const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
      const operatorKey = PrivateKey.fromString(
        process.env.HEDERA_OPERATOR_KEY!,
      );

      client = Client.forTestnet();
      client.setOperator(operatorId, operatorKey);

      testPrivateKey = PrivateKey.generateED25519();
      const testPublicKey = testPrivateKey.publicKey;

      try {
        const transaction = await new AccountCreateTransaction()
          .setKey(testPublicKey)
          .setInitialBalance(new Hbar(1))
          .execute(client);

        const receipt = await transaction.getReceipt(client);
        testAccountId = receipt.accountId!.toString();

        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        console.error('Failed to create test account:', error);
        throw error;
      }
    } else {
      testPrivateKey = PrivateKey.generateED25519();
      testAccountId = '0.0.12345';
    }
  });

  afterAll(async () => {
    if (client) {
      client.close();
    }
  });

  beforeEach(async () => {
    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
    const databaseUrl = `sqlite://${tempDbPath}`;

    logger = new Logger({ module: 'auth-flow-test', level: 'debug' });

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    db = drizzle(sqlite, { schema });

    challengeService = new ChallengeService(db, false);
    signatureService = new SignatureService('testnet', logger);
    apiKeyService = new ApiKeyService(
      db,
      false,
      'test-encryption-key-32-characters',
    );
  });

  afterEach(() => {
    sqlite.close();
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {}
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full auth flow from challenge to API key', async () => {
      const challenge = await challengeService.generateChallenge({
        hederaAccountId: testAccountId,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      expect(challenge).toBeTruthy();
      expect(challenge.challenge).toBeTruthy();
      expect(new Date(challenge.expiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );

      const timestamp = Date.now();
      const message = SignatureService.createAuthMessage(
        challenge.challenge,
        timestamp,
        testAccountId,
        'testnet',
        challenge.challenge,
      );
      const prefixedMessage =
        '\x19Hedera Signed Message:\n' + message.length + message;
      const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

      const sigPair = new proto.SignaturePair();
      sigPair.ed25519 = signature;

      const sigMap = new proto.SignatureMap();
      sigMap.sigPair = [sigPair];

      const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
      const signatureBase64 = Buffer.from(sigMapBytes).toString('base64');

      if (!SKIP_NETWORK_TESTS) {
        const isValid = await signatureService.verifySignature({
          hederaAccountId: testAccountId,
          message,
          signature: signatureBase64,
          publicKey: testPrivateKey.publicKey.toStringDer(),
        });
        expect(isValid).toBe(true);
      } else {
        console.log('Skipping signature verification (offline mode)');
      }

      const challengeValid = await challengeService.verifyChallenge(
        challenge.id,
        testAccountId,
      );
      expect(challengeValid).toBeTruthy();
      expect(challengeValid?.used).toBe(true);

      const apiKey = await apiKeyService.generateApiKey({
        hederaAccountId: testAccountId,
        name: 'Test Integration Key',
        permissions: ['read', 'write'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(apiKey).toHaveProperty('id');
      expect(apiKey).toHaveProperty('plainKey');
      expect(apiKey.plainKey).toMatch(/^mcp_[a-f0-9]{64}$/);

      const keyRecord = await apiKeyService.verifyApiKey(apiKey.plainKey);
      expect(keyRecord).toBeTruthy();
      expect(keyRecord?.hederaAccountId).toBe(testAccountId);
      expect(keyRecord?.status).toBe('active');
      expect(keyRecord?.permissions).toEqual(['read', 'write']);
    });

    it('should prevent challenge reuse', async () => {
      const challenge = await challengeService.generateChallenge({
        hederaAccountId: testAccountId,
      });

      const firstUse = await challengeService.verifyChallenge(
        challenge.id,
        testAccountId,
      );
      expect(firstUse).toBeTruthy();
      expect(firstUse?.used).toBe(true);

      const secondUse = await challengeService.verifyChallenge(
        challenge.id,
        testAccountId,
      );
      expect(secondUse).toBeNull();
    });

    it('should handle invalid signatures', async () => {
      const challenge = await challengeService.generateChallenge({
        hederaAccountId: testAccountId,
      });

      const wrongKey = PrivateKey.generateED25519();
      const { createHash } = require('crypto');
      const timestamp = Date.now();
      const message = SignatureService.createAuthMessage(
        challenge.challenge,
        timestamp,
        testAccountId,
        'testnet',
        challenge.challenge,
      );
      const prefixedMessage =
        '\x19Hedera Signed Message:\n' + message.length + message;
      const signature = wrongKey.sign(Buffer.from(prefixedMessage));

      const sigPair = new proto.SignaturePair();
      sigPair.ed25519 = signature;

      const sigMap = new proto.SignatureMap();
      sigMap.sigPair = [sigPair];

      const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
      const signatureBase64Wrong = Buffer.from(sigMapBytes).toString('base64');

      if (!SKIP_NETWORK_TESTS) {
        const isValid = await signatureService.verifySignature({
          hederaAccountId: testAccountId,
          message,
          signature: signatureBase64Wrong,
          publicKey: testPrivateKey.publicKey.toStringDer(),
        });
        expect(isValid).toBe(false);
      }
    });

    it('should handle API key lifecycle', async () => {
      const apiKey = await apiKeyService.generateApiKey({
        hederaAccountId: testAccountId,
        name: 'Lifecycle Test Key',
      });

      let keyRecord = await apiKeyService.verifyApiKey(apiKey.plainKey);
      expect(keyRecord?.status).toBe('active');

      keyRecord = await apiKeyService.verifyApiKey(apiKey.plainKey);
      expect(keyRecord?.lastUsedAt).toBeTruthy();

      const revoked = await apiKeyService.revokeApiKey(
        apiKey.id,
        testAccountId,
      );
      expect(revoked).toBe(true);

      keyRecord = await apiKeyService.verifyApiKey(apiKey.plainKey);
      expect(keyRecord).toBeNull();
    });

    it('should enforce permissions', async () => {
      const readOnlyKey = await apiKeyService.generateApiKey({
        hederaAccountId: testAccountId,
        name: 'Read Only Key',
        permissions: ['read'],
      });

      const adminKey = await apiKeyService.generateApiKey({
        hederaAccountId: testAccountId,
        name: 'Admin Key',
        permissions: ['read', 'write', 'admin'],
      });

      const readOnlyRecord = await apiKeyService.verifyApiKey(
        readOnlyKey.plainKey,
      );
      const adminRecord = await apiKeyService.verifyApiKey(adminKey.plainKey);

      expect(readOnlyRecord?.permissions).toEqual(['read']);
      expect(adminRecord?.permissions).toEqual(['read', 'write', 'admin']);
    });

    it('should handle concurrent authentication attempts', async () => {
      const challenges = await Promise.all([
        challengeService.generateChallenge({ hederaAccountId: testAccountId }),
        challengeService.generateChallenge({ hederaAccountId: testAccountId }),
        challengeService.generateChallenge({ hederaAccountId: testAccountId }),
      ]);

      const uniqueChallenges = new Set(challenges.map(c => c.challenge));
      expect(uniqueChallenges.size).toBe(3);

      for (const challenge of challenges) {
        const result = await challengeService.verifyChallenge(
          challenge.id,
          testAccountId,
        );
        expect(result).toBeTruthy();
        expect(result?.used).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      sqlite.close();

      await expect(
        challengeService.generateChallenge({ hederaAccountId: testAccountId }),
      ).rejects.toThrow();

      await expect(
        apiKeyService.generateApiKey({ hederaAccountId: testAccountId }),
      ).rejects.toThrow();
    });

    it('should handle invalid account IDs', async () => {
      const invalidAccountId = 'invalid-account';

      const challenge = await challengeService.generateChallenge({
        hederaAccountId: invalidAccountId,
      });
      expect(challenge.challenge).toBeTruthy();

      if (!SKIP_NETWORK_TESTS) {
        const { createHash } = require('crypto');
        const timestamp = Date.now();
        const message = SignatureService.createAuthMessage(
          challenge.challenge,
          timestamp,
          invalidAccountId,
          'testnet',
          challenge.challenge,
        );
        const prefixedMessage =
          '\x19Hedera Signed Message:\n' + message.length + message;
        const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

        const sigPair = new proto.SignaturePair();
        sigPair.ed25519 = signature;

        const sigMap = new proto.SignatureMap();
        sigMap.sigPair = [sigPair];

        const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
        const signatureBase64Invalid =
          Buffer.from(sigMapBytes).toString('base64');

        const isValid = await signatureService.verifySignature({
          hederaAccountId: invalidAccountId,
          message,
          signature: signatureBase64Invalid,
          publicKey: testPrivateKey.publicKey.toStringDer(),
        });
        expect(isValid).toBe(false);
      }
    });
  });
});
