import { Logger } from '@hashgraphonline/standards-sdk';

interface CreditBalance {
  balance: number;
  totalPurchased: number;
  totalConsumed: number;
  updatedAt?: string;
}

interface CreditTransaction {
  accountId: string;
  transactionType: 'purchase' | 'consumption';
  amount: number;
  balanceAfter: number;
  description?: string;
  relatedOperation?: string;
  createdAt: string;
}

interface ServerConfig {
  serverAccountId: string;
  network: string;
  conversionRate: number;
  minimumPayment: number;
  maximumPayment: number;
}

/**
 * API client for interacting with the Hedera MCP Server HTTP API
 */
export class ApiClient {
  private baseUrl: string;
  private logger: Logger;

  constructor(
    baseUrl: string = process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:3002'
  ) {
    this.baseUrl = baseUrl;
    this.logger = Logger.getInstance({
      level: 'info',
      module: 'ApiClient',
    });
  }

  /**
   * Get server configuration
   */
  async getServerConfig(): Promise<ServerConfig> {
    try {
      const response = await fetch(`${this.baseUrl}/api/credits/config`);
      if (!response.ok) {
        throw new Error(`Failed to get server config: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error('Failed to get server config', { error });
      throw error;
    }
  }

  /**
   * Get credit balance for an account
   */
  async getCreditBalance(accountId: string): Promise<CreditBalance> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/credits/balance/${accountId}`
      );
      if (!response.ok) {
        throw new Error(`Failed to get balance: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error('Failed to get credit balance', { error, accountId });
      throw error;
    }
  }

  /**
   * Get credit transaction history
   */
  async getCreditHistory(
    accountId: string,
    limit: number = 20
  ): Promise<CreditTransaction[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/credits/history/${accountId}?limit=${limit}`
      );
      if (!response.ok) {
        throw new Error(`Failed to get history: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error('Failed to get credit history', { error, accountId });
      throw error;
    }
  }

  /**
   * Initiate a credit purchase
   */
  async initiatePurchase(params: {
    accountId: string;
    transactionId: string;
    hbarAmount: number;
    amount: number;
  }): Promise<{
    success: boolean;
    message: string;
    transactionId: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/credits/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error || `Failed to initiate purchase: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to initiate purchase', { error, params });
      throw error;
    }
  }

  /**
   * Confirm a purchase by checking transaction status
   */
  async confirmPurchase(transactionId: string): Promise<{
    status: 'pending' | 'completed' | 'failed';
    amount?: number;
    creditsAllocated?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/credits/purchase/confirm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transactionId }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to confirm purchase: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to confirm purchase', { error, transactionId });
      throw error;
    }
  }

  /**
   * Get Hedera transaction for purchasing credits
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
    memo: string;
  }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/credits/create-payment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payerAccountId,
            amount,
            memo,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.error ||
            `Failed to create payment transaction: ${response.statusText}`
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to create payment transaction', { error });
      throw error;
    }
  }
}

let apiClient: ApiClient | null = null;

/**
 * Gets the singleton API client instance for interacting with the Hedera MCP Server HTTP API
 * @returns {ApiClient} The singleton ApiClient instance configured with the appropriate base URL
 */
export function getApiClient(): ApiClient {
  if (!apiClient) {
    apiClient = new ApiClient();
  }
  return apiClient;
}
