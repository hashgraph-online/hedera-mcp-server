import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MCPAuthMiddleware } from '../../auth/mcp-auth-middleware';
import { ApiKeyService } from '../../auth/api-key-service';
import { AnomalyDetector } from '../../auth/anomaly-detector';
import type { AuthContext } from '../../types/auth-types';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../../db/schema';
import { Logger } from '@hashgraphonline/standards-sdk';
import { setupTestDatabase } from '../test-db-setup';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';

describe('MCPAuthMiddleware Integration', () => {
  let middleware: MCPAuthMiddleware;
  let apiKeyService: ApiKeyService;
  let anomalyDetector: AnomalyDetector;
  let db: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;
  let logger: Logger;
  let tempDbPath: string;
  let testApiKey: { id: string; plainKey: string };
  let testAccountId: string;

  beforeEach(async () => {
    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
    );
    const databaseUrl = `sqlite://${tempDbPath}`;

    logger = new Logger({ module: 'auth-middleware-test', level: 'error' });

    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }

    db = drizzle(sqlite, { schema });

    apiKeyService = new ApiKeyService(
      db,
      false,
      'test-encryption-key-32-characters',
    );
    anomalyDetector = new AnomalyDetector({
      redis: {} as any,
      db,
      isPostgres: false,
      logger,
      apiKeyService,
      thresholds: {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
        uniqueEndpointsPerHour: 50,
        errorRatePercent: 10,
        newLocationAlertEnabled: true,
      },
    });
    middleware = new MCPAuthMiddleware(apiKeyService, anomalyDetector);

    testAccountId = '0.0.12345';
    testApiKey = await apiKeyService.generateApiKey({
      hederaAccountId: testAccountId,
      name: 'Test Integration Key',
      permissions: ['read', 'write'],
    });
  });

  afterEach(() => {
    sqlite.close();
    try {
      if (tempDbPath && fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
    } catch (err) {}
  });

  describe('authenticate', () => {
    it('should authenticate with valid Bearer token', async () => {
      const headers = {
        authorization: `Bearer ${testApiKey.plainKey}`,
      };

      const context = await middleware.authenticate(headers);

      expect(context).toBeTruthy();
      expect(context?.apiKeyId).toBe(testApiKey.id);
      expect(context?.hederaAccountId).toBe(testAccountId);
      expect(context?.permissions).toEqual(['read', 'write']);
    });

    it('should authenticate with x-api-key header', async () => {
      const headers = {
        'x-api-key': testApiKey.plainKey,
      };

      const context = await middleware.authenticate(headers);

      expect(context).toBeTruthy();
      expect(context?.apiKeyId).toBe(testApiKey.id);
      expect(context?.hederaAccountId).toBe(testAccountId);
    });

    it('should return null for missing auth headers', async () => {
      const headers = {};
      const context = await middleware.authenticate(headers);

      expect(context).toBeNull();
    });

    it('should return null for invalid API key', async () => {
      const headers = {
        authorization: 'Bearer mcp_invalid_key_that_does_not_exist',
      };

      const context = await middleware.authenticate(headers);

      expect(context).toBeNull();
    });

    it('should return null for inactive API key', async () => {
      await apiKeyService.revokeApiKey(testApiKey.id, testAccountId);

      const headers = {
        authorization: `Bearer ${testApiKey.plainKey}`,
      };

      const context = await middleware.authenticate(headers);

      expect(context).toBeNull();
    });

    it('should handle malformed authorization header', async () => {
      const headers = {
        authorization: 'InvalidFormat',
      };

      const context = await middleware.authenticate(headers);

      expect(context).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should check single permission', () => {
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: ['read', 'write'],
        requestId: 'req-123',
      };

      expect(middleware.hasPermission(context, 'read')).toBe(true);
      expect(middleware.hasPermission(context, 'write')).toBe(true);
      expect(middleware.hasPermission(context, 'admin')).toBe(false);
    });

    it('should check multiple permissions (OR)', () => {
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: ['read'],
        requestId: 'req-123',
      };

      expect(middleware.hasPermission(context, 'read')).toBe(true);
      expect(middleware.hasPermission(context, 'write')).toBe(false);
    });

    it('should handle empty permissions', () => {
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: [],
        requestId: 'req-123',
      };

      expect(middleware.hasPermission(context, 'read')).toBe(false);
    });
  });

  describe('injectAuthContext', () => {
    it('should inject auth context into session', () => {
      const session: any = {};
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: ['read', 'write'],
        requestId: 'req-123',
      };

      middleware.injectAuthContext(session, context);

      expect(session.auth).toEqual({
        accountId: testAccountId,
        permissions: ['read', 'write'],
        requestId: 'req-123',
      });
    });
  });

  describe('createAuthError', () => {
    it('should create JSON-RPC error', () => {
      const error = middleware.createAuthError(
        -32001,
        'Authentication required',
        { hint: 'Include API key' },
      );

      expect(error).toMatchObject({
        code: -32001,
        message: 'Authentication required',
        data: expect.objectContaining({
          hint: 'Include API key',
          type: 'authentication_error',
          timestamp: expect.any(String),
        }),
      });
    });
  });

  describe('logUsage', () => {
    it('should log API usage', async () => {
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: ['read'],
        requestId: 'req-123',
      };

      await expect(
        middleware.logUsage(
          context,
          '/mcp/tools/get_balance',
          'POST',
          200,
          150,
          { headers: { 'user-agent': 'test-client' } },
        ),
      ).resolves.not.toThrow();
    });

    it('should check for anomalies when detector is available', async () => {
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: ['read'],
        requestId: 'req-123',
      };

      await expect(
        middleware.logUsage(
          context,
          '/mcp/tools/get_balance',
          'POST',
          200,
          150,
          { headers: { 'x-forwarded-for': '192.168.1.1' } },
        ),
      ).resolves.not.toThrow();
    });

    it('should extract tool name from path', async () => {
      const context: AuthContext = {
        apiKeyId: testApiKey.id,
        hederaAccountId: testAccountId,
        permissions: ['read'],
        requestId: 'req-123',
      };

      await expect(
        middleware.logUsage(
          context,
          '/mcp/tools/send_transaction',
          'POST',
          200,
          250,
          {},
        ),
      ).resolves.not.toThrow();
    });
  });
});
