import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import fetch from 'node-fetch';
import { Logger } from '@hashgraphonline/standards-sdk';

export interface TransportOptions {
  type: 'stdio' | 'http';
  port?: number;
  env?: Record<string, string>;
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
  constructor(
    private options: TransportOptions,
    logger: Logger
  ) {
    this.logger = logger;
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
    const env = {
      ...process.env,
      MCP_TRANSPORT: 'stdio',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ...this.options.env,
    };
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
      this.logger.error('Server stderr:', { data: data.toString() });
    });
    this.process.on('error', (error) => {
      this.logger.error('Server process error:', { error });
    });
    this.process.on('exit', (code, signal) => {
      this.logger.info('Server process exited', { code, signal });
    });
    await this.waitForReady();
  }
  private async startHttpTransport(): Promise<void> {
    const port = this.options.port || 3000;
    const serverPath = path.join(__dirname, '../../index.ts');
    const env = {
      ...process.env,
      MCP_TRANSPORT: 'http',
      PORT: port.toString(),
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      ...this.options.env,
    };
    this.process = spawn('npx', ['tsx', serverPath], {
      env,
      stdio: 'inherit',
    });
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
          this.logger.error('Failed to parse message', { line, error });
        }
      }
    }
  }
  private handleMessage(message: MCPMessage): void {
    if (message.id && (message.result !== undefined || message.error)) {
      const handler = this.responseHandlers.get(message.id);
      if (handler) {
        if (message.error) {
          handler.reject(new Error(message.error.message));
        } else {
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
      this.responseHandlers.get(request.id!)!.resolve = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };
      this.responseHandlers.get(request.id!)!.reject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }
  private async sendHttpRequest(request: MCPMessage): Promise<any> {
    const port = this.options.port || 3000;
    const response = await fetch(`http://localhost:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });
    const result = (await response.json()) as MCPMessage;
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.result;
  }
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }
  async listTools(): Promise<any> {
    return this.sendRequest('tools/list');
  }
  async getServerInfo(): Promise<any> {
    return this.sendRequest('initialize', {
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });
  }
  private async waitForReady(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.getServerInfo();
        this.logger.info('Server is ready');
        return;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Server failed to start');
  }
  private async waitForHttpReady(
    port: number,
    maxAttempts = 30
  ): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const socket = new net.Socket();
        await new Promise<void>((resolve, reject) => {
          socket.connect(port, 'localhost', () => {
            socket.end();
            resolve();
          });
          socket.on('error', reject);
          socket.setTimeout(1000, () => {
            socket.destroy();
            reject(new Error('Connection timeout'));
          });
        });
        this.logger.info('HTTP server is ready', { port });
        return;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error('HTTP server failed to start');
  }
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
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
}
