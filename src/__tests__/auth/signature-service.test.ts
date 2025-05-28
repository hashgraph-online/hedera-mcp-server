import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SignatureService } from '../../auth/signature-service';
import { Logger, NetworkType } from '@hashgraphonline/standards-sdk';
import {
  PrivateKey,
  PublicKey,
  AccountId,
  Client,
  AccountCreateTransaction,
  Hbar,
} from '@hashgraph/sdk';
import { proto } from '@hashgraph/proto';
import { createHash } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const SKIP_NETWORK_TESTS =
  !process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY;

describe('SignatureService Integration Tests', () => {
  let signatureService: SignatureService;
  let testAccountId: AccountId | null = null;
  let testPrivateKey: PrivateKey | null = null;
  let testPublicKey: PublicKey | null = null;
  let client: Client | null = null;

  beforeAll(async () => {
    if (!SKIP_NETWORK_TESTS) {
      const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
      const operatorKey = PrivateKey.fromString(
        process.env.HEDERA_OPERATOR_KEY!,
      );

      client = Client.forTestnet();
      client.setOperator(operatorId, operatorKey);

      testPrivateKey = PrivateKey.generateED25519();
      testPublicKey = testPrivateKey.publicKey;

      try {
        const transaction = await new AccountCreateTransaction()
          .setKey(testPublicKey)
          .setInitialBalance(new Hbar(1))
          .execute(client);

        const receipt = await transaction.getReceipt(client);
        testAccountId = receipt.accountId!;

        console.log('Waiting for mirror node to sync new account...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        console.error('Failed to create test account:', error);
        testAccountId = null;
      }
    }
  });

  beforeEach(() => {
    const logger = new Logger({
      module: 'SignatureService-Test',
      level: 'error',
    });
    signatureService = new SignatureService('testnet', logger);
  });

  afterAll(() => {
    if (client) {
      client.close();
    }
  });

  describe('createAuthMessage', () => {
    it('should create a properly formatted auth message', () => {
      const challenge = 'test-challenge-123';
      const timestamp = 1234567890000;
      const accountId = process.env.HEDERA_OPERATOR_ID || '0.0.1234';
      const network = process.env.HEDERA_NETWORK || 'testnet';

      const message = SignatureService.createAuthMessage(
        challenge,
        timestamp,
        accountId,
        network,
      );

      expect(message).toBe(
        `Sign this message to authenticate with MCP Server\n\nChallenge: ${challenge}\nNonce: ${challenge}\nTimestamp: ${timestamp}\nAccount: ${accountId}\nNetwork: ${network}`,
      );
    });
  });

  describe('verifySignature with real Hedera network', () => {
    it('should verify a valid Ed25519 signature against real account', async () => {
      if (
        SKIP_NETWORK_TESTS ||
        !testAccountId ||
        !testPrivateKey ||
        !testPublicKey
      ) {
        console.log(
          'Skipping network test - no test credentials or account creation failed',
        );
        return;
      }

      const message = 'test-message';
      const prefixedMessage =
        '\x19Hedera Signed Message:\n' + message.length + message;
      const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

      const sigPair = new proto.SignaturePair();
      sigPair.ed25519 = signature;

      const sigMap = new proto.SignatureMap();
      sigMap.sigPair = [sigPair];

      const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
      const sigMapBase64 = Buffer.from(sigMapBytes).toString('base64');

      const isValid = await signatureService.verifySignature({
        hederaAccountId: testAccountId.toString(),
        message,
        signature: sigMapBase64,
        publicKey: testPublicKey.toStringDer(),
      });

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature from different key', async () => {
      if (
        SKIP_NETWORK_TESTS ||
        !testAccountId ||
        !testPrivateKey ||
        !testPublicKey
      ) {
        console.log('Skipping network test');
        return;
      }

      const wrongPrivateKey = PrivateKey.generateED25519();

      const message = 'test-message';
      const prefixedMessage =
        '\x19Hedera Signed Message:\n' + message.length + message;
      const wrongSignature = wrongPrivateKey.sign(Buffer.from(prefixedMessage));

      const { proto } = await import('@hashgraph/proto');
      const sigPair = new proto.SignaturePair();
      sigPair.ed25519 = wrongSignature;

      const sigMap = new proto.SignatureMap();
      sigMap.sigPair = [sigPair];

      const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
      const sigMapBase64 = Buffer.from(sigMapBytes).toString('base64');

      const isValid = await signatureService.verifySignature({
        hederaAccountId: testAccountId.toString(),
        message,
        signature: sigMapBase64,
        publicKey: testPublicKey.toStringDer(),
      });

      expect(isValid).toBe(false);
    });

    it('should reject if public key does not match account key', async () => {
      if (
        SKIP_NETWORK_TESTS ||
        !testAccountId ||
        !testPrivateKey ||
        !testPublicKey
      ) {
        console.log('Skipping network test');
        return;
      }

      const differentPrivateKey = PrivateKey.generateED25519();
      const differentPublicKey = differentPrivateKey.publicKey;

      const message = 'test-message';
      const prefixedMessage =
        '\x19Hedera Signed Message:\n' + message.length + message;
      const signature = differentPrivateKey.sign(Buffer.from(prefixedMessage));

      const { proto } = await import('@hashgraph/proto');
      const sigPair = new proto.SignaturePair();
      sigPair.ed25519 = signature;

      const sigMap = new proto.SignatureMap();
      sigMap.sigPair = [sigPair];

      const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
      const sigMapBase64 = Buffer.from(sigMapBytes).toString('base64');

      const isValid = await signatureService.verifySignature({
        hederaAccountId: testAccountId.toString(),
        message,
        signature: sigMapBase64,
        publicKey: differentPublicKey.toStringDer(),
      });

      expect(isValid).toBe(false);
    });

    it('should handle invalid account ID gracefully', async () => {
      const privateKey = PrivateKey.generateED25519();
      const publicKey = privateKey.publicKey;

      const isValid = await signatureService.verifySignature({
        hederaAccountId: '0.0.99999999',
        message: 'test',
        signature: 'abcdef1234567890',
        publicKey: publicKey.toStringDer(),
      });

      expect(isValid).toBe(false);
    });

    it('should verify auth message format', async () => {
      if (
        SKIP_NETWORK_TESTS ||
        !testAccountId ||
        !testPrivateKey ||
        !testPublicKey
      ) {
        console.log('Skipping network test');
        return;
      }

      const challenge = 'challenge-123';
      const timestamp = Date.now();
      const message = SignatureService.createAuthMessage(
        challenge,
        timestamp,
        testAccountId.toString(),
        'testnet',
      );
      const prefixedMessage =
        '\x19Hedera Signed Message:\n' + message.length + message;
      const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

      const { proto } = await import('@hashgraph/proto');
      const sigPair = new proto.SignaturePair();
      sigPair.ed25519 = signature;

      const sigMap = new proto.SignatureMap();
      sigMap.sigPair = [sigPair];

      const sigMapBytes = proto.SignatureMap.encode(sigMap).finish();
      const sigMapBase64 = Buffer.from(sigMapBytes).toString('base64');

      const isValid = await signatureService.verifySignature({
        hederaAccountId: testAccountId.toString(),
        message,
        signature: sigMapBase64,
        publicKey: testPublicKey.toStringDer(),
      });

      expect(isValid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle malformed signatures', async () => {
      const isValid = await signatureService.verifySignature({
        hederaAccountId: '0.0.12345',
        message: 'test',
        signature: 'not-a-valid-hex-signature',
        publicKey: 'invalid-key',
      });

      expect(isValid).toBe(false);
    });

    it('should handle empty inputs', async () => {
      const isValid = await signatureService.verifySignature({
        hederaAccountId: '',
        message: '',
        signature: '',
        publicKey: '',
      });

      expect(isValid).toBe(false);
    });
  });
});
