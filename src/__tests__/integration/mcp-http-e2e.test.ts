import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTransportClient } from './mcp-transport-utils';
import { Logger } from '@hashgraphonline/standards-sdk';
import { TestEnvironment } from './test-utils';
import { setupTestDatabase } from '../test-db-setup';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';
import { PrivateKey } from '@hashgraph/sdk';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { PortManager } from '../test-utils/port-manager';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../db/schema';
import { ChallengeService } from '../../auth/challenge-service';
import { SignatureService } from '../../auth/signature-service';
import { ApiKeyService } from '../../auth/api-key-service';
import { proto } from '@hashgraph/proto';

describe('MCP HTTP/SSE Transport E2E Tests', () => {
  let mcpClient: MCPTransportClient;
  let testEnv: TestEnvironment;
  let sqlite: Database.Database;
  let tempDbPath: string;
  let apiKey: string;
  const TEST_PORT = PortManager.getPort('mcp-http-e2e');
  const TEST_TIMEOUT = 60000;

  beforeAll(async () => {
    const logger = Logger.getInstance({ module: 'test-http' });

    tempDbPath = path.join(
      __dirname,
      `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`,
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
    const testAccountId = operatorId;

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
    const testPrivateKey = PrivateKey.fromStringED25519(operatorKey);
    const signature = testPrivateKey.sign(Buffer.from(prefixedMessage));

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

    mcpClient.setApiKey(apiKey);
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
  it(
    'should initialize and get server info via HTTP',
    async () => {
      const serverInfo = await mcpClient.getServerInfo();
      expect(serverInfo).toBeDefined();
      expect(serverInfo.serverInfo).toBeDefined();
      expect(serverInfo.serverInfo.name).toBe('Hedera MCP Server');
      expect(serverInfo.serverInfo.version).toBeDefined();
    },
    TEST_TIMEOUT,
  );
  it('should list available tools via HTTP', async () => {
    const result = await mcpClient.listTools();
    expect(result).toBeDefined();
    expect(result.tools).toBeDefined();
    
    const toolsArray = Array.isArray(result.tools) ? result.tools : [result.tools].flat();
    expect(toolsArray.length).toBeGreaterThan(0);
    
    const toolNames = toolsArray.map((t: any) => t.name);
    expect(toolNames).toContain('health_check');
    expect(toolNames).toContain('get_server_info');
  });
  it('should handle HTTP errors properly', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/invalid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'test' }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
  it('should validate JSON-RPC format', async () => {
    try {
      await mcpClient.callTool('invalid_tool_name', {});
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.message).toContain('Unknown tool');
    }
  });
  it('should handle concurrent HTTP requests', async () => {
    const requests = Array(10)
      .fill(null)
      .map((_, i) => mcpClient.callTool('health_check', { request_id: i }));
    const results = await Promise.all(requests);
    expect(results).toHaveLength(10);
    results.forEach(result => {
      expect(result.status).toBe('healthy');
    });
  });
  it('should handle large HTTP payloads', async () => {
    const largeData = {
      data: Array(1000)
        .fill(null)
        .map((_, i) => ({
          index: i,
          value: `test-value-${i}`,
          nested: { a: i, b: i * 2, c: i * 3 },
        })),
    };
    await expect(async () => {
      await mcpClient.callTool('health_check', largeData);
    }).not.toThrow();
  });
  it('should support HTTP keep-alive', async () => {
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await mcpClient.callTool('health_check');
    }
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });
  it.skip('should handle HTTP timeouts', async () => {
    const controller = new AbortController();
    
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort();
    
    try {
      await fetch(`http://localhost:${TEST_PORT}/stream`, {
        method: 'GET',
        headers: { 
          'Accept': 'text/event-stream',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: controller.signal as any,
      });
      throw new Error('Should have timed out');
    } catch (error: any) {
      console.log('Timeout error details:', {
        name: error.name,
        type: error.type,
        code: error.code,
        message: error.message
      });
      
      expect(
        error.name === 'AbortError' || 
        error.type === 'aborted' ||
        error.code === 'ABORT_ERR' ||
        error.message.includes('abort') ||
        error.message.includes('The operation was aborted')
      ).toBe(true);
    }
  });
  it('should support CORS headers', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });
    const headers = response.headers;
    expect(headers.get('access-control-allow-origin')).toBeDefined();
    expect(headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('should handle SSE connections', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/sse`, {
      headers: {
        Accept: 'text/event-stream',
      },
    });
    if (response.status === 200) {
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream',
      );
      response.body?.destroy();
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });
  it('should return proper HTTP status codes', async () => {
    const noAuthResponse = await fetch(`http://localhost:${TEST_PORT}/stream`, {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
    });
    expect([400, 401]).toContain(noAuthResponse.status);
    
    const badAuthResponse = await fetch(`http://localhost:${TEST_PORT}/stream`, {
      method: 'GET',
      headers: { 
        'Accept': 'text/event-stream',
        'Authorization': 'Bearer invalid-key'
      },
    });
    expect([400, 401]).toContain(badAuthResponse.status);
  });
  it('should handle batch requests', async () => {
    const requests = [
      mcpClient.callTool('health_check'),
      mcpClient.callTool('get_server_info'),
      mcpClient.listTools(),
    ];
    
    const results = await Promise.all(requests);
    
    expect(results).toHaveLength(3);
    expect(results[0]).toHaveProperty('status', 'healthy');
    expect(results[1]).toHaveProperty('name', 'Hedera MCP Server');
    expect(results[2]).toHaveProperty('tools');
    const toolsArray = Array.isArray(results[2].tools) ? results[2].tools : Object.values(results[2].tools || {});
    expect(toolsArray.length).toBeGreaterThan(0);
  });
});
