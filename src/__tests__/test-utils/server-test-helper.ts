import { HederaMCPServer } from '../../server/fastmcp-server';
import { loadServerConfig } from '../../config/server-config';
import { Logger } from '@hashgraphonline/standards-sdk';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import fetch from 'node-fetch';

export interface TestServerEnvironment {
  server: HederaMCPServer;
  baseUrl: string;
  port: number;
  cleanup: () => Promise<void>;
}

/**
 * Starts a real FastMCP server for integration testing
 */
export async function startTestServer(options?: {
  port?: number;
  dbPath?: string;
  env?: Record<string, string>;
}): Promise<TestServerEnvironment> {
  const port = options?.port || 3999;
  const dbPath =
    options?.dbPath || path.join(os.tmpdir(), `test-mcp-${Date.now()}.db`);

  const testEnv = {
    ...process.env,
    PORT: String(port),
    FASTMCP_PORT: String(port),
    HTTP_API_PORT: String(port + 1),
    DATABASE_URL: `sqlite://${dbPath}`,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    MCP_TRANSPORT: 'http',
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

  const server = new HederaMCPServer(config, logger);

  logger.info('Initializing test server...');
  await server.initialize();

  logger.info('Starting test server...');
  await server.start();

  logger.info('Waiting for server to be ready...');
  await waitForServerReady(port);

  return {
    server,
    baseUrl: `http://localhost:${port + 1}`,
    port,
    cleanup: async () => {
      await server.stop();

      Object.assign(process.env, originalEnv);

      try {
        await fs.unlink(dbPath);
      } catch (error) {}
    },
  };
}

/**
 * Waits for the server to be ready to accept requests
 */
async function waitForServerReady(
  port: number,
  timeoutMs: number = 10000
): Promise<void> {
  const startTime = Date.now();
  const httpApiPort = port + 1;
  const logger = Logger.getInstance({
    level: 'info',
    module: 'wait-server',
    prettyPrint: false,
  });

  logger.info(`Waiting for server on port ${httpApiPort}...`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${httpApiPort}/health`);
      if (response.ok) {
        logger.info('Server is ready!');
        return;
      }
      logger.warn(`Health check returned ${response.status}`);
    } catch (error) {
      if ((Date.now() - startTime) % 1000 < 100) {
        logger.debug(
          `Waiting for server... (${Math.floor((Date.now() - startTime) / 1000)}s)`
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Server did not become ready in time');
}

/**
 * Makes a tool call to the test server via MCP protocol
 */
export async function callServerTool(
  baseUrl: string,
  toolName: string,
  args: Record<string, any> = {}
): Promise<any> {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tool call failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`MCP error: ${JSON.stringify(data.error)}`);
  }

  if (data.result?.content) {
    const content = data.result.content[0];
    if (content?.type === 'text' && content.text) {
      try {
        return JSON.parse(content.text);
      } catch {
        return { text: content.text };
      }
    }
  }

  return data.result;
}

/**
 * Creates a test account with initial credits
 */
export async function setupTestAccount(
  baseUrl: string,
  accountId: string,
  initialCredits: number
): Promise<void> {
  await callServerTool(baseUrl, 'check_credit_balance', { accountId });

  if (initialCredits > 0) {
    const payment = {
      transactionId: `${accountId}@${Date.now()}.setup`,
      payerAccountId: accountId,
      hbarAmount: initialCredits / 1000,
      creditsAllocated: initialCredits,
      memo: 'Test setup',
      status: 'COMPLETED',
    };

    await callServerTool(baseUrl, 'process_payment', payment);
  }
}
