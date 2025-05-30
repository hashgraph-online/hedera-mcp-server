import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import fetch from 'node-fetch';
import { Logger } from '@hashgraphonline/standards-sdk';
import { PortManager } from '../test-utils/port-manager';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface TransportOptions {
  type: 'stdio' | 'http';
  port?: number;
  env?: Record<string, string>;
  apiKey?: string;
}
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
export class MCPTransportClient {
  private process: ChildProcess | null = null;
  private logger: Logger;
  private buffer = '';
  private messageQueue: MCPMessage[] = [];
  private responseHandlers = new Map<
    string | number,
    {
      resolve: (result: any) => void;
      reject: (error: any) => void;
    }
  >();
  private messageId = 1;
  private mcpClient: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  constructor(
    private options: TransportOptions,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  setApiKey(apiKey: string): void {
    this.options.apiKey = apiKey;
    if (this.mcpClient) {
      this.mcpClient.close();
      this.mcpClient = null;
      this.transport = null;
    }
  }

  async start(): Promise<void> {
    if (this.options.type === 'stdio') {
      await this.startStdioTransport();
    } else {
      await this.startHttpTransport();
    }
  }
  private async startStdioTransport(): Promise<void> {
    const serverPath = path.join(__dirname, '../../index.ts');
    console.log('Starting STDIO server at:', serverPath);
    const env = {
      ...process.env,
      MCP_TRANSPORT: 'stdio',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      DISABLE_LOGS: 'true',
      ...this.options.env,
    };
    console.log('Environment:', {
      MCP_TRANSPORT: env.MCP_TRANSPORT,
      DISABLE_LOGS: env.DISABLE_LOGS,
    });
    this.process = spawn('npx', ['tsx', serverPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create stdio pipes');
    }
    this.process.stdout.on('data', (data: Buffer) => {
      this.handleStdioData(data.toString());
    });
    this.process.stderr?.on('data', (data: Buffer) => {
      const errorMsg = data.toString();
      this.logger.error('Server stderr:', errorMsg);
      console.error('STDIO Server Error:', errorMsg);
    });
    this.process.on('error', error => {
      this.logger.error('Server process error:', { error });
    });
    this.process.on('exit', (code, signal) => {
      this.logger.info('Server process exited', { code, signal });
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.waitForReady();
  }
  private async startHttpTransport(): Promise<void> {
    const port = this.options.port || PortManager.getPort();
    const serverPath = path.join(__dirname, '../../index.ts');
    const env = {
      ...process.env,
      MCP_TRANSPORT: 'http',
      PORT: port.toString(),
      FASTMCP_PORT: port.toString(),
      HTTP_API_PORT: (port + 1).toString(),
      AUTH_API_PORT: (port + 2).toString(),
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      DISABLE_LOGS: 'true',
      REQUIRE_AUTH: 'true',
      ...this.options.env,
    };
    this.process = spawn('npx', ['tsx', serverPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (this.process.stdout) {
      this.process.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        this.logger.debug('Server stdout:', { output });
        if (output.includes('ERROR') || output.includes('Failed')) {
          this.logger.error('Server error detected:', { output });
        }
      });
    }

    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        const errorMsg = data.toString();
        this.logger.error('Server stderr:', errorMsg);
        console.error('HTTP Server stderr:', errorMsg);
        if (
          errorMsg.includes('Cannot find module') ||
          errorMsg.includes('Error:')
        ) {
          console.error('CRITICAL ERROR DETECTED:', errorMsg);
        }
      });
    }

    this.process.on('error', error => {
      this.logger.error('Failed to start server process', { error });
    });

    this.process.on('exit', (code, signal) => {
      this.logger.info('HTTP server process exited', { code, signal });
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.waitForHttpReady(port);
  }
  private handleStdioData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line) as MCPMessage;
          this.handleMessage(message);
        } catch (error) {
          if (
            !line.includes('[2025-') &&
            !line.includes('INFO') &&
            !line.includes('ERROR') &&
            !line.includes('WARNING')
          ) {
            console.error('UNPARSEABLE LINE:', line.substring(0, 200));
          }
        }
      }
    }
  }
  private handleMessage(message: MCPMessage): void {
    console.log('PARSED MESSAGE:', JSON.stringify(message).substring(0, 200));
    if (message.id && (message.result !== undefined || message.error)) {
      const handler = this.responseHandlers.get(message.id);
      if (handler) {
        if (message.error) {
          handler.reject(new Error(message.error.message));
        } else {
          console.log(
            'RESOLVING RESULT:',
            message.id,
            typeof message.result,
            JSON.stringify(message.result).substring(0, 100),
          );
          handler.resolve(message.result);
        }
        this.responseHandlers.delete(message.id);
      }
    } else if (message.method) {
      this.messageQueue.push(message);
    }
  }
  async sendRequest(method: string, params?: any): Promise<any> {
    const id = this.messageId++;
    const request: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    if (this.options.type === 'stdio') {
      return this.sendStdioRequest(request);
    } else {
      return this.sendHttpRequest(request);
    }
  }
  private async sendStdioRequest(request: MCPMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Server not started'));
        return;
      }
      this.responseHandlers.set(request.id!, { resolve, reject });
      const timeout = setTimeout(() => {
        this.responseHandlers.delete(request.id!);
        reject(new Error('Request timeout'));
      }, 30000);
      this.responseHandlers.get(request.id!)!.resolve = result => {
        clearTimeout(timeout);
        resolve(result);
      };
      this.responseHandlers.get(request.id!)!.reject = error => {
        clearTimeout(timeout);
        reject(error);
      };
      const requestStr = JSON.stringify(request);
      this.logger.debug('Sending STDIO request:', { request, requestStr });
      this.process.stdin.write(requestStr + '\n');
    });
  }
  private async sendHttpRequest(request: MCPMessage): Promise<any> {
    const port = this.options.port || PortManager.getPort();
    const url = `http://localhost:${port}/stream`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('HTTP request timeout'));
      }, 30000);

      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
      })
        .then(async response => {
          clearTimeout(timeout);

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const contentType = response.headers.get('content-type');
          if (contentType?.includes('text/event-stream')) {
            const text = await response.text();
            const lines = text.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.id === request.id) {
                    if (data.error) {
                      throw new Error(data.error.message);
                    }
                    return resolve(data.result);
                  }
                } catch (e) {
                  continue;
                }
              }
            }
            throw new Error('No matching response found in SSE stream');
          } else {
            const result = (await response.json()) as MCPMessage;
            if (result.error) {
              throw new Error(result.error.message);
            }
            resolve(result.result);
          }
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }
  async listTools(): Promise<any> {
    return this.sendRequest('tools/list');
  }
  async getServerInfo(): Promise<any> {
    return this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });
  }
  private async waitForReady(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        console.log(`WAIT FOR READY: Attempt ${i + 1}/${maxAttempts}`);
        await this.getServerInfo();
        this.logger.info('Server is ready');
        console.log('SERVER IS READY!');
        return;
      } catch (error) {
        console.log(`WAIT FOR READY ERROR:`, (error as Error).message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Server failed to start');
  }
  private async waitForHttpReady(
    port: number,
    maxAttempts = 30,
  ): Promise<void> {
    const startTime = Date.now();
    let lastError: any = null;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const requestInit: RequestInit = {};
        if (this.options.apiKey) {
          requestInit.headers = {
            Authorization: `Bearer ${this.options.apiKey}`,
          };
        }

        const transport = new StreamableHTTPClientTransport(
          new URL(`http://localhost:${port}/stream`),
          { requestInit }
        );

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

        this.logger.info('HTTP server is ready', { port, attempt: i + 1 });
        await client.close();
        return;
      } catch (error: any) {
        lastError = error.message;
        if (i === 0 || i % 5 === 0) {
          this.logger.debug(
            `Waiting for server... (attempt ${i + 1}/${maxAttempts}): ${error.message}`,
          );
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const elapsed = Date.now() - startTime;
    const errorDetails = lastError ? ` Last error: ${lastError}` : '';
    throw new Error(
      `HTTP server failed to start after ${elapsed}ms (port ${port}).${errorDetails}`,
    );
  }
  async stop(): Promise<void> {
    if (this.mcpClient) {
      try {
        await this.mcpClient.close();
      } catch (error) {
        this.logger.debug('Error closing MCP client:', error);
      }
      this.mcpClient = null;
      this.transport = null;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise<void>(resolve => {
        if (!this.process) {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL');
          resolve();
        }, 5000);
        this.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      this.process = null;
    }
  }
  getMessages(): MCPMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }

  async getServerInfo(): Promise<any> {
    if (this.options.type === 'http') {
      const result = await this.callToolHTTP('get_server_info', {});
      return { serverInfo: result };
    } else {
      return this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });
    }
  }

  async listTools(): Promise<any> {
    if (this.options.type === 'http') {
      if (!this.mcpClient) {
        await this.connectHTTPClient();
      }
      const tools = await this.mcpClient!.listTools();
      if (tools && typeof tools === 'object' && 'tools' in tools) {
        return tools;
      }
      return { tools };
    } else {
      return this.sendRequest('tools/list', {});
    }
  }

  async callTool(
    toolName: string,
    args: Record<string, any> = {},
  ): Promise<any> {
    if (this.options.type === 'http') {
      return this.callToolHTTP(toolName, args);
    } else {
      const response = await this.sendRequest('tools/call', {
        name: toolName,
        arguments: args,
      });
      if (response.content && response.content.length > 0) {
        const textContent = response.content.find(
          (c: any) => c.type === 'text',
        );
        if (textContent) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }
      return response;
    }
  }

  private async connectHTTPClient(): Promise<void> {
    const port = this.options.port || PortManager.getPort();

    const requestInit: RequestInit = {};
    if (this.options.apiKey) {
      requestInit.headers = {
        Authorization: `Bearer ${this.options.apiKey}`,
      };
    }

    this.transport = new StreamableHTTPClientTransport(
      new URL(`http://localhost:${port}/stream`),
      { requestInit }
    );

    this.mcpClient = new Client(
      {
        name: 'test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    await this.mcpClient.connect(this.transport);
  }

  private async callToolHTTP(
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!this.mcpClient) {
      await this.connectHTTPClient();
    }

    const result = await this.mcpClient!.callTool({
      name: toolName,
      arguments: args,
    });

    if (result.content && result.content.length > 0) {
      const textContent = result.content.find(c => c.type === 'text');
      if (textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return textContent.text;
        }
      }
    }

    return result;
  }
}
