import { StreamableHTTPClientTransport } from './mcp-client';
import { MCPAuthClient } from '../auth/mcp-auth-client';

interface AuthenticatedClientOptions {
  baseUrl: string;
  authClient: MCPAuthClient;
  onAuthError?: (error: Error) => void;
  onRotationNeeded?: () => void;
}

/**
 * Authenticated MCP client transport with automatic retry and key rotation
 */
export class AuthenticatedMCPClient extends StreamableHTTPClientTransport {
  private authClient: MCPAuthClient;
  private onAuthError?: (error: Error) => void;
  private onRotationNeeded?: () => void;
  private isRetrying = false;

  constructor(options: AuthenticatedClientOptions) {
    super(options.baseUrl);
    this.authClient = options.authClient;
    this.onAuthError = options.onAuthError;
    this.onRotationNeeded = options.onRotationNeeded;

    if (typeof window !== 'undefined') {
      window.addEventListener('mcp-auth:rotation-needed', this.handleRotationNeeded.bind(this));
    }
  }

  /**
   * Override fetch to add authentication headers
   * @param {RequestInfo | URL} input - The resource to fetch
   * @param {RequestInit} init - Fetch initialization options
   * @returns {Promise<Response>} The fetch response
   */
  protected async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const apiKey = this.authClient.getStoredApiKey();
    
    if (!apiKey) {
      const error = new Error('No API key available. Please authenticate first.');
      if (this.onAuthError) {
        this.onAuthError(error);
      }
      throw error;
    }

    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${apiKey}`);

    const modifiedInit: RequestInit = {
      ...init,
      headers,
    };

    try {
      const response = await super.fetch(input, modifiedInit);

      if (response.status === 401 && !this.isRetrying) {
        this.isRetrying = true;
        
        const retryResponse = await this.handleAuthError(input, init);
        this.isRetrying = false;
        return retryResponse;
      }

      return response;
    } catch (error) {
      this.isRetrying = false;
      throw error;
    }
  }

  /**
   * Handle authentication errors by checking for key rotation needs
   * @param {RequestInfo | URL} input - The resource being fetched
   * @param {RequestInit} init - Fetch initialization options
   * @returns {Promise<Response>} The fetch response after handling auth error
   */
  private async handleAuthError(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (this.authClient.shouldRotateKey()) {
      if (this.onRotationNeeded) {
        this.onRotationNeeded();
      }
      throw new Error('API key rotation needed');
    }

    const error = new Error('Authentication failed. Please re-authenticate.');
    if (this.onAuthError) {
      this.onAuthError(error);
    }
    throw error;
  }

  /**
   * Handle rotation needed event
   * @returns {void}
   */
  private handleRotationNeeded(): void {
    if (this.onRotationNeeded) {
      this.onRotationNeeded();
    }
  }

  /**
   * Get connection state
   * @returns {{isAuthenticated: boolean, needsRotation: boolean, apiKey: string | null}} Current connection state
   */
  getConnectionState(): {
    isAuthenticated: boolean;
    needsRotation: boolean;
    apiKey: string | null;
  } {
    const apiKey = this.authClient.getStoredApiKey();
    
    return {
      isAuthenticated: !!apiKey,
      needsRotation: this.authClient.shouldRotateKey(),
      apiKey,
    };
  }

  /**
   * Clean up resources and remove event listeners
   * @returns {void}
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mcp-auth:rotation-needed', this.handleRotationNeeded.bind(this));
    }
  }
}