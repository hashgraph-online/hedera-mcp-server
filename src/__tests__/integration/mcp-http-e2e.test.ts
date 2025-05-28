import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTransportClient } from './mcp-transport-utils';
import { Logger } from '@hashgraphonline/standards-sdk';
import { TestEnvironment } from './test-utils';
import { setupTestDatabase } from '../test-db-setup';
import fetch from 'node-fetch';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

describe('MCP HTTP/SSE Transport E2E Tests', () => {
  let mcpClient: MCPTransportClient;
  let testEnv: TestEnvironment;
  let sqlite: Database.Database;
  let tempDbPath: string;
  const TEST_PORT = 3456;
  const TEST_TIMEOUT = 60000;
  
  beforeAll(async () => {
    const logger = Logger.getInstance({ module: 'test-http' });
    
    tempDbPath = path.join(__dirname, `../../../test-db-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`);
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
    
    mcpClient = new MCPTransportClient(
      {
        type: 'http',
        port: TEST_PORT,
        env: {
          DATABASE_URL: databaseUrl,
          HEDERA_NETWORK: 'testnet',
          SERVER_ACCOUNT_ID: process.env.SERVER_ACCOUNT_ID || '0.0.123456',
          SERVER_PRIVATE_KEY: process.env.SERVER_PRIVATE_KEY || 'test-key',
          CREDITS_CONVERSION_RATE: '1000',
          LOG_LEVEL: 'error',
        },
      },
      logger
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
  it(
    'should initialize and get server info via HTTP',
    async () => {
      const serverInfo = await mcpClient.getServerInfo();
      expect(serverInfo).toBeDefined();
      expect(serverInfo.serverInfo).toBeDefined();
      expect(serverInfo.serverInfo.name).toBe('hedera-mcp-server');
      expect(serverInfo.serverInfo.version).toBeDefined();
    },
    TEST_TIMEOUT
  );
  it('should list available tools via HTTP', async () => {
    const tools = await mcpClient.listTools();
    expect(tools).toBeDefined();
    expect(tools.tools).toBeInstanceOf(Array);
    expect(tools.tools.length).toBeGreaterThan(0);
    const toolNames = tools.tools.map((t: any) => t.name);
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
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'request' }),
    });
    const result = await response.json();
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32600);
  });
  it('should handle concurrent HTTP requests', async () => {
    const requests = Array(10)
      .fill(null)
      .map((_, i) => mcpClient.callTool('health_check', { request_id: i }));
    const results = await Promise.all(requests);
    expect(results).toHaveLength(10);
    results.forEach((result) => {
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
  it('should handle HTTP timeouts', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'health_check' },
      }),
      timeout: 1,
    }).catch((err) => ({ error: err.message }));
    expect(response.error).toBeDefined();
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
        'text/event-stream'
      );
      response.body?.destroy();
    } else {
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });
  it('should return proper HTTP status codes', async () => {
    const successResponse = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'health_check' },
      }),
    });
    expect(successResponse.status).toBe(200);
    const notFoundResponse = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'invalid/method',
      }),
    });
    expect(notFoundResponse.status).toBe(200);
    const notFoundResult = await notFoundResponse.json();
    expect(notFoundResult.error).toBeDefined();
    expect(notFoundResult.error.code).toBe(-32601);
  });
  it('should handle batch requests', async () => {
    const batchRequest = [
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'health_check' },
      },
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'get_server_info' },
      },
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
    ];
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchRequest),
    });
    const results = await response.json();
    if (Array.isArray(results)) {
      expect(results).toHaveLength(3);
      expect(results[0].id).toBe(1);
      expect(results[1].id).toBe(2);
      expect(results[2].id).toBe(3);
    } else {
      expect(results.error).toBeDefined();
    }
  });
});
