import { ApiKeyService } from './api-key-service';
import { AnomalyDetector } from './anomaly-detector';
import { randomBytes } from 'crypto';

interface AuthContext {
  apiKeyId?: string;
  hederaAccountId?: string;
  permissions?: string[];
  rateLimit?: number;
  requestId?: string;
}

interface MCPError {
  code: number;
  message: string;
  data?: any;
}

/**
 * Middleware for authenticating MCP requests
 */
export class MCPAuthMiddleware {
  private apiKeyService: ApiKeyService;
  private anomalyDetector: AnomalyDetector | undefined;
  private sessionCache: Map<string, { context: AuthContext; expiry: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(apiKeyService: ApiKeyService, anomalyDetector?: AnomalyDetector | undefined) {
    this.apiKeyService = apiKeyService;
    this.anomalyDetector = anomalyDetector;
  }

  /**
   * Extract Bearer token from various header formats
   * @param headers - Request headers object
   * @returns The bearer token or null
   */
  extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
    const authHeader = headers.authorization || headers.Authorization || 
                      headers['x-api-key'] || headers['X-API-Key'];
    
    if (!authHeader) {
      return null;
    }

    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    
    if (!headerValue) {
      return null;
    }
    
    if (headerValue.startsWith('Bearer ')) {
      return headerValue.substring(7);
    }
    
    if (headerValue.startsWith('mcp_')) {
      return headerValue;
    }
    
    return null;
  }

  /**
   * Authenticate a request using Bearer token with caching
   * @param headers - Request headers
   * @returns Authentication context if valid, null otherwise
   */
  async authenticate(headers: Record<string, string | string[] | undefined>): Promise<AuthContext | null> {
    const apiKey = this.extractBearerToken(headers);
    
    if (!apiKey) {
      return null;
    }

    const cached = this.sessionCache.get(apiKey);
    if (cached && cached.expiry > Date.now()) {
      return { ...cached.context, requestId: this.generateRequestId() };
    }

    const keyDetails = await this.apiKeyService.verifyApiKey(apiKey);

    if (!keyDetails) {
      return null;
    }

    const context: AuthContext = {
      apiKeyId: keyDetails.id,
      hederaAccountId: keyDetails.hederaAccountId,
      permissions: keyDetails.permissions,
      rateLimit: keyDetails.rateLimit,
      requestId: this.generateRequestId(),
    };

    this.sessionCache.set(apiKey, {
      context,
      expiry: Date.now() + this.CACHE_TTL,
    });

    if (Math.random() < 0.01) {
      this.cleanupCache();
    }

    return context;
  }

  /**
   * Check if the authenticated user has the required permission
   * @param authContext - The authentication context
   * @param requiredPermission - The permission to check
   * @returns True if permission is granted, false otherwise
   */
  hasPermission(authContext: AuthContext, requiredPermission: string): boolean {
    if (!authContext.permissions) {
      return false;
    }

    return authContext.permissions.includes(requiredPermission) || 
           authContext.permissions.includes('admin');
  }

  /**
   * Generate a unique request ID for tracing
   * @returns A unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.sessionCache.entries()) {
      if (value.expiry < now) {
        this.sessionCache.delete(key);
      }
    }
  }

  /**
   * Create MCP-compliant error response
   * @param code - Error code
   * @param message - Error message
   * @param data - Additional error data
   * @returns MCP error object
   */
  createAuthError(code: number, message: string, data?: any): MCPError {
    return {
      code,
      message,
      data: {
        ...data,
        type: 'authentication_error',
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Log API usage for the authenticated request
   * @param authContext - The authentication context
   * @param endpoint - The API endpoint being accessed
   * @param method - The HTTP method
   * @param statusCode - The response status code
   * @param responseTimeMs - The response time in milliseconds
   * @param request - The request object for additional metadata
   */
  async logUsage(
    authContext: AuthContext,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    request?: any
  ): Promise<void> {
    if (!authContext.apiKeyId) {
      return;
    }

    await this.apiKeyService.logUsage({
      apiKeyId: authContext.apiKeyId,
      endpoint,
      method,
      statusCode,
      responseTimeMs,
      ipAddress: request?.ip,
      userAgent: request?.headers?.['user-agent'],
    });

    if (this.anomalyDetector && authContext.apiKeyId && authContext.hederaAccountId) {
      const anomalies = await this.anomalyDetector.analyzeUsage(
        authContext.apiKeyId,
        authContext.hederaAccountId
      );
      
      if (anomalies.length > 0) {
        await this.anomalyDetector.handleAnomalies(anomalies);
      }
    }
  }

  /**
   * Inject auth context into MCP session
   * @param session - MCP session object
   * @param authContext - Authentication context
   */
  injectAuthContext(session: any, authContext: AuthContext): void {
    session.auth = {
      accountId: authContext.hederaAccountId,
      permissions: authContext.permissions,
      requestId: authContext.requestId,
    };
  }
}