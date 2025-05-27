import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { join } from 'path';
import fetch from 'node-fetch';

export interface MCPTestClient {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  cleanup: () => Promise<void>;
}

/**
 * Creates a test MCP client with specified transport
 */
export async function createTestMCPClient(
  transport: 'stdio' | 'http',
  serverPath?: string,
  env?: Record<string, string>
): Promise<MCPTestClient> {
  if (transport === 'stdio') {
    return createStdioClient(serverPath, env);
  } else {
    return createHttpClient(env);
  }
}

/**
 * Creates a STDIO transport MCP client
 */
async function createStdioClient(
  serverPath?: string,
  env?: Record<string, string>
): Promise<MCPTestClient> {
  const path = serverPath || join(process.cwd(), 'dist/index.js');

  const mergedEnv = Object.entries({ ...process.env, ...env }).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  const proc = spawn('node', [path], {
    env: mergedEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path],
    env: mergedEnv,
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );
  await client.connect(transport);

  return {
    client,
    transport,
    cleanup: async () => {
      await client.close();
      proc.kill();
    },
  };
}

/**
 * Creates an HTTP/SSE transport MCP client
 */
async function createHttpClient(
  env?: Record<string, string>
): Promise<MCPTestClient> {
  const baseUrl = env?.API_BASE_URL || 'http://localhost:3001';

  await waitForHttpServer(baseUrl);

  const transport = new SSEClientTransport(new URL(`${baseUrl}/sse`));
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );
  await client.connect(transport);

  return {
    client,
    transport,
    cleanup: async () => {
      await client.close();
    },
  };
}

/**
 * Waits for MCP client to be ready
 */
export async function waitForMCPReady(
  client: Client,
  timeoutMs: number = 10000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await client.listTools();
      if (response.tools && response.tools.length > 0) {
        return;
      }
    } catch (error) {
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('MCP client did not become ready in time');
}

/**
 * Invokes a tool on the MCP client
 */
export async function invokeTool(
  client: Client,
  toolName: string,
  params: any
): Promise<any> {
  const response = await client.callTool({
    name: toolName,
    arguments: params,
  });

  if (response.isError) {
    throw new Error(`Tool invocation failed: ${response.text}`);
  }

  return response.content;
}

/**
 * Lists available tools
 */
export async function listTools(client: Client): Promise<string[]> {
  const response = await client.listTools();
  return response.tools.map((tool) => tool.name);
}

/**
 * Waits for HTTP server to be ready
 */
async function waitForHttpServer(
  baseUrl: string,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      continue;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('HTTP server did not become ready in time');
}

/**
 * Creates environment variables for test MCP server
 */
export function createTestMCPEnv(
  overrides?: Record<string, string>
): Record<string, string> {
  return {
    DATABASE_URL: ':memory:',
    DATABASE_TYPE: 'sqlite',
    HBAR_TO_CREDITS_RATIO: '100000000',
    MIN_PAYMENT_AMOUNT: '10000000',
    MAX_PAYMENT_AMOUNT: '100000000000',
    PAYMENT_ACCOUNT_ID: '0.0.999999',
    MIRROR_NODE_URL: 'https://testnet.mirrornode.hedera.com',
    LOG_LEVEL: 'error',
    ...overrides,
  };
}
