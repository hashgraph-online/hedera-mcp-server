import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTransportClient } from './mcp-transport-utils';
import { Logger } from '@hashgraphonline/standards-sdk';
import { TestEnvironment } from './test-utils';
import { setupTestDatabase } from '../test-db-setup';
import { randomBytes } from 'crypto';
import { PrivateKey } from '@hashgraph/sdk';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { PortManager } from '../test-utils/port-manager';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { proto } from '@hashgraph/proto';

/**
 * Integration tests for MCP authentication tools
 * Tests the complete authentication flow using MCP tools instead of HTTP endpoints
 */
describe('MCP Authentication Tools E2E Tests', () => {
  let mcpClient: MCPTransportClient;
  let testEnv: TestEnvironment;
  let sqlite: Database.Database;
  let tempDbPath: string;
  let testAccountId: string;
  let testPrivateKey: PrivateKey;
  const TEST_PORT = PortManager.getPort('mcp-auth-e2e');
  const TEST_TIMEOUT = 60000;

  beforeAll(async () => {
    const logger = Logger.getInstance({ module: 'test-auth' });

    tempDbPath = path.join(
      __dirname,
      `../../../test-db-auth-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
    const databaseUrl = `sqlite://${tempDbPath}`;

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    testEnv = new TestEnvironment({
      network: 'testnet',
      creditsConversionRate: 1000,
    });
    await testEnv.setup();

    const operatorKey =
      process.env.HEDERA_OPERATOR_KEY || PrivateKey.generate().toString();
    const operatorId = process.env.HEDERA_OPERATOR_ID || '0.0.123456';
    testAccountId = operatorId;
    testPrivateKey = PrivateKey.fromStringED25519(operatorKey);

    mcpClient = new MCPTransportClient(
      {
        type: 'http',
        port: TEST_PORT,
        env: {
          DATABASE_URL: databaseUrl,
          HEDERA_NETWORK: 'testnet',
          HEDERA_OPERATOR_ID: operatorId,
          HEDERA_OPERATOR_KEY: operatorKey,
          SERVER_ACCOUNT_ID: process.env.SERVER_ACCOUNT_ID || operatorId,
          SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY || operatorKey,
          CREDITS_CONVERSION_RATE: '1000',
          LOG_LEVEL: 'error',
          OPENAI_API_KEY:
            process.env.OPENAI_API_KEY || 'test-key-for-integration-tests',
          REQUIRE_AUTH: 'true',
        },
      },
      logger,
    );
    await mcpClient.start();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (mcpClient) {
      await mcpClient.stop();
    }
    if (testEnv) {
      await testEnv.cleanup();
    }
    if (sqlite) {
      sqlite.close();
    }
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {}
  }, TEST_TIMEOUT);

  it('should complete full authentication flow using MCP tools', async () => {
    const challengeResult = await mcpClient.callTool('request_auth_challenge', {
      hederaAccountId: testAccountId,
    });

    expect(challengeResult.challengeId).toBeDefined();
    expect(challengeResult.challenge).toBeDefined();
    expect(challengeResult.expiresAt).toBeDefined();
    expect(challengeResult.network).toBe('testnet');

    const timestamp = Date.now();
    const message = `Sign this message to authenticate with MCP Server\n\nChallenge: ${challengeResult.challenge}\nNonce: ${challengeResult.challenge}\nTimestamp: ${timestamp}\nAccount: ${testAccountId}\nNetwork: testnet`;
    const prefixedMessage =
      '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];
    const base64SignatureMap = Buffer.from(
      proto.SignatureMap.encode(sigMap).finish(),
    ).toString('base64');

    const verifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
      name: 'E2E Test API Key',
      permissions: ['read', 'write'],
    });

    expect(verifyResult.apiKey).toBeDefined();
    expect(verifyResult.keyId).toBeDefined();
    expect(JSON.parse(verifyResult.permissions || '[]')).toEqual([
      'read',
      'write',
    ]);
    expect(verifyResult.apiKey).toMatch(/^mcp_[a-f0-9]{64}$/);

    mcpClient.setApiKey(verifyResult.apiKey);

    const keysResult = await mcpClient.callTool('get_api_keys', {
      hederaAccountId: testAccountId,
    });

    expect(keysResult.keys).toBeDefined();
    expect(Array.isArray(keysResult.keys)).toBe(true);
    expect(keysResult.keys.length).toBeGreaterThan(0);

    const testKey = keysResult.keys.find(
      (key: any) => key.id === verifyResult.keyId,
    );
    expect(testKey).toBeDefined();
    expect(testKey.name).toBe('E2E Test API Key');
    expect(testKey.permissions).toEqual(['read', 'write']);
    expect(testKey.isActive).toBe(true);
  });

  it('should handle invalid challenge ID', async () => {
    const timestamp = Date.now();
    const message = 'test message';
    const prefixedMessage =
      '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];
    const base64SignatureMap = Buffer.from(
      proto.SignatureMap.encode(sigMap).finish(),
    ).toString('base64');

    const verifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: 'invalid-challenge-id',
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
    });

    expect(verifyResult.error).toBeDefined();
    expect(verifyResult.error).toContain('Invalid or expired challenge');
    expect(verifyResult.apiKey).toBeNull();
  });

  it('should handle invalid signature', async () => {
    const challengeResult = await mcpClient.callTool('request_auth_challenge', {
      hederaAccountId: testAccountId,
    });

    const verifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: 'invalid-signature',
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: Date.now(),
    });

    expect(verifyResult.error).toBeDefined();
    expect(verifyResult.error).toContain('Invalid signature');
    expect(verifyResult.apiKey).toBeNull();
  });

  it('should require authentication for protected tools', async () => {
    const clientWithoutAuth = new MCPTransportClient(
      {
        type: 'http',
        port: TEST_PORT,
        env: {},
      },
      Logger.getInstance({ module: 'test-no-auth' }),
    );

    try {
      const result = await clientWithoutAuth.callTool('check_credit_balance');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Authentication required');
    } catch (error: any) {
      expect(error.message || error.toString()).toContain('Authentication');
    }
  });

  it('should allow multiple API keys per account', async () => {
    const challengeResult = await mcpClient.callTool('request_auth_challenge', {
      hederaAccountId: testAccountId,
    });

    const timestamp = Date.now();
    const message = `Sign this message to authenticate with MCP Server\n\nChallenge: ${challengeResult.challenge}\nNonce: ${challengeResult.challenge}\nTimestamp: ${timestamp}\nAccount: ${testAccountId}\nNetwork: testnet`;
    const prefixedMessage =
      '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];
    const base64SignatureMap = Buffer.from(
      proto.SignatureMap.encode(sigMap).finish(),
    ).toString('base64');

    const verifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
      name: 'Second E2E Test API Key',
      permissions: ['read'],
    });

    expect(verifyResult.apiKey).toBeDefined();
    expect(verifyResult.keyId).toBeDefined();

    const keysResult = await mcpClient.callTool('get_api_keys', {
      hederaAccountId: testAccountId,
    });

    expect(keysResult.keys.length).toBeGreaterThanOrEqual(2);
    const keyNames = keysResult.keys.map((key: any) => key.name);
    expect(keyNames).toContain('Second E2E Test API Key');
  });

  it('should handle used challenge', async () => {
    const challengeResult = await mcpClient.callTool('request_auth_challenge', {
      hederaAccountId: testAccountId,
    });

    const timestamp = Date.now();
    const message = `Sign this message to authenticate with MCP Server\n\nChallenge: ${challengeResult.challenge}\nNonce: ${challengeResult.challenge}\nTimestamp: ${timestamp}\nAccount: ${testAccountId}\nNetwork: testnet`;
    const prefixedMessage =
      '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];
    const base64SignatureMap = Buffer.from(
      proto.SignatureMap.encode(sigMap).finish(),
    ).toString('base64');

    // Use the challenge once successfully
    const firstVerifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
    });

    expect(firstVerifyResult.apiKey).toBeDefined();

    // Try to use the same challenge again - should fail
    const secondVerifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
    });

    expect(secondVerifyResult.error).toBeDefined();
    expect(secondVerifyResult.error).toContain('Invalid or expired challenge');
  });

  it('should rotate API key successfully', async () => {
    // First create an API key
    const challengeResult = await mcpClient.callTool('request_auth_challenge', {
      hederaAccountId: testAccountId,
    });

    const timestamp = Date.now();
    const message = `Sign this message to authenticate with MCP Server\n\nChallenge: ${challengeResult.challenge}\nNonce: ${challengeResult.challenge}\nTimestamp: ${timestamp}\nAccount: ${testAccountId}\nNetwork: testnet`;
    const prefixedMessage = '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];
    const base64SignatureMap = Buffer.from(proto.SignatureMap.encode(sigMap).finish()).toString('base64');

    const verifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
      name: 'Key To Rotate',
      permissions: ['read'],
    });

    expect(verifyResult.apiKey).toBeDefined();
    const originalKeyId = verifyResult.keyId;

    // Now rotate the key
    const rotateResult = await mcpClient.callTool('rotate_api_key', {
      keyId: originalKeyId,
      hederaAccountId: testAccountId,
    });

    expect(rotateResult.apiKey).toBeDefined();
    expect(rotateResult.keyId).toBeDefined();
    expect(rotateResult.keyId).not.toBe(originalKeyId);
    expect(rotateResult.message).toContain('rotated successfully');

    // Verify the new key works and old key is revoked
    mcpClient.setApiKey(rotateResult.apiKey);
    const keysResult = await mcpClient.callTool('get_api_keys', {
      hederaAccountId: testAccountId,
    });

    const newKey = keysResult.keys.find((key: any) => key.id === rotateResult.keyId);
    const oldKey = keysResult.keys.find((key: any) => key.id === originalKeyId);
    
    expect(newKey).toBeDefined();
    expect(newKey.isActive).toBe(true);
    expect(oldKey.isActive).toBe(false);
  });

  it('should revoke API key successfully', async () => {
    // First create an API key
    const challengeResult = await mcpClient.callTool('request_auth_challenge', {
      hederaAccountId: testAccountId,
    });

    const timestamp = Date.now();
    const message = `Sign this message to authenticate with MCP Server\n\nChallenge: ${challengeResult.challenge}\nNonce: ${challengeResult.challenge}\nTimestamp: ${timestamp}\nAccount: ${testAccountId}\nNetwork: testnet`;
    const prefixedMessage = '\x19Hedera Signed Message:\n' + message.length + message;
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

    const sigPair = new proto.SignaturePair();
    sigPair.ed25519 = signature;
    const sigMap = new proto.SignatureMap();
    sigMap.sigPair = [sigPair];
    const base64SignatureMap = Buffer.from(proto.SignatureMap.encode(sigMap).finish()).toString('base64');

    const verifyResult = await mcpClient.callTool('verify_auth_signature', {
      challengeId: challengeResult.challengeId,
      hederaAccountId: testAccountId,
      signature: base64SignatureMap,
      publicKey: testPrivateKey.publicKey.toString(),
      timestamp: timestamp,
      name: 'Key To Revoke',
      permissions: ['read'],
    });

    expect(verifyResult.apiKey).toBeDefined();
    const keyToRevoke = verifyResult.keyId;

    // Now revoke the key
    const revokeResult = await mcpClient.callTool('revoke_api_key', {
      keyId: keyToRevoke,
      hederaAccountId: testAccountId,
    });

    expect(revokeResult.success).toBe(true);
    expect(revokeResult.message).toContain('revoked successfully');

    // Verify the key is revoked
    const keysResult = await mcpClient.callTool('get_api_keys', {
      hederaAccountId: testAccountId,
    });

    const revokedKey = keysResult.keys.find((key: any) => key.id === keyToRevoke);
    expect(revokedKey).toBeDefined();
    expect(revokedKey.isActive).toBe(false);
  });

  it('should handle unauthorized key rotation', async () => {
    const rotateResult = await mcpClient.callTool('rotate_api_key', {
      keyId: 'non-existent-key-id',
      hederaAccountId: testAccountId,
    });

    expect(rotateResult.error).toBeDefined();
    expect(rotateResult.error).toContain('not found');
  });

  it('should handle unauthorized key revocation', async () => {
    const revokeResult = await mcpClient.callTool('revoke_api_key', {
      keyId: 'non-existent-key-id',
      hederaAccountId: testAccountId,
    });

    expect(revokeResult.error).toBeDefined();
    expect(revokeResult.error).toContain('not found');
    expect(revokeResult.success).toBe(false);
  });
});
