import { HederaMCPServer } from '../../server/fastmcp-server';
import { loadServerConfig } from '../../config/server-config';
import { Logger } from '@hashgraphonline/standards-sdk';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PortManager } from './port-manager';
import { ApiKeyService } from '../../auth/api-key-service';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from '../../db/schema';
import { setupTestDatabase } from '../test-db-setup';

export interface TestServerEnvironment {
  server: HederaMCPServer;
  baseUrl: string;
  port: number;
  cleanup: () => Promise<void>;
}

let testServer: TestServerEnvironment | null = null;

/**
 * Starts a real FastMCP server for integration testing
 */
export async function startTestServer(options?: {
  port?: number;
  dbPath?: string;
  env?: Record<string, string>;
}): Promise<TestServerEnvironment> {
  if (testServer) {
    return testServer;
  }

  const port = options?.port || PortManager.getPort();
  
  const databaseUrl = options?.env?.DATABASE_URL || 
    `sqlite://${options?.dbPath || path.join(os.tmpdir(), `test-mcp-${Date.now()}.db`)}`;

  const testEnv = {
    ...process.env,
    PORT: String(port),
    FASTMCP_PORT: String(port),
    HTTP_API_PORT: String(port + 1),
    AUTH_API_PORT: String(port + 2),
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    MCP_TRANSPORT: 'http',
    REQUIRE_AUTH: 'true',
    API_KEY_ENCRYPTION_KEY: 'test-encryption-key-32-characters',
    DATABASE_URL: databaseUrl,
    ...options?.env,
  };

  const originalEnv = { ...process.env };
  Object.assign(process.env, testEnv);

  const config = loadServerConfig();
  const logger = Logger.getInstance({
    level: 'error',
    module: 'test-server',
    prettyPrint: false,
  });

  let sqlite: Database | null = null;
  if (!options?.env?.DATABASE_URL) {
    logger.info('Setting up test database...');
    sqlite = await setupTestDatabase(databaseUrl, logger);
    if (!sqlite) {
      throw new Error('Failed to setup test database');
    }
  } else {
    logger.info('Using provided database URL:', databaseUrl);
  }

  const server = new HederaMCPServer(config, logger);

  logger.info('Initializing test server...');
  await server.initialize();

  logger.info('Starting test server...');
  await server.start();

  const baseUrl = `http://localhost:${port + 1}`;
  const streamUrl = `http://localhost:${port}/stream`;
  logger.info('Waiting for server to be ready...', { streamUrl });
  await waitForServer(streamUrl);

  testServer = {
    server,
    baseUrl,
    port,
    cleanup: async () => {
      await cleanup(server);
      PortManager.releasePort(port);

      if (sqlite) {
        sqlite.close();
      }

      Object.assign(process.env, originalEnv);

      if (!options?.env?.DATABASE_URL) {
        try {
          const dbPath = databaseUrl.replace('sqlite://', '');
          await fs.unlink(dbPath);
        } catch (error) {}
      }

      testServer = null;
    },
  };

  return testServer;
}

/**
 * Waits for the server to be ready to accept requests using the MCP SDK
 */
async function waitForServer(
  streamUrl: string,
  timeout = 30000,
): Promise<void> {
  const logger = Logger.getInstance({ module: 'wait-server' });
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    let client: Client | null = null;

    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(streamUrl),
      ) as any;
      client = new Client(
        {
          name: 'test-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await client.connect(transport);

      const result = await client.callTool({
        name: 'health_check',
        arguments: {},
      });

      if (result) {
        logger.info('Server is ready');
        return;
      }
    } catch (error) {
      logger.warn('MCP connection failed', {
        error: (error as Error).message,
        streamUrl,
      });
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (error) {
          logger.warn('Error closing client', {
            error: (error as Error).message,
          });
        }
      }
    }

    const waitTime = Math.min(
      1000,
      100 * Math.pow(2, Math.floor((Date.now() - startTime) / 1000)),
    );
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  throw new Error(`Server did not become ready within ${timeout}ms`);
}

/**
 * Makes a tool call to the test server via MCP protocol
 */
export async function callServerTool(
  baseUrl: string,
  toolName: string,
  args: Record<string, any> = {},
  apiKey?: string,
): Promise<any> {
  
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      console.error('callServerTool timed out after 30 seconds');
      reject(new Error(`Tool call '${toolName}' timed out after 30 seconds`));
    }, 30000);

    try {
      let streamUrl =
        baseUrl.replace(/(\d+)$/, port => {
          const newPort = parseInt(port) - 1;
          return newPort.toString();
        }) + '/stream';

      if (apiKey) {
        streamUrl += `?apiKey=${encodeURIComponent(apiKey)}`;
      }

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const transport = new StreamableHTTPClientTransport(new URL(streamUrl), {
        headers,
      }) as any;
      const client = new Client(
        {
          name: 'test-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await client.connect(transport);

      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      await client.close();
      clearTimeout(timeoutId);

      if (result && typeof result === 'object') {
        const content = result.content;
        if (Array.isArray(content) && content.length > 0) {
          const textContent = content.find((c: any) => c.type === 'text');
          if (textContent && textContent.text) {
            try {
              const parsed = JSON.parse(textContent.text);
              resolve(parsed);
              return;
            } catch {
              resolve({ text: textContent.text });
              return;
            }
          }
        }
      }

      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('MCP Tool Call Error:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      reject(new Error(
        `Tool call '${toolName}' failed: ${(error as Error).message}`,
      ));
    }
  });
}

/**
 * Calls server tool via HTTP API instead of MCP (for authenticated calls)
 */
export async function callServerToolHTTP(
  baseUrl: string,
  toolName: string,
  args: Record<string, any> = {},
  apiKey?: string,
): Promise<any> {
  const response = await fetch(`${baseUrl}/api/tools/${toolName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Creates an API key for testing by connecting to the server's database
 */
export async function createTestApiKey(
  accountId: string,
  permissions: string[] = ['read', 'write'],
): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.startsWith('sqlite://')) {
    throw new Error('Test requires SQLite database');
  }

  const dbPath = databaseUrl.replace('sqlite://', '');
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });

  const apiKeyService = new ApiKeyService(
    db,
    false,
    'test-encryption-key-32-characters',
  );

  try {
    const apiKeyResult = await apiKeyService.generateApiKey({
      hederaAccountId: accountId,
      name: 'E2E Test API Key',
      permissions,
    });

    return apiKeyResult.plainKey;
  } finally {
    sqlite.close();
  }
}

/**
 * Creates a test account with initial credits
 */
export async function setupTestAccount(
  baseUrl: string,
  accountId: string,
  initialCredits: number,
): Promise<void> {
  const logger = Logger.getInstance({ module: 'test-setup' });

  try {
    const balance = await callServerTool(baseUrl, 'check_credit_balance', {
      accountId,
    });
    logger.info('Initial balance check', { balance });

    if (initialCredits > 0) {
      const payment = {
        transactionId: `${accountId}@${Date.now()}.setup`,
        payerAccountId: accountId,
        hbarAmount: initialCredits / 100,
        memo: 'Test setup',
      };

      logger.info('Processing payment', { payment });
      const result = await callServerTool(
        baseUrl,
        'process_hbar_payment',
        payment,
      );
      logger.info('Payment processed', { result });

      const newBalance = await callServerTool(baseUrl, 'check_credit_balance', {
        accountId,
      });
      logger.info('Final balance check', { newBalance });
    }
  } catch (error) {
    logger.error('Failed to setup test account', { error });
    throw error;
  }
}

async function cleanup(server: HederaMCPServer): Promise<void> {
  const logger = Logger.getInstance({ module: 'test-cleanup' });

  try {
    logger.info('Stopping server');
    await server.stop();

    if (typeof global.gc === 'function') {
      logger.info('Running garbage collection');
      global.gc();
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    logger.info('Cleanup complete');
  } catch (error) {
    logger.error('Error during cleanup', { error });
  }
}
