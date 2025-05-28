import { randomBytes, createHash, createCipheriv } from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
const { pgApiKeys, sqliteApiKeys } = schema;

interface CreateApiKeyOptions {
  hederaAccountId: string;
  name?: string;
  permissions?: string[];
  rateLimit?: number;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

interface ApiKeyUsageEntry {
  apiKeyId: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  responseTimeMs?: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Service for managing API keys
 */
export class ApiKeyService {
  private db: any;
  private isPostgres: boolean;
  private encryptionKey: Buffer;

  constructor(
    db: any,
    isPostgres: boolean,
    encryptionKey: string
  ) {
    this.db = db;
    this.isPostgres = isPostgres;
    this.encryptionKey = createHash('sha256').update(encryptionKey).digest();
  }

  /**
   * Generate a new API key
   * @param options - Options for creating the API key
   * @returns The API key object with the plain key
   */
  async generateApiKey(options: CreateApiKeyOptions) {
    const id = randomBytes(16).toString('hex');
    const plainKey = `mcp_${randomBytes(32).toString('hex')}`;
    const keyHash = this.hashApiKey(plainKey);
    const encryptedKey = this.encryptApiKey(plainKey);

    const apiKeys = this.isPostgres
      ? schema.pgApiKeys
      : schema.sqliteApiKeys;

    const apiKey = {
      id,
      hederaAccountId: options.hederaAccountId,
      encryptedKey,
      keyHash,
      name: options.name || null,
      permissions: JSON.stringify(options.permissions || ['read']),
      status: 'active',
      rateLimit: this.isPostgres ? String(options.rateLimit || 1000) : (options.rateLimit || 1000),
      createdAt: this.isPostgres ? new Date() : new Date().toISOString(),
      updatedAt: this.isPostgres ? new Date() : new Date().toISOString(),
      expiresAt: options.expiresAt ? (this.isPostgres ? options.expiresAt : options.expiresAt.toISOString()) : null,
      isActive: true,
      metadata: JSON.stringify(options.metadata || {}),
    };

    await this.db.insert(apiKeys).values(apiKey);

    const inserted = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, id))
      .limit(1);

    return { ...inserted[0], plainKey };
  }

  /**
   * Verify an API key and return its details
   * @param plainKey - The plain API key to verify
   * @returns The API key details if valid, null otherwise
   */
  async verifyApiKey(plainKey: string) {
    const keyHash = this.hashApiKey(plainKey);
    
    const apiKeys = this.isPostgres
      ? schema.pgApiKeys
      : schema.sqliteApiKeys;

    const keys = await this.db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.isActive, true)
        )
      )
      .limit(1);

    const key = keys[0];
    if (!key) {
      return null;
    }

    const expiresAt = key.expiresAt ? new Date(key.expiresAt) : null;
    if (expiresAt && expiresAt < new Date()) {
      return null;
    }

    await this.db
      .update(apiKeys)
      .set({ 
        lastUsedAt: this.isPostgres ? new Date() : new Date().toISOString() 
      })
      .where(eq(apiKeys.id, key.id));

    return {
      ...key,
      permissions: JSON.parse(key.permissions || '[]'),
      metadata: JSON.parse(key.metadata || '{}'),
      rateLimit: this.isPostgres ? Number(key.rateLimit) : key.rateLimit,
    };
  }

  /**
   * Log API key usage
   * @param usage - Usage details to log
   */
  async logUsage(usage: ApiKeyUsageEntry): Promise<void> {
    const apiKeyUsage = this.isPostgres
      ? schema.pgApiKeyUsage
      : schema.sqliteApiKeyUsage;

    await this.db.insert(apiKeyUsage).values({
      ...(this.isPostgres ? {} : { id: undefined }),
      apiKeyId: usage.apiKeyId,
      endpoint: usage.endpoint,
      method: usage.method,
      statusCode: this.isPostgres 
        ? (usage.statusCode ? String(usage.statusCode) : null)
        : (usage.statusCode || null),
      responseTimeMs: this.isPostgres 
        ? (usage.responseTimeMs ? String(usage.responseTimeMs) : null)
        : (usage.responseTimeMs || null),
      ipAddress: usage.ipAddress || null,
      userAgent: usage.userAgent || null,
      createdAt: this.isPostgres ? new Date() : new Date().toISOString(),
    });
  }

  /**
   * Get all API keys for a Hedera account
   * @param hederaAccountId - The Hedera account ID
   * @returns List of API keys
   */
  async getApiKeysByAccount(hederaAccountId: string) {
    const apiKeys = this.isPostgres
      ? schema.pgApiKeys
      : schema.sqliteApiKeys;

    const keys = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.hederaAccountId, hederaAccountId));

    return keys.map((key: any) => ({
      ...key,
      permissions: JSON.parse(key.permissions || '[]'),
      metadata: JSON.parse(key.metadata || '{}'),
      rateLimit: this.isPostgres ? Number(key.rateLimit) : key.rateLimit,
    }));
  }

  /**
   * Revoke an API key
   * @param keyId - The API key ID to revoke
   * @param hederaAccountId - The account ID (for verification)
   * @returns True if revoked, false if not found or unauthorized
   */
  async revokeApiKey(keyId: string, hederaAccountId: string): Promise<boolean> {
    const apiKeys = this.isPostgres
      ? schema.pgApiKeys
      : schema.sqliteApiKeys;

    const result = await this.db
      .update(apiKeys)
      .set({ 
        isActive: false, 
        updatedAt: this.isPostgres ? new Date() : new Date().toISOString() 
      })
      .where(
        and(
          eq(apiKeys.id, keyId),
          eq(apiKeys.hederaAccountId, hederaAccountId)
        )
      );

    return (result?.changes || result?.rowCount || 0) > 0;
  }

  /**
   * Hash an API key
   * @param plainKey - The plain API key
   * @returns The hashed key
   */
  private hashApiKey(plainKey: string): string {
    return createHash('sha256').update(plainKey).digest('hex');
  }

  /**
   * Encrypt an API key
   * @param plainKey - The plain API key
   * @returns The encrypted key
   */
  private encryptApiKey(plainKey: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(plainKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Rotate an API key
   * @param oldKeyId - The ID of the key to rotate
   * @param accountId - The account ID for verification
   * @returns The new API key object with the plain key
   */
  async rotateApiKey(oldKeyId: string, accountId: string) {
    const apiKeys = this.isPostgres
      ? schema.pgApiKeys
      : schema.sqliteApiKeys;

    const oldKey = await this.db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, oldKeyId),
          eq(apiKeys.hederaAccountId, accountId),
          eq(apiKeys.isActive, true)
        )
      )
      .limit(1);

    if (oldKey.length === 0) {
      throw new Error('API key not found or unauthorized');
    }

    const oldKeyData = oldKey[0];
    
    const newKey = await this.generateApiKey({
      hederaAccountId: accountId,
      name: oldKeyData.name ? `${oldKeyData.name} (rotated)` : 'Rotated Key',
      permissions: JSON.parse(oldKeyData.permissions as string || '["read"]'),
      rateLimit: oldKeyData.rateLimit,
      expiresAt: oldKeyData.expiresAt ? new Date(oldKeyData.expiresAt) : undefined,
      metadata: {
        ...(typeof oldKeyData.metadata === 'string' ? JSON.parse(oldKeyData.metadata) : oldKeyData.metadata || {}),
        rotatedFrom: oldKeyId,
        rotatedAt: new Date().toISOString()
      }
    });

    await this.db
      .update(apiKeys)
      .set({
        isActive: false,
        metadata: JSON.stringify({
          ...(typeof oldKeyData.metadata === 'string' ? JSON.parse(oldKeyData.metadata) : oldKeyData.metadata || {}),
          revokedAt: new Date().toISOString(),
          revokedReason: 'rotated',
          rotatedTo: newKey.id
        }),
        updatedAt: this.isPostgres ? new Date() : new Date().toISOString()
      })
      .where(eq(apiKeys.id, oldKeyId));

    return newKey;
  }

  /**
   * Count active API keys
   */
  async countActiveKeys(): Promise<number> {
    const apiKeys = this.isPostgres ? pgApiKeys : sqliteApiKeys;
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(apiKeys)
      .where(eq(apiKeys.isActive, true));
    
    return result[0]?.count || 0;
  }

  /**
   * Get ages of all active API keys in days
   */
  async getKeyAges(): Promise<number[]> {
    const apiKeys = this.isPostgres ? pgApiKeys : sqliteApiKeys;
    const keys = await this.db
      .select({ createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.isActive, true));
    
    const now = Date.now();
    return keys.map(key => {
      const createdAt = new Date(key.createdAt).getTime();
      const ageMs = now - createdAt;
      return Math.floor(ageMs / (1000 * 60 * 60 * 24));
    });
  }
}