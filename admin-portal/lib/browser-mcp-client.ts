import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Logger } from '@hashgraphonline/standards-sdk';

/**
 * Browser-compatible MCP Client
 */
export class BrowserMCPClient {
  private sessionId: string | null = null;
  private serverUrl: string;
  private logger = new Logger({ module: 'BrowserMCPClient' });

  constructor(serverUrl: string = 'http://localhost:3000/stream') {
    this.serverUrl = serverUrl;
    this.logger.info('BrowserMCPClient initialized', {
      serverUrl: this.serverUrl,
    });
  }

  /**
   * Connect using manual session management for browser compatibility
   */
  async connect(): Promise<void> {
    if (this.sessionId) {
      this.logger.debug('Already connected with session', {
        sessionId: this.sessionId,
      });
      return;
    }

    try {
      this.logger.debug('Initializing MCP session');

      const initResponse = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'hedera-admin-portal',
              version: '1.0.0',
            },
          },
          jsonrpc: '2.0',
          id: 0,
        }),
      });

      if (!initResponse.ok) {
        throw new Error(
          `Initialize failed: ${initResponse.status} ${initResponse.statusText}`
        );
      }

      this.sessionId = initResponse.headers.get('mcp-session-id');
      this.logger.debug('Session ID from header', {
        sessionId: this.sessionId,
      });

      if (!this.sessionId) {
        const responseText = await initResponse.text();
        this.logger.debug('Initialize response', { response: responseText });
        throw new Error('No session ID received from server');
      }

      this.logger.info('Connected with session ID', {
        sessionId: this.sessionId,
      });
    } catch (error) {
      this.logger.error('Failed to connect', { error });
      throw error;
    }
  }

  /**
   * Call a tool using manual session management
   */
  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.sessionId) {
      await this.connect();
    }

    this.logger.debug('Calling tool', {
      toolName,
      sessionId: this.sessionId,
      args,
    });

    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'mcp-session-id': this.sessionId!,
        },
        body: JSON.stringify({
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
          jsonrpc: '2.0',
          id: Date.now(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tool call failed: ${response.status} ${errorText}`);
      }

      const responseText = await response.text();
      this.logger.debug('Tool raw response', {
        toolName,
        response: responseText,
      });

      const result = JSON.parse(responseText);

      if (result.error) {
        throw new Error(`Tool error: ${result.error.message}`);
      }

      if (result.result?.content?.length > 0) {
        const textContent = result.result.content.find(
          (c: { type: string }) => c.type === 'text'
        );
        if (textContent) {
          try {
            return JSON.parse(textContent.text) as T;
          } catch {
            return textContent.text as T;
          }
        }
      }

      return result.result as T;
    } catch (error) {
      this.logger.error('Failed to call tool', { toolName, error });
      throw error;
    }
  }

  /**
   * Disconnect and clear session
   */
  async disconnect(): Promise<void> {
    if (this.sessionId) {
      try {
        await fetch(this.serverUrl, {
          method: 'DELETE',
          headers: {
            'mcp-session-id': this.sessionId,
          },
        });
      } catch (error) {
        this.logger.error('Error disconnecting', { error });
      }
      this.sessionId = null;
      this.logger.info('Disconnected from MCP server');
    }
  }

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
}

let browserMCPClient: BrowserMCPClient | null = null;

/**
 * Gets the singleton browser-compatible MCP client instance for communicating with the Hedera MCP Server
 * @returns {BrowserMCPClient} The singleton BrowserMCPClient instance configured with the MCP server URL
 */
export function getMCPClient(): BrowserMCPClient {
  if (!browserMCPClient) {
    const serverUrl =
      process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'http://localhost:3000/stream';
    browserMCPClient = new BrowserMCPClient(serverUrl);
  }
  return browserMCPClient;
}

/**
 * Resets the browser MCP client instance by disconnecting the current client and clearing the singleton
 * @returns {Promise<void>} A promise that resolves when the client has been disconnected and reset
 */
export async function resetMCPClient(): Promise<void> {
  if (browserMCPClient) {
    await browserMCPClient.disconnect();
    browserMCPClient = null;
  }
}
