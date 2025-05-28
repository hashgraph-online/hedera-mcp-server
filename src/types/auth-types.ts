/**
 * Authentication context passed through the request
 */
export interface AuthContext {
  apiKeyId: string;
  hederaAccountId: string;
  permissions: string[];
  requestId: string;
}