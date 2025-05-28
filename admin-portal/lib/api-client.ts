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
 * Custom error class for authentication-related failures
 * Used when API requests fail due to missing or invalid authentication
 */
export class AuthenticationError extends Error {
  /**
   * Creates a new AuthenticationError instance
   * @param {string} message - The error message describing the authentication failure
   */
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * API client for interacting with the Hedera MCP Server HTTP API
 */
export class ApiClient {
  private baseUrl: string;
  private logger: Logger;
  private apiKey: string | null = null;

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
   * Set the API key for authenticated requests
   * @param apiKey The API key to use for authentication
   */
  setApiKey(apiKey: string | null): void {
    this.apiKey = apiKey;
  }

  /**
   * Get headers for API requests including authentication if available
   * @returns Headers object with Content-Type and optional Authorization
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Get server configuration including account details and conversion rates
   * @returns {Promise<ServerConfig>} Server configuration object with network and pricing details
   * @throws {Error} If the request fails or server is unreachable
   */
  async getServerConfig(): Promise<ServerConfig> {
    try {
      const response = await fetch(`${this.baseUrl}/api/credits/config`, {
        headers: this.getHeaders(),
      });
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
   * Get credit balance for a specific Hedera account
   * @param {string} accountId - The Hedera account ID to check balance for
   * @returns {Promise<CreditBalance>} Credit balance information including total purchased and consumed
   * @throws {AuthenticationError} If authentication is required but not provided
   * @throws {Error} If the request fails
   */
  async getCreditBalance(accountId: string): Promise<CreditBalance> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/credits/balance/${accountId}`,
        {
          headers: this.getHeaders(),
        }
      );
      if (response.status === 401) {
        throw new AuthenticationError('Authentication required');
      }
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
   * Get credit transaction history for a specific account
   * @param {string} accountId - The Hedera account ID to get history for
   * @param {number} limit - Maximum number of transactions to return (default: 20)
   * @returns {Promise<CreditTransaction[]>} Array of credit transactions ordered by date
   * @throws {AuthenticationError} If authentication is required but not provided
   * @throws {Error} If the request fails
   */
  async getCreditHistory(
    accountId: string,
    limit: number = 20
  ): Promise<CreditTransaction[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/credits/history/${accountId}?limit=${limit}`,
        {
          headers: this.getHeaders(),
        }
      );
      if (response.status === 401) {
        throw new AuthenticationError('Authentication required');
      }
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
   * Initiate a credit purchase with a Hedera transaction
   * @param {Object} params - Purchase parameters
   * @param {string} params.accountId - The purchasing account ID
   * @param {string} params.transactionId - The Hedera transaction ID
   * @param {number} params.hbarAmount - Amount of HBAR sent
   * @param {number} params.amount - Expected credit amount
   * @returns {Promise<Object>} Purchase response with success status and transaction details
   * @throws {Error} If the purchase initiation fails
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
        headers: this.getHeaders(),
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
   * Confirm a purchase by checking transaction status on the Hedera network
   * @param {string} transactionId - The Hedera transaction ID to confirm
   * @returns {Promise<Object>} Purchase status with completion details
   * @returns {('pending'|'completed'|'failed')} returns.status - Current transaction status
   * @returns {number} returns.amount - HBAR amount if completed
   * @returns {number} returns.creditsAllocated - Credits allocated if completed
   * @returns {string} returns.error - Error message if failed
   * @throws {Error} If the confirmation request fails
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
          headers: this.getHeaders(),
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
   * Create a Hedera transaction for purchasing credits
   * @param {string} payerAccountId - The account ID that will pay for credits
   * @param {number} amount - Amount of HBAR to send
   * @param {string} memo - Optional transaction memo
   * @returns {Promise<Object>} Transaction details ready for signing
   * @returns {string} returns.transaction_bytes - Serialized transaction bytes
   * @returns {string} returns.transaction_id - Transaction ID
   * @returns {number} returns.amount_hbar - HBAR amount
   * @returns {number} returns.expected_credits - Expected credits to receive
   * @returns {string} returns.server_account_id - Server account to send payment to
   * @returns {string} returns.memo - Transaction memo
   * @throws {Error} If transaction creation fails
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
          headers: this.getHeaders(),
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

  /**
   * Request authentication challenge from MCP server
   * @param hederaAccountId The Hedera account ID requesting authentication
   * @returns Authentication challenge details
   */
  async challenge(hederaAccountId: string): Promise<{
    challengeId: string;
    challenge: string;
    expiresAt: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/challenge`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ hederaAccountId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to request challenge: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to request auth challenge', { error });
      throw error;
    }
  }

  /**
   * Verify signature and authenticate with MCP server
   * @param params Authentication parameters including signature and challenge
   * @returns API key and authentication details
   */
  async authenticate(params: {
    challengeId: string;
    hederaAccountId: string;
    signature: string;
    publicKey: string;
    timestamp: number;
    name?: string;
    permissions?: string[];
    expiresIn?: number;
  }): Promise<{
    apiKey: string;
    keyId: string;
    expiresAt?: string;
    permissions: string[];
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/verify`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to authenticate: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to authenticate', { error });
      throw error;
    }
  }

  /**
   * Get API key information for authenticated user
   * @returns List of API keys
   */
  async getApiKey(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/keys`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to get API keys: ${response.statusText}`);
      }

      const data = await response.json();
      return data.keys;
    } catch (error) {
      this.logger.error('Failed to get API keys', { error });
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
