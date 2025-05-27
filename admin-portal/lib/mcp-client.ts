import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Logger } from '@hashgraphonline/standards-sdk';

interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * MCP Client for communicating with the Hedera MCP Server
 */
export class MCPClient {
  private client: Client | null = null;
  private isConnected: boolean = false;
  private logger = new Logger({ module: 'MCPClient' });

  constructor(
    private serverUrl: string = process.env.NEXT_PUBLIC_MCP_SERVER_URL ||
      'http://localhost:3000/stream'
  ) {
    this.logger.info('MCPClient initialized', {
      serverUrl: this.serverUrl,
      envUrl: process.env.NEXT_PUBLIC_MCP_SERVER_URL,
      isSSR: typeof window === 'undefined'
    });
  }

  /**
   * Connects to the MCP server
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      this.logger.debug('Creating transport', { url: this.serverUrl });
      const transport = new StreamableHTTPClientTransport(
        new URL(this.serverUrl)
      );

      if (transport.onmessage) {
        const originalOnMessage = transport.onmessage;
        transport.onmessage = (msg) => {
          this.logger.debug('Transport message received', { message: msg });
          originalOnMessage(msg);
        };
      }

      if (transport.onerror) {
        const originalOnError = transport.onerror;
        transport.onerror = (err) => {
          this.logger.error('Transport error', { error: err });
          originalOnError(err);
        };
      }

      this.client = new Client(
        {
          name: 'hedera-admin-portal',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(transport);

      this.isConnected = true;
      this.logger.info('Connected to MCP server with streaming transport');
    } catch (error) {
      this.logger.error('Failed to connect to MCP server', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        serverUrl: this.serverUrl,
        transportType: 'StreamableHTTPClientTransport'
      });
      this.isConnected = false;
      this.client = null;
      throw error;
    }
  }

  /**
   * Calls a tool on the MCP server
   */
  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    this.logger.debug('Calling MCP tool', { toolName, args });

    if (!this.client || !this.isConnected) {
      this.logger.debug('Client not connected, connecting now');
      await this.connect();
    }

    try {
      const result = (await this.client!.callTool({
        name: toolName,
        arguments: args,
      })) as MCPToolResult;

      this.logger.debug('Tool result received', { toolName, result });

      if (result.content && result.content.length > 0) {
        const textContent = result.content.find((c) => c.type === 'text');
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent.text) as T;
            this.logger.debug('Tool result parsed', { toolName, parsed });
            return parsed;
          } catch {
            this.logger.debug('Tool returning raw text', { 
              toolName, 
              text: textContent.text 
            });
            return textContent.text as T;
          }
        }
      }

      this.logger.debug('Tool returning full result', { toolName, result });
      return result as T;
    } catch (error) {
      this.logger.error('Failed to call tool', { toolName, error });
      throw error;
    }
  }

  /**
   * Gets credit balance for an account
   */
  async getCreditBalance(accountId: string): Promise<{
    current: number;
    totalPurchased: number;
    totalConsumed: number;
  }> {
    const result = await this.callTool<{
      balance?: {
        current: number;
        totalPurchased: number;
        totalConsumed: number;
      };
    }>('check_credit_balance', { accountId });
    return (
      result.balance || { current: 0, totalPurchased: 0, totalConsumed: 0 }
    );
  }

  /**
   * Creates a payment transaction for purchasing credits
   */
  async createPaymentTransaction(
    payerAccountId: string,
    amount: number,
    memo?: string
  ): Promise<{
    transaction_bytes: string;
    transaction_id: string;
    amount_hbar: number;
    expected_credits: number;
    server_account_id: string;
  }> {
    return await this.callTool('create_payment_transaction', {
      payer_account_id: payerAccountId,
      amount,
      memo,
    });
  }

  /**
   * Verifies a payment transaction and allocates credits
   */
  async verifyPayment(transactionId: string): Promise<{
    success: boolean;
    status?: string;
    credits_allocated?: number;
    message: string;
  }> {
    return await this.callTool('verify_payment', {
      transaction_id: transactionId,
    });
  }

  /**
   * Checks payment status
   */
  async checkPaymentStatus(transactionId: string): Promise<{
    transaction_id: string;
    status: 'pending' | 'completed' | 'failed';
    credits_allocated?: number;
    timestamp?: string;
  }> {
    return await this.callTool('check_payment_status', {
      transaction_id: transactionId,
    });
  }

  /**
   * Gets payment history for an account
   */
  async getPaymentHistory(
    accountId: string,
    limit: number = 50
  ): Promise<{
    account_id: string;
    total_payments: number;
    payments: Array<{
      transaction_id: string;
      amount_hbar: number;
      credits_allocated: number;
      status: string;
      timestamp: string;
    }>;
  }> {
    return await this.callTool('get_payment_history', {
      account_id: accountId,
      limit,
    });
  }

  /**
   * Gets credit transaction history
   */
  async getCreditHistory(
    accountId: string,
    limit: number = 20
  ): Promise<{
    transactions: Array<{
      accountId: string;
      transactionType: 'purchase' | 'consumption';
      amount: number;
      balanceAfter: number;
      description?: string;
      relatedOperation?: string;
      createdAt: string;
    }>;
    count: number;
  }> {
    const result = await this.callTool<{
      transactions?: Array<{
        accountId: string;
        transactionType: 'purchase' | 'consumption';
        amount: number;
        balanceAfter: number;
        description?: string;
        relatedOperation?: string;
        createdAt: string;
      }>;
      count?: number;
    }>('get_credit_history', {
      accountId,
      limit,
    });
    return {
      transactions: result.transactions || [],
      count: result.count || 0,
    };
  }

  /**
   * Disconnects from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.close();
      } catch (error) {
        this.logger.error('Error closing MCP client', { error });
      }
      this.client = null;
      this.isConnected = false;
      this.logger.info('Disconnected from MCP server');
    }
  }
}

let mcpClient: MCPClient | null = null;

/**
 * Gets the singleton MCP client instance for communicating with the Hedera MCP Server via streaming HTTP transport
 * @returns {MCPClient} The singleton MCPClient instance configured with the MCP server URL
 */
export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    mcpClient = new MCPClient();
  }
  return mcpClient;
}

/**
 * Resets the MCP client instance by disconnecting the current client and clearing the singleton, useful for reconnecting or switching servers
 * @returns {Promise<void>} A promise that resolves when the client has been disconnected and reset
 */
export async function resetMCPClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.disconnect();
    mcpClient = null;
  }
}
