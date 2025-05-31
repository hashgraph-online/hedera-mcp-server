import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';
import { ApiKeyService } from '../auth/api-key-service';

/**
 * Get API keys for authenticated account
 *
 * Retrieves all API keys associated with a Hedera account. Returns sanitized
 * key information without exposing the actual key values for security.
 *
 * @param params Object containing the account ID
 * @param params.hederaAccountId The Hedera account ID to retrieve keys for
 * @returns JSON response with API keys list or error information
 */
export function createGetApiKeysTool(
  apiKeyService: ApiKeyService | null,
  logger: Logger,
) {
  return {
    name: 'get_api_keys',
    description: 'Get API keys for authenticated account',
    parameters: z.object({
      hederaAccountId: z
        .string()
        .describe('The Hedera account ID to retrieve keys for'),
    }),
    async execute(params: { hederaAccountId: string }) {
      if (!apiKeyService) {
        return JSON.stringify({
          error: 'API key service not initialized',
          keys: [],
        });
      }

      try {
        const keys = await apiKeyService.getApiKeysByAccount(
          params.hederaAccountId,
        );
        const sanitizedKeys = keys.map((key: any) => ({
          id: key.id,
          name: key.name,
          permissions: key.permissions,
          createdAt: key.created_at || key.createdAt,
          lastUsedAt: key.last_used_at || key.lastUsedAt,
          expiresAt: key.expires_at || key.expiresAt,
          isActive: key.is_active !== undefined ? key.is_active : key.isActive,
        }));

        return JSON.stringify({
          keys: sanitizedKeys,
        });
      } catch (error) {
        logger.error('Failed to get API keys', { error });
        return JSON.stringify({
          error: 'Failed to retrieve API keys',
          keys: [],
        });
      }
    },
  };
}
