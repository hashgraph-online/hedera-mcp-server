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
import fetch from 'node-fetch';

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

  const port = options?.port || PortManager.getPort('test-server');

  const databaseUrl =
    options?.env?.DATABASE_URL ||
    `sqlite://${options?.dbPath || path.join(os.tmpdir(), `test-mcp-${Date.now()}-${Math.random().toString(36).substring(7)}.db`)}`;

  const testEnv = {
    ...process.env,
    PORT: String(port),
    FASTMCP_PORT: String(port),
    AUTH_API_PORT: String(port + 2),
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DISABLE_LOGS: 'true',
    MCP_TRANSPORT: 'http',
    REQUIRE_AUTH: options?.env?.REQUIRE_AUTH || 'false',
    API_KEY_ENCRYPTION_KEY: 'test-encryption-key-32-characters',
    DATABASE_URL: databaseUrl,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'sk-test-key-for-testing',
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

  let sqlite: Database.Database | null = null;
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

  try {
    logger.info('Initializing test server...');
    await server.initialize();

    logger.info('Starting test server...');
    await server.start();

    logger.info('Server start completed');
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }

  const baseUrl = `http://localhost:${port}`;
  const streamUrl = `http://localhost:${port}/stream`;
  logger.info('Server ports configured', {
    fastmcpPort: port,
    authApiPort: port + 2,
    streamUrl,
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  const waitPromises = [];

  const requireAuth = testEnv.REQUIRE_AUTH === 'true';
  waitPromises.push(waitForServer(streamUrl, 30000, requireAuth));

  try {
    await Promise.all(waitPromises);
    logger.info('All services ready');
  } catch (error) {
    logger.error('Failed to start all services', {
      error: (error as Error).message,
    });
    throw error;
  }

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


async function waitForServer(
  streamUrl: string,
  timeout = 30000,
  requireAuth = false,
): Promise<void> {
  const logger = Logger.getInstance({ module: 'wait-server', level: 'error' });
  const startTime = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(streamUrl, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        timeout: 5000,
      } as any);

      if (response.status === 200 || response.status === 204) {
        logger.info('Server is ready', { streamUrl });
        return;
      } else if (requireAuth && (response.status === 400 || response.status === 401)) {
        logger.info('Server is ready (auth required)', { streamUrl, status: response.status });
        return;
      }

      if (response.status === 400 || response.status === 404) {
        const text = await response.text();
        logger.warn('Server returned error', {
          status: response.status,
          statusText: response.statusText,
          body: text.substring(0, 200),
        });
      }

      lastError = new Error(
        `Server returned status ${response.status}: ${response.statusText}`,
      );
    } catch (error: any) {
      lastError = error;
      if (error.code === 'ECONNREFUSED') {
        logger.debug('Server not ready yet, retrying...');
      } else if (error.name === 'AbortError') {
        logger.debug('Request timeout');
      } else {
        logger.debug('Connection error', {
          error: error.message,
          code: error.code,
          name: error.name,
        });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  try {
    const finalResponse = await fetch(streamUrl, { method: 'GET' });
    logger.error('Final attempt response', {
      status: finalResponse.status,
      statusText: finalResponse.statusText,
      headers: finalResponse.headers.raw(),
      url: streamUrl,
    });
    const body = await finalResponse.text();
    logger.error('Response body', { body: body.substring(0, 500) });
  } catch (finalError) {
    logger.error('Final attempt failed', { error: finalError });
  }

  const errorMessage = lastError
    ? `Server did not become ready within ${timeout}ms: ${lastError.message}`
    : `Server did not become ready within ${timeout}ms`;
  throw new Error(errorMessage);
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
      const streamUrl = baseUrl + '/stream';

      const requestInit: RequestInit = {};
      if (apiKey) {
        requestInit.headers = {
          Authorization: `Bearer ${apiKey}`,
        };
      }

      let client: any = null;
      let transport: any = null;

      try {
        transport = new StreamableHTTPClientTransport(
          new URL(streamUrl),
          { requestInit }
        );
        
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
          name: toolName,
          arguments: args,
        });

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
      } finally {
        if (client) {
          try {
            await client.close();
          } catch (error) {
            console.debug('Error closing client:', error);
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('MCP Tool Call Error:', error);
      console.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      reject(
        new Error(
          `Tool call '${toolName}' failed: ${(error as Error).message}`,
        ),
      );
    }
  });
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
