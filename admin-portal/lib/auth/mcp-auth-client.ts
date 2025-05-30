import { PrivateKey } from '@hashgraph/sdk';
import { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';

interface AuthChallenge {
  challengeId: string;
  challenge: string;
  expiresAt: string;
  network?: string;
}

interface AuthResponse {
  apiKey: string;
  keyId: string;
  expiresAt?: string;
  permissions: string[];
}

interface MCPAuthClientOptions {
  sdk: HashinalsWalletConnectSDK;
  apiBaseUrl?: string;
}

/**
 * MCP authentication client for browser environments
 */
export class MCPAuthClient {
  private sdk: HashinalsWalletConnectSDK;
  private apiBaseUrl: string;
  private apiKey: string | null = null;
  private keyExpiresAt: Date | null = null;
  private rotationCheckInterval: NodeJS.Timeout | null = null;
  private readonly DB_NAME = 'mcp-auth';
  private readonly STORE_NAME = 'credentials';

  constructor(options: MCPAuthClientOptions) {
    this.sdk = options.sdk;
    this.apiBaseUrl =
      options.apiBaseUrl ||
      process.env.NEXT_PUBLIC_AUTH_API_URL ||
      'http://localhost:3002';
    this.startRotationCheck();
  }

  /**
   * Initialize the auth client by loading stored API key
   */
  async initialize(): Promise<void> {
    await this.loadStoredApiKey();
  }

  /**
   * Authenticate using the wallet connect SDK
   * @param options - Additional options for API key generation
   * @returns The API key response
   */
  async authenticate(options?: {
    name?: string;
    permissions?: string[];
    expiresIn?: number;
  }): Promise<AuthResponse> {
    const accountInfo = this.sdk.getAccountInfo();
    if (!accountInfo) {
      throw new Error('No wallet connected');
    }

    const challenge = await this.requestChallenge(accountInfo.accountId);

    const timestamp = Date.now();
    const network =
      challenge.network || process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet';
    const message = this.createAuthMessage(
      challenge.challenge,
      timestamp,
      accountInfo.accountId,
      network,
    );

    const result = await this.sdk.signMessage(message);
    console.log('Wallet sign result:', result);

    const signatureData = result.userSignature;
    console.log('Signature data type:', typeof signatureData);
    console.log('Signature data:', signatureData);

    const signature = signatureData;
    const publicKey = '';

    const verifyParams = {
      challengeId: challenge.challengeId,
      hederaAccountId: accountInfo.accountId,
      signature,
      publicKey,
      timestamp,
      ...options,
    };

    console.log('Verify params being sent:', verifyParams);

    const response = await this.verifySignature(verifyParams);

    await this.storeApiKey(response.apiKey, response.expiresAt);
    return response;
  }

  /**
   * Authenticate using a private key (for server environments)
   * @param hederaAccountId - The Hedera account ID
   * @param privateKey - The private key for signing
   * @param options - Additional options for API key generation
   * @returns The API key response
   */
  async authenticateWithPrivateKey(
    hederaAccountId: string,
    privateKey: PrivateKey,
    options?: {
      name?: string;
      permissions?: string[];
      expiresIn?: number;
    },
  ): Promise<AuthResponse> {
    const challenge = await this.requestChallenge(hederaAccountId);

    const timestamp = Date.now();
    const network =
      challenge.network || process.env.NEXT_PUBLIC_HEDERA_NETWORK || 'testnet';
    const message = this.createAuthMessage(
      challenge.challenge,
      timestamp,
      hederaAccountId,
      network,
    );

    const messageBytes = new TextEncoder().encode(message);
    const signature = privateKey.sign(messageBytes);
    const publicKey = privateKey.publicKey;

    const response = await this.verifySignature({
      challengeId: challenge.challengeId,
      hederaAccountId,
      signature: Buffer.from(signature).toString('hex'),
      publicKey: publicKey.toString(),
      timestamp,
      ...options,
    });

    await this.storeApiKey(response.apiKey, response.expiresAt);
    return response;
  }

  /**
   * Request authentication challenge
   * @param hederaAccountId - The Hedera account ID
   * @returns The authentication challenge
   */
  private async requestChallenge(
    hederaAccountId: string,
  ): Promise<AuthChallenge> {
    const response = await fetch(`${this.apiBaseUrl}/api/v1/auth/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hederaAccountId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to request challenge');
    }

    return await response.json();
  }

  /**
   * Verify signature and get API key
   * @param params - Verification parameters
   * @returns The API key response
   */
  private async verifySignature(params: {
    challengeId: string;
    hederaAccountId: string;
    signature: string;
    publicKey: string;
    timestamp: number;
    name?: string;
    permissions?: string[];
    expiresIn?: number;
  }): Promise<AuthResponse> {
    const response = await fetch(`${this.apiBaseUrl}/api/v1/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to verify signature');
    }

    return await response.json();
  }

  /**
   * Create authentication message
   * @param challenge - The challenge string
   * @param timestamp - The timestamp
   * @param accountId - The Hedera account ID
   * @param network - The Hedera network
   * @returns The message to sign
   */
  private createAuthMessage(
    challenge: string,
    timestamp: number,
    accountId: string,
    network: string = 'testnet',
  ): string {
    return `Sign this message to authenticate with MCP Server\n\nChallenge: ${challenge}\nNonce: ${challenge}\nTimestamp: ${timestamp}\nAccount: ${accountId}\nNetwork: ${network}`;
  }

  /**
   * List API keys for the authenticated account
   * @returns {Promise<any[]>} List of API keys
   */
  async listApiKeys(): Promise<any[]> {
    if (!this.apiKey) {
      throw new Error('No API key available');
    }

    const response = await fetch(`${this.apiBaseUrl}/api/v1/auth/keys`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list API keys');
    }

    const data = await response.json();
    return data.keys;
  }

  /**
   * Revoke an API key
   * @param {string} keyId - The ID of the key to revoke
   * @returns {Promise<any>} Success response
   */
  async revokeApiKey(keyId: string): Promise<any> {
    if (!this.apiKey) {
      throw new Error('No API key available');
    }

    const response = await fetch(
      `${this.apiBaseUrl}/api/v1/auth/keys/${keyId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to revoke API key');
    }

    return await response.json();
  }

  /**
   * Get stored API key
   * @returns The stored API key or null
   */
  getStoredApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Check if API key needs rotation
   * @returns True if key should be rotated
   */
  shouldRotateKey(): boolean {
    if (!this.keyExpiresAt) return false;

    const now = new Date();
    const timeUntilExpiry = this.keyExpiresAt.getTime() - now.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    return timeUntilExpiry < oneDay;
  }

  /**
   * Rotate API key before expiry
   * @returns New API key response
   */
  async rotateApiKey(): Promise<AuthResponse> {
    if (!this.apiKey) {
      throw new Error('No API key to rotate');
    }

    const keys = await this.listApiKeys();
    const currentKey = keys.find(k => k.id === this.apiKey);

    if (!currentKey) {
      throw new Error('Current API key not found');
    }

    const newKeyResponse = await this.authenticate({
      name: `${currentKey.name || 'API Key'} (rotated)`,
      permissions: currentKey.permissions,
    });

    await this.revokeApiKey(currentKey.id);

    return newKeyResponse;
  }

  /**
   * Clear stored API key and disconnect wallet
   */
  async logout(): Promise<void> {
    this.apiKey = null;
    this.keyExpiresAt = null;

    const db = await this.openDB();
    const tx = db.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);

    store.delete('api_key');
    store.delete('api_key_expires');

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await this.sdk.disconnect();
  }

  /**
   * Open IndexedDB
   * @returns IDB database instance
   */
  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME);
        }
      };
    });
  }

  /**
   * Store API key in IndexedDB
   * @param apiKey - The API key to store
   * @param expiresAt - When the key expires
   */
  private async storeApiKey(apiKey: string, expiresAt?: string): Promise<void> {
    this.apiKey = apiKey;
    this.keyExpiresAt = expiresAt ? new Date(expiresAt) : null;

    const db = await this.openDB();
    const tx = db.transaction(this.STORE_NAME, 'readwrite');
    const store = tx.objectStore(this.STORE_NAME);

    const apiKeyRequest = store.put(apiKey, 'api_key');
    const expiresRequest = expiresAt
      ? store.put(expiresAt, 'api_key_expires')
      : null;

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Load API key from IndexedDB
   */
  private async loadStoredApiKey(): Promise<void> {
    try {
      const db = await this.openDB();
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const store = tx.objectStore(this.STORE_NAME);

      const apiKeyRequest = store.get('api_key');
      const expiresRequest = store.get('api_key_expires');

      const apiKey = await new Promise<string | undefined>(resolve => {
        apiKeyRequest.onsuccess = () => resolve(apiKeyRequest.result);
        apiKeyRequest.onerror = () => resolve(undefined);
      });

      const expiresAt = await new Promise<string | undefined>(resolve => {
        expiresRequest.onsuccess = () => resolve(expiresRequest.result);
        expiresRequest.onerror = () => resolve(undefined);
      });

      if (apiKey) {
        this.apiKey = apiKey;
        this.keyExpiresAt = expiresAt ? new Date(expiresAt) : null;

        if (this.keyExpiresAt && this.keyExpiresAt < new Date()) {
          console.log('API key expired, logging out:', this.keyExpiresAt);
          await this.logout();
        } else if (this.keyExpiresAt) {
          console.log('API key valid until:', this.keyExpiresAt);
        } else {
          console.log('API key has no expiration time (permanent)');
        }
      }
    } catch (error) {
      console.error('Failed to load stored API key:', error);
    }
  }

  /**
   * Start checking for key rotation needs
   * @returns {void}
   */
  private startRotationCheck(): void {
    if (typeof window !== 'undefined') {
      this.rotationCheckInterval = setInterval(
        () => {
          if (this.shouldRotateKey()) {
            window.dispatchEvent(new CustomEvent('mcp-auth:rotation-needed'));
          }
        },
        60 * 60 * 1000,
      );
    }
  }

  /**
   * Clean up resources and clear intervals
   * @returns {void}
   */
  destroy(): void {
    if (this.rotationCheckInterval) {
      clearInterval(this.rotationCheckInterval);
    }
  }
}
