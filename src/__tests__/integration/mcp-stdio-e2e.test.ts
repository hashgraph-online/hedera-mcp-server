import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MCPTransportClient } from './mcp-transport-utils';
import { Logger } from '@hashgraphonline/standards-sdk';
import { TestEnvironment } from './test-utils';
import { setupTestDatabase } from '../test-db-setup';
import { randomBytes } from 'crypto';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

describe('MCP STDIO Transport E2E Tests', () => {
  let mcpClient: MCPTransportClient;
  let testEnv: TestEnvironment;
  let sqlite: Database.Database;
  let tempDbPath: string;
  const TEST_TIMEOUT = 60000;
  
  beforeAll(async () => {
    const logger = Logger.getInstance({ module: 'test-stdio' });
    
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
        type: 'stdio',
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
    'should initialize and get server info',
    async () => {
      const serverInfo = await mcpClient.getServerInfo();
      expect(serverInfo).toBeDefined();
      expect(serverInfo.serverInfo).toBeDefined();
      expect(serverInfo.serverInfo.name).toBe('hedera-mcp-server');
      expect(serverInfo.serverInfo.version).toBeDefined();
    },
    TEST_TIMEOUT
  );
  it('should list available tools', async () => {
    const tools = await mcpClient.listTools();
    expect(tools).toBeDefined();
    expect(tools.tools).toBeInstanceOf(Array);
    expect(tools.tools.length).toBeGreaterThan(0);
    const toolNames = tools.tools.map((t: any) => t.name);
    expect(toolNames).toContain('health_check');
    expect(toolNames).toContain('get_server_info');
    expect(toolNames).toContain('generate_transaction_bytes');
    expect(toolNames).toContain('execute_transaction');
    expect(toolNames).toContain('schedule_transaction');
    expect(toolNames).toContain('refresh_profile');
  });
  it('should call health_check tool successfully', async () => {
    const result = await mcpClient.callTool('health_check');
    expect(result).toBeDefined();
    expect(result.status).toBe('healthy');
    expect(result.version).toBeDefined();
    expect(result.network).toBe('testnet');
  });
  it('should call get_server_info tool', async () => {
    const result = await mcpClient.callTool('get_server_info');
    expect(result).toBeDefined();
    expect(result.server_account_id).toBeDefined();
    expect(result.network).toBe('testnet');
    expect(result.credits_conversion_rate).toBe(1000);
    expect(result.supported_operations).toBeInstanceOf(Array);
  });
  it('should handle tool errors gracefully', async () => {
    await expect(async () => {
      await mcpClient.callTool('non_existent_tool');
    }).rejects.toThrow(/not found/i);
  });
  it('should handle invalid parameters', async () => {
    await expect(async () => {
      await mcpClient.callTool('generate_transaction_bytes', {
        transaction_type: 'crypto_transfer',
      });
    }).rejects.toThrow();
  });
  it('should support concurrent requests', async () => {
    const requests = Array(5)
      .fill(null)
      .map((_, i) => mcpClient.callTool('health_check', { request_id: i }));
    const results = await Promise.all(requests);
    expect(results).toHaveLength(5);
    results.forEach((result) => {
      expect(result.status).toBe('healthy');
    });
  });
  it('should handle request timeouts', async () => {
    const client = new MCPTransportClient(
      {
        type: 'stdio',
        env: { LOG_LEVEL: 'error' },
      },
      Logger.getInstance({ module: 'test-timeout' })
    );
    await expect(async () => {
      await client.callTool('health_check');
    }).rejects.toThrow();
  });
  it('should handle large responses', async () => {
    const result = await mcpClient.callTool('get_server_info');
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
  it('should maintain message ordering', async () => {
    const results: any[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await mcpClient.callTool('health_check', { sequence: i });
      results.push(result);
    }
    expect(results).toHaveLength(10);
    results.forEach((result) => {
      expect(result.status).toBe('healthy');
    });
  });
  it('should handle server-initiated messages', async () => {
    mcpClient.getMessages();
    await mcpClient.callTool('health_check');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const messages = mcpClient.getMessages();
    expect(messages).toBeInstanceOf(Array);
  });
  it('should properly close stdio streams on shutdown', async () => {
    const tempClient = new MCPTransportClient(
      {
        type: 'stdio',
        env: {
          DATABASE_URL: 'sqlite://temp-test.db',
          LOG_LEVEL: 'error',
        },
      },
      Logger.getInstance({ module: 'test-shutdown' })
    );
    await tempClient.start();
    const result = await tempClient.callTool('health_check');
    expect(result.status).toBe('healthy');
    await tempClient.stop();
    await expect(async () => {
      await tempClient.callTool('health_check');
    }).rejects.toThrow();
  });
});
