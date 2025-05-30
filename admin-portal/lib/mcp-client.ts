import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Logger } from '@hashgraphonline/standards-sdk';
import { TierPricing } from './pricing';

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
  private apiKey: string | null = null;

  constructor(
    private serverUrl: string = process.env.NEXT_PUBLIC_MCP_SERVER_URL ||
      'http://localhost:3000/stream',
  ) {
    this.logger.info('MCPClient initialized', {
      serverUrl: this.serverUrl,
      envUrl: process.env.NEXT_PUBLIC_MCP_SERVER_URL,
      isSSR: typeof window === 'undefined',
    });
  }

  /**
   * Set the API key for authentication
   * @param {string | null} apiKey - The API key to use for authentication
   * @returns {void}
   */
  setApiKey(apiKey: string | null): void {
    if (this.apiKey === apiKey) {
      return;
    }
    this.apiKey = apiKey;
    if (this.isConnected) {
      this.logger.debug('API key changed, disconnecting to force reconnection', {
        hadApiKey: !!this.apiKey,
        hasNewApiKey: !!apiKey,
      });
      this.isConnected = false;
      this.client = null;
    }
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Connects to the MCP server using streaming HTTP transport
   * @returns {Promise<void>} Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      this.logger.debug('Already connected, checking if API key matches', {
        hasClient: true,
        hasApiKey: !!this.apiKey,
      });
      return;
    }

    try {
      this.logger.debug('Creating transport', {
        url: this.serverUrl,
        hasApiKey: !!this.apiKey,
        apiKeyPrefix: this.apiKey ? this.apiKey.substring(0, 8) + '...' : null,
      });

      const requestInit: RequestInit = {};
      if (this.apiKey) {
        requestInit.headers = {
          Authorization: `Bearer ${this.apiKey}`,
        };
      }

      const transport = new StreamableHTTPClientTransport(
        new URL(this.serverUrl),
        {
          requestInit,
        },
      );

      this.client = new Client(
        {
          name: 'hedera-admin-portal',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await this.client.connect(transport);

      this.isConnected = true;
      this.logger.info('Connected to MCP server with streaming transport', {
        hasApiKey: !!this.apiKey,
      });
    } catch (error) {
      this.logger.error('Failed to connect to MCP server', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        serverUrl: this.serverUrl,
        transportType: 'StreamableHTTPClientTransport',
        hasApiKey: !!this.apiKey,
      });
      this.isConnected = false;
      this.client = null;
      throw error;
    }
  }

  /**
   * Calls a tool on the MCP server
   * @param {string} toolName - The name of the tool to call
   * @param {Record<string, unknown>} args - Arguments to pass to the tool
   * @returns {Promise<T>} The tool result
   */
  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    this.logger.debug('Calling MCP tool', { toolName, args });


    if (!this.isConnected || !this.client) {
      this.logger.debug('Client not connected, connecting now');
      await this.connect();
    }

    try {
      this.logger.debug('Attempting tool call', {
        toolName,
        isConnected: this.isConnected,
        hasClient: !!this.client,
        hasApiKey: !!this.apiKey,
        clientState: this.client ? 'exists' : 'null',
      });

      if (!this.client) {
        throw new Error('Client is null after connection attempt');
      }

      const result = (await this.client.callTool({
        name: toolName,
        arguments: args,
      })) as MCPToolResult;

      this.logger.debug('Tool result received', { toolName, result });

      if (result.content && result.content.length > 0) {
        const textContent = result.content.find(c => c.type === 'text');
        if (textContent) {
          try {
            const parsed = JSON.parse(textContent.text) as T;
            this.logger.debug('Tool result parsed', { toolName, parsed });
            return parsed;
          } catch {
            this.logger.debug('Tool returning raw text', {
              toolName,
              text: textContent.text,
            });
            return textContent.text as T;
          }
        }
      }

      this.logger.debug('Tool returning full result', { toolName, result });
      return result as T;
    } catch (error) {
      this.logger.error('Failed to call tool', { toolName, error });

      if (error instanceof Error && error.message.includes('Not connected')) {
        this.logger.warn('Connection lost, attempting to reconnect and retry');
        this.isConnected = false;
        this.client = null;

        try {
          await this.connect();
          const result = (await this.client!.callTool({
            name: toolName,
            arguments: args,
          })) as MCPToolResult;

          this.logger.debug('Tool result received after reconnect', {
            toolName,
            result,
          });

          if (result.content && result.content.length > 0) {
            const textContent = result.content.find(c => c.type === 'text');
            if (textContent) {
              try {
                const parsed = JSON.parse(textContent.text) as T;
                return parsed;
              } catch {
                return textContent.text as T;
              }
            }
          }

          return result as T;
        } catch (retryError) {
          this.logger.error('Failed to call tool after reconnect', {
            toolName,
            error: retryError,
          });
          throw retryError;
        }
      }

      throw error;
    }
  }

  /**
   * Gets credit balance for an account
   * @param {string} accountId - The Hedera account ID
   * @returns {Promise<{current: number, totalPurchased: number, totalConsumed: number}>} The credit balance information
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
   * @param {string} payerAccountId - The payer's Hedera account ID
   * @param {number} amount - The amount of HBAR to pay
   * @param {string} memo - Optional transaction memo
   * @returns {Promise<object>} Transaction details including bytes and ID
   */
  async createPaymentTransaction(
    payerAccountId: string,
    amount: number,
    memo?: string,
  ): Promise<{
    transaction_bytes: string;
    transaction_id: string;
    amount_hbar: number;
    expected_credits: number;
    server_account_id: string;
  }> {
    const result = await this.callTool<{
      transaction_bytes: string;
      transaction_id: string;
      amount_hbar: number;
      expected_credits: number;
      server_account_id: string;
    }>('purchase_credits', {
      payer_account_id: payerAccountId,
      amount,
      memo,
    });

    this.logger.info('Payment transaction result', {
      result,
      hasTransactionBytes: !!result.transaction_bytes,
      transactionBytesLength: result.transaction_bytes?.length,
    });

    return result;
  }

  /**
   * Verifies a payment transaction and allocates credits
   * @param {string} transactionId - The transaction ID to verify
   * @returns {Promise<{success: boolean, status?: string, credits_allocated?: number, message: string}>} Verification result
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
   * @param {string} transactionId - The transaction ID to check
   * @returns {Promise<{transaction_id: string, status: string, credits_allocated?: number, timestamp?: string}>} Payment status
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
   * @param {string} accountId - The Hedera account ID
   * @param {number} limit - Maximum number of records to return
   * @returns {Promise<object>} Payment history with transactions
   */
  async getPaymentHistory(
    accountId: string,
    limit: number = 50,
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

  async getPricingConfiguration(): Promise<{
    operations: Record<string, number>;
    tiers: TierPricing[];
    modifiers: Record<string, number>;
    currentHbarToUsdRate?: number;
  }> {
    return await this.callTool('get_pricing_configuration', {});
  }

  /**
   * Gets credit transaction history
   * @param {string} accountId - The Hedera account ID
   * @param {number} limit - Maximum number of records to return
   * @returns {Promise<{transactions: Array<object>, count: number}>} Credit transaction history
   */
  async getCreditHistory(
    accountId: string,
    limit: number = 20,
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
   * Gets the current connection status
   * @returns {boolean} True if connected, false otherwise
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnects from the MCP server
   * @returns {Promise<void>} Promise that resolves when disconnected
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
