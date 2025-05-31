import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';
import { ApiKeyService } from '../auth/api-key-service';

/**
 * Rotate an API key for the authenticated account
 *
 * Creates a new API key with the same permissions as the old key and revokes
 * the old key. The old key becomes inactive immediately and the new key
 * inherits all the same properties and permissions.
 *
 * @param params Object containing the key ID to rotate
 * @param params.keyId The ID of the API key to rotate
 * @param params.hederaAccountId The Hedera account ID that owns the key
 * @returns JSON response with new API key details or error information
 */
export function createRotateApiKeyTool(
  apiKeyService: ApiKeyService | null,
  logger: Logger,
) {
  return {
    name: 'rotate_api_key',
    description: 'Rotate an API key for the authenticated account',
    parameters: z.object({
      keyId: z.string().describe('The ID of the API key to rotate'),
      hederaAccountId: z
        .string()
        .describe('The Hedera account ID that owns the key'),
    }),
    async execute(params: { keyId: string; hederaAccountId: string }) {
      if (!apiKeyService) {
        return JSON.stringify({
          error: 'API key service not initialized',
          apiKey: null,
          keyId: null,
          expiresAt: null,
        });
      }

      try {
        const newKey = await apiKeyService.rotateApiKey(
          params.keyId,
          params.hederaAccountId,
        );

        return JSON.stringify({
          apiKey: newKey.plainKey,
          keyId: newKey.id,
          expiresAt: newKey.expires_at,
          message:
            'API key rotated successfully. The old key has been revoked.',
        });
      } catch (error) {
        logger.error('Failed to rotate API key', { error });

        if (error instanceof Error && error.message.includes('not found')) {
          return JSON.stringify({
            error: 'API key not found or unauthorized',
            apiKey: null,
            keyId: null,
            expiresAt: null,
          });
        }

        return JSON.stringify({
          error: 'Failed to rotate API key',
          apiKey: null,
          keyId: null,
          expiresAt: null,
        });
      }
    },
  };
}
