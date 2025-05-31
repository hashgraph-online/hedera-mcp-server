import { Logger } from '@hashgraphonline/standards-sdk';
import type { CreditManagerBase } from '../db/credit-manager-base';

interface AuthSession {
  accountId?: string;
  permissions?: string[];
  requestId?: string;
}

interface ToolContext {
  session?: {
    auth?: AuthSession;
  };
  creditManager?: CreditManagerBase;
  logger: Logger;
}

/**
 * Base class for authenticated MCP tools
 */
export abstract class AuthenticatedToolBase {
  protected readonly name: string;
  protected readonly description: string;
  protected readonly requiresAuth: boolean;
  protected readonly freeAccess: boolean;

  constructor(
    name: string,
    description: string,
    options?: {
      requiresAuth?: boolean;
      freeAccess?: boolean;
    },
  ) {
    this.name = name;
    this.description = description;
    this.requiresAuth = options?.requiresAuth ?? true;
    this.freeAccess = options?.freeAccess ?? false;
  }

  /**
   * Execute the tool with authentication context
   * @param params - Tool parameters
   * @param context - Tool execution context with auth info
   * @returns Tool execution result
   */
  async execute(params: any, context: ToolContext): Promise<any> {
    const accountId = this.extractAccountId(context);
    const requestId = context.session?.auth?.requestId || 'unknown';

    context.logger.info(`Tool ${this.name} invoked`, {
      accountId,
      requestId,
      hasAuth: !!context.session?.auth,
    });

    if (this.requiresAuth && !accountId) {
      throw new Error('Authentication required for this tool');
    }

    if (!this.freeAccess && context.creditManager && accountId) {
      const startTime = Date.now();

      try {
        const result = await this.executeWithCredits(
          params,
          accountId,
          context,
        );

        context.logger.info(`Tool ${this.name} completed successfully`, {
          accountId,
          requestId,
          executionTime: Date.now() - startTime,
        });

        return result;
      } catch (error) {
        context.logger.error(`Tool ${this.name} failed`, {
          accountId,
          requestId,
          executionTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    } else {
      return this.executeImpl(params, accountId, context);
    }
  }

  /**
   * Extract account ID from session context
   * @param context - Tool execution context
   * @returns Account ID or undefined
   */
  protected extractAccountId(context: ToolContext): string | undefined {
    return context.session?.auth?.accountId;
  }

  /**
   * Execute tool with credit deduction
   * @param params - Tool parameters
   * @param accountId - Authenticated account ID
   * @param context - Tool execution context
   * @returns Tool execution result
   */
  private async executeWithCredits(
    params: any,
    accountId: string,
    context: ToolContext,
  ): Promise<any> {
    if (!context.creditManager) {
      throw new Error('Credit manager not available');
    }

    const hasCredits = await context.creditManager.checkSufficientCredits(
      accountId,
      this.name,
      {},
    );

    if (!hasCredits) {
      throw new Error('Insufficient credits');
    }

    try {
      const result = await this.executeImpl(params, accountId, context);

      const operationCost = await context.creditManager.getOperationCost(
        this.name,
      );
      const currentBalance =
        await context.creditManager.getCreditBalance(accountId);

      await context.creditManager.recordCreditTransaction({
        accountId,
        transactionType: 'consumption',
        amount: operationCost,
        balanceAfter: (currentBalance?.balance || 0) - operationCost,
        description: `Consumed credits for ${this.name}`,
        relatedOperation: this.name,
        createdAt: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Abstract method to be implemented by specific tools
   * @param params - Tool parameters
   * @param accountId - Authenticated account ID (optional)
   * @param context - Tool execution context
   * @returns Tool execution result
   */
  protected abstract executeImpl(
    params: any,
    accountId: string | undefined,
    context: ToolContext,
  ): Promise<any>;

  /**
   * Get audit log entry for tool execution
   * @param accountId - Account ID
   * @param params - Tool parameters
   * @param result - Execution result
   * @param error - Error if any
   * @returns Audit log entry
   */
  protected createAuditLog(
    accountId: string | undefined,
    params: any,
    result?: any,
    error?: any,
  ): Record<string, any> {
    return {
      timestamp: new Date().toISOString(),
      tool: this.name,
      accountId,
      params: this.sanitizeParams(params),
      success: !error,
      error: error ? error.message || 'Unknown error' : undefined,
      resultSummary: result ? this.summarizeResult(result) : undefined,
    };
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   * @param params - Raw parameters
   * @returns Sanitized parameters
   */
  protected sanitizeParams(params: any): any {
    const sanitized = { ...params };

    const sensitiveFields = ['privateKey', 'password', 'secret', 'key'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Create summary of result for logging
   * @param result - Tool execution result
   * @returns Result summary
   */
  protected summarizeResult(result: any): any {
    if (typeof result === 'string' && result.length > 1000) {
      return `${result.substring(0, 1000)}... (truncated)`;
    }
    return result;
  }
}
