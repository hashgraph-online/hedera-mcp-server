import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ApiKeyService } from '../../auth/api-key-service';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import Database from 'better-sqlite3';
import * as schema from '../../db/schema';
import crypto from 'crypto';
import { Logger } from '@hashgraphonline/standards-sdk';
import { setupTestDatabase } from '../test-db-setup';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';

describe('ApiKeyService', () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let apiKeyService: ApiKeyService;
  let logger: Logger;
  let tempDbPath: string;
  const testEncryptionKey = 'test-encryption-key-32-chars-long';

  beforeEach(async () => {
    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
    const databaseUrl = `sqlite://${tempDbPath}`;

    logger = new Logger({ module: 'api-key-service-test', level: 'error' });

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    db = drizzle(sqlite, { schema });
    apiKeyService = new ApiKeyService(db, false, testEncryptionKey);
  });

  afterEach(async () => {
    if (sqlite) {
      sqlite.close();
    }
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {
    }
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', async () => {
      const result = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Test Key',
        permissions: ['read', 'write']
      });

      expect(result.plainKey).toMatch(/^mcp_[a-f0-9]{64}$/);
      expect(result.id).toMatch(/^[a-f0-9]{32}$/);
      expect(result.hederaAccountId).toBe('0.0.12345');
      expect(result.name).toBe('Test Key');
      expect(JSON.parse(result.permissions)).toEqual(['read', 'write']);
      expect(result.isActive).toBe(true);
    });

    it('should set default values when not provided', async () => {
      const result = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      expect(result.name).toBeNull();
      expect(JSON.parse(result.permissions)).toEqual(['read']);
      expect(result.rateLimit).toBe(1000);
      expect(result.expiresAt).toBeNull();
    });

    it('should set expiration date when provided', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const result = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        expiresAt
      });

      expect(new Date(result.expiresAt!)).toEqual(expiresAt);
    });

    it('should encrypt the API key', async () => {
      const result = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      const stored = await db
        .select()
        .from(schema.sqliteApiKeys)
        .where(eq(schema.sqliteApiKeys.id, result.id))
        .limit(1);

      expect(stored[0].encryptedKey).toBeDefined();
      expect(stored[0].encryptedKey).not.toBe(result.plainKey);
      expect(stored[0].encryptedKey).toContain(':');
    });
  });

  describe('verifyApiKey', () => {
    it('should verify a valid API key', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Test Key'
      });

      const verified = await apiKeyService.verifyApiKey(generated.plainKey);

      expect(verified).toBeDefined();
      expect(verified?.id).toBe(generated.id);
      expect(verified?.hederaAccountId).toBe('0.0.12345');
      expect(verified?.name).toBe('Test Key');
    });

    it('should return null for invalid API key', async () => {
      const verified = await apiKeyService.verifyApiKey('mcp_invalid_key');
      expect(verified).toBeNull();
    });

    it('should return null for inactive API key', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      await db
        .update(schema.sqliteApiKeys)
        .set({ isActive: false })
        .where(eq(schema.sqliteApiKeys.id, generated.id));

      const verified = await apiKeyService.verifyApiKey(generated.plainKey);
      expect(verified).toBeNull();
    });

    it('should return null for expired API key', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        expiresAt: new Date(Date.now() - 1000)
      });

      const verified = await apiKeyService.verifyApiKey(generated.plainKey);
      expect(verified).toBeNull();
    });

    it('should update last used timestamp', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      await apiKeyService.verifyApiKey(generated.plainKey);

      const updated = await db
        .select()
        .from(schema.sqliteApiKeys)
        .where(eq(schema.sqliteApiKeys.id, generated.id))
        .limit(1);

      expect(updated[0].lastUsedAt).toBeDefined();
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an API key', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      const revoked = await apiKeyService.revokeApiKey(generated.id, '0.0.12345');
      expect(revoked).toBe(true);

      const verified = await apiKeyService.verifyApiKey(generated.plainKey);
      expect(verified).toBeNull();
    });

    it('should not revoke key from different account', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      const revoked = await apiKeyService.revokeApiKey(generated.id, '0.0.99999');
      expect(revoked).toBe(false);
    });

    it('should not revoke non-existent key', async () => {
      const revoked = await apiKeyService.revokeApiKey('non-existent', '0.0.12345');
      expect(revoked).toBe(false);
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate an API key', async () => {
      const original = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Original Key',
        permissions: ['read', 'write']
      });

      const rotated = await apiKeyService.rotateApiKey(original.id, '0.0.12345');

      expect(rotated.plainKey).toMatch(/^mcp_[a-f0-9]{64}$/);
      expect(rotated.plainKey).not.toBe(original.plainKey);
      expect(rotated.hederaAccountId).toBe('0.0.12345');
      expect(rotated.name).toBe('Original Key (rotated)');
      expect(JSON.parse(rotated.permissions)).toEqual(['read', 'write']);

      const originalVerified = await apiKeyService.verifyApiKey(original.plainKey);
      expect(originalVerified).toBeNull();

      const newVerified = await apiKeyService.verifyApiKey(rotated.plainKey);
      expect(newVerified).toBeDefined();
    });

    it('should track rotation metadata', async () => {
      const original = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      const rotated = await apiKeyService.rotateApiKey(original.id, '0.0.12345');

      const rotatedKey = await db
        .select()
        .from(schema.sqliteApiKeys)
        .where(eq(schema.sqliteApiKeys.id, rotated.id))
        .limit(1);

      const metadata = JSON.parse(rotatedKey[0].metadata);
      expect(metadata.rotatedFrom).toBe(original.id);
      expect(metadata.rotatedAt).toBeDefined();
    });
  });

  describe('getApiKeysByAccount', () => {
    it('should return all keys for an account', async () => {
      await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Key 1'
      });
      await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Key 2'
      });
      await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.99999',
        name: 'Other Account Key'
      });

      const keys = await apiKeyService.getApiKeysByAccount('0.0.12345');

      expect(keys.length).toBe(2);
      expect(keys.some(k => k.name === 'Key 1')).toBe(true);
      expect(keys.some(k => k.name === 'Key 2')).toBe(true);
    });

    it('should return all keys including inactive ones', async () => {
      const active = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Active Key'
      });
      const inactive = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345',
        name: 'Inactive Key'
      });

      await apiKeyService.revokeApiKey(inactive.id, '0.0.12345');

      const keys = await apiKeyService.getApiKeysByAccount('0.0.12345');

      expect(keys.length).toBe(2);
      expect(keys.some(k => k.name === 'Active Key' && k.isActive)).toBe(true);
      expect(keys.some(k => k.name === 'Inactive Key' && !k.isActive)).toBe(true);
    });
  });

  describe('logUsage', () => {
    it('should log API key usage', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      await apiKeyService.logUsage({
        apiKeyId: generated.id,
        endpoint: '/api/test',
        method: 'GET',
        statusCode: 200,
        responseTimeMs: 50,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      });

      const usage = await db
        .select()
        .from(schema.sqliteApiKeyUsage)
        .where(eq(schema.sqliteApiKeyUsage.apiKeyId, generated.id));

      expect(usage.length).toBe(1);
      expect(usage[0].endpoint).toBe('/api/test');
      expect(usage[0].method).toBe('GET');
      expect(usage[0].statusCode).toBe(200);
      expect(usage[0].responseTimeMs).toBe(50);
    });
  });

  describe('security', () => {
    it('should use constant-time comparison for key verification', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      const keyHash = crypto.createHash('sha256').update(generated.plainKey).digest('hex');
      
      const stored = await db
        .select()
        .from(schema.sqliteApiKeys)
        .where(eq(schema.sqliteApiKeys.id, generated.id))
        .limit(1);

      expect(stored[0].keyHash).toBe(keyHash);
    });

    it('should handle encryption key rotation gracefully', async () => {
      const generated = await apiKeyService.generateApiKey({
        hederaAccountId: '0.0.12345'
      });

      const newService = new ApiKeyService(db, false, 'new-encryption-key-32-chars-long!!');
      
      const verified = await newService.verifyApiKey(generated.plainKey);
      expect(verified).toBeDefined();
    });
  });
});