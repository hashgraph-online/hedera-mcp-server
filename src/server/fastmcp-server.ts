import { FastMCP } from 'fastmcp';
import {
  HederaAgentKit,
  HederaConversationalAgent,
  ServerSigner,
} from '@hashgraphonline/hedera-agent-kit';
import { Logger, type NetworkType } from '@hashgraphonline/standards-sdk';
import { z } from 'zod';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import type { ServerConfig } from '../config/server-config';
import { ProfileManager } from '../profile/profile-manager';
import { CreditManagerFactory } from '../db/credit-manager-factory';
import type { CreditManagerBase } from '../db/credit-manager-base';
import { createPaymentTools } from '../tools/mcp-payment-tools';
import { createRequestAuthChallengeTool } from '../tools/request-auth-challenge';
import { createVerifyAuthSignatureTool } from '../tools/verify-auth-signature';
import { createGetApiKeysTool } from '../tools/get-api-keys';
import { createRotateApiKeyTool } from '../tools/rotate-api-key';
import { createRevokeApiKeyTool } from '../tools/revoke-api-key';
import { PaymentTools } from '../tools/payment-tools';
import { ApiKeyService } from '../auth/api-key-service';
import { ChallengeService } from '../auth/challenge-service';
import { SignatureService } from '../auth/signature-service';
import { MCPAuthMiddleware } from '../auth/mcp-auth-middleware';
import { AnomalyDetector } from '../auth/anomaly-detector';
import { AuditLogger } from '../auth/audit-logger';
import { metricsCollector } from '../auth/metrics-collector';

/**
 * FastMCP server implementation with dual-mode support for traditional MCP clients and HCS-10 agents
 */
export class HederaMCPServer {
  protected mcp: FastMCP<{ accountId: string; permissions: string[] }> | null =
    null;
  protected hederaKit: HederaAgentKit | null = null;
  protected conversationalAgent: HederaConversationalAgent | null = null;
  protected profileManager: ProfileManager | null = null;
  protected creditManager: CreditManagerBase | null = null;
  protected logger: Logger;
  protected isInitialized = false;
  protected apiKeyService: ApiKeyService | null = null;

  private authDb: any = null;
  private challengeService: ChallengeService | null = null;
  private signatureService: SignatureService | null = null;
  private anomalyDetector: AnomalyDetector | null = null;
  private auditLogger: AuditLogger | null = null;
  private authApp: express.Express | null = null;
  private authServer: any = null;
  private dbPool: Pool | null = null;

  constructor(
    protected config: ServerConfig,
    logger?: Logger,
  ) {
    this.logger =
      logger ||
      Logger.getInstance({
        level: config.LOG_LEVEL as any,
        module: 'HederaMCPServer',
        prettyPrint: true,
        silent: config.MCP_TRANSPORT === 'stdio',
      });
  }

  /**
   * Initializes the Hedera MCP server with dual-mode capabilities
   */
  async initialize(): Promise<void> {
    this.logger.info('INITIALIZE METHOD CALLED - Entry point');

    if (this.isInitialized) {
      this.logger.info('Already initialized, returning early');
      return;
    }

    try {
      this.logger.info('Starting initialization process...');

      const signer = new ServerSigner(
        this.config.HEDERA_OPERATOR_ID,
        this.config.HEDERA_OPERATOR_KEY,
        this.config.HEDERA_NETWORK,
      );

      const shouldDisableLogs = process.env.DISABLE_LOGGING === 'true';

      this.hederaKit = new HederaAgentKit(
        signer,
        {},
        'directExecution',
        undefined,
        true,
        undefined,
        undefined,
        undefined,
        shouldDisableLogs,
      );
      await this.hederaKit.initialize();

      const openAIApiKey = process.env.OPENAI_API_KEY;
      if (!openAIApiKey) {
        throw new Error(
          'OPENAI_API_KEY environment variable is required for conversational agent',
        );
      }

      this.conversationalAgent = new HederaConversationalAgent(signer, {
        operationalMode: 'directExecution',
        userAccountId: this.config.HEDERA_OPERATOR_ID,
        verbose: false,
        openAIApiKey: openAIApiKey,
        disableLogging: shouldDisableLogs,
      });
      await this.conversationalAgent.initialize();

      this.profileManager = new ProfileManager(
        this.config,
        this.hederaKit,
        this.logger,
      );

      this.creditManager = await CreditManagerFactory.create(
        this.config,
        this.hederaKit,
        this.logger,
      );
      await this.creditManager.initialize();

      this.apiKeyService = new ApiKeyService(
        this.creditManager.getDatabase(),
        this.config.DATABASE_URL.startsWith('postgres'),
        process.env.API_KEY_ENCRYPTION_SECRET || 'default-encryption-key',
      );

      if (this.config.REQUIRE_AUTH) {
        await this.initializeAuthServices();
      }

      this.logger.info('Creating MCP server...');
      this.createMCPServer();
      this.logger.info('Setting up MCP tools...');
      this.setupMCPTools();
      this.logger.info('MCP setup complete');

      if (this.creditManager) {
        this.logger.info('Creating payment tools...');
        const paymentTools = createPaymentTools(
          this.config.SERVER_ACCOUNT_ID,
          this.config.HEDERA_NETWORK as 'testnet' | 'mainnet',
          this.creditManager,
          this.logger,
        );

        this.logger.info(`Created ${paymentTools.length} payment tools`);

        paymentTools.forEach(tool => {
          this.logger.info(`Registering payment tool: ${tool.name}`, {
            toolName: tool.name,
            properties: Object.keys(tool.inputSchema.properties || {}),
          });

          const zodSchema: any = {};
          const props = tool.inputSchema.properties as Record<string, any>;
          const required = (tool.inputSchema as any).required || [];

          for (const [key, prop] of Object.entries(props)) {
            if (prop.type === 'string') {
              zodSchema[key] = required.includes(key)
                ? z.string()
                : z.string().optional();
            } else if (prop.type === 'number') {
              zodSchema[key] = required.includes(key)
                ? z.number()
                : z.number().optional();
            }
          }

          this.mcp!.addTool({
            name: tool.name,
            description: tool.description,
            parameters: z.object(zodSchema),
            execute: async (params, context) => {
              try {
                this.logger.info('new request', context, params);
                const authenticatedAccountId = (context as any).accountId;
                if (!authenticatedAccountId) {
                  this.logger.warn('No authenticated account ID found', {
                    params,
                    context,
                  });
                }

                const result = await tool.handler(params);
                return JSON.stringify(result);
              } catch (error: unknown) {
                const errorMessage =
                  error instanceof Error ? error.message : 'Unknown error';
                const errorStack =
                  error instanceof Error ? error.stack : undefined;
                this.logger.error(`Payment tool '${tool.name}' error`, {
                  error: errorMessage,
                  stack: errorStack,
                  params,
                });
                return JSON.stringify({
                  error: `Payment tool failed: ${errorMessage}`,
                  tool: tool.name,
                  params,
                });
              }
            },
          });
        });
      }

      if (this.config.ENABLE_HCS10) {
        await this.ensureServerRegistration();
      }

      if (this.creditManager) {
        await this.creditManager.startPaymentMonitoring();
      }

      this.logger.info('Hedera MCP Server initialized successfully', {
        hcs10Enabled: this.config.ENABLE_HCS10,
        serverAccount: this.config.SERVER_ACCOUNT_ID,
        creditsEnabled: true,
      });

      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Full error:', error);
      this.logger.error('Failed to initialize Hedera MCP Server', { error });
      throw error;
    }
  }

  /**
   * Initialize authentication services when REQUIRE_AUTH is enabled
   */
  private async initializeAuthServices(): Promise<void> {
    this.logger.info('Initializing authentication services...');

    this.authDb = this.creditManager?.getDatabase();

    const isPostgres = this.config.DATABASE_URL.startsWith('postgres');
    this.config.API_KEY_ENCRYPTION_KEY || 'default-encryption-key';

    this.challengeService = new ChallengeService(this.authDb, isPostgres);
    this.signatureService = new SignatureService(
      this.config.HEDERA_NETWORK as NetworkType,
      this.logger,
    );

    if (process.env.REDIS_URL) {
      try {
        const Redis = await import('ioredis');
        const redis = new Redis.default(process.env.REDIS_URL);

        this.anomalyDetector = new AnomalyDetector({
          redis,
          db: this.authDb,
          isPostgres,
          logger: this.logger,
          apiKeyService: this.apiKeyService!,
          thresholds: {
            requestsPerMinute: 60,
            requestsPerHour: 1000,
            uniqueEndpointsPerHour: 50,
            errorRatePercent: 20,
            newLocationAlertEnabled: true,
          },
        });
      } catch (error) {
        this.logger.warn('Failed to initialize anomaly detector', { error });
      }
    }

    this.auditLogger = new AuditLogger({
      logger: this.logger,
      logDir: process.env.AUDIT_LOG_DIR || './audit-logs',
      webhookUrl: process.env.AUDIT_WEBHOOK_URL || undefined,
    });
    await this.auditLogger.initialize();

    this.authMiddleware = new MCPAuthMiddleware(
      this.apiKeyService!,
      this.anomalyDetector || undefined,
    );

    this.setupMetricsEndpoint();

    this.logger.info('Authentication services initialized');
  }

  /**
   * Setup metrics endpoint
   */
  private setupMetricsEndpoint(): void {
    this.authApp = express();
    this.authApp.use(cors());

    this.authApp.get('/metrics', async (_, res) => {
      const metrics = await metricsCollector.getMetrics();
      res.set('Content-Type', metricsCollector.getContentType());
      res.send(metrics);
    });
  }

  /**
   * Start the metrics server
   */
  private async startMetricsServer(): Promise<void> {
    if (!this.authApp || this.authServer) {
      return;
    }

    const metricsPort = this.config.METRICS_PORT || 3003;

    if (process.env.NODE_ENV === 'test') {
      this.logger.info('Skipping metrics server in test mode');
      return;
    }

    if (process.env.SKIP_METRICS_SERVER === 'true') {
      this.logger.info('Skipping metrics server as requested');
      return;
    }

    return new Promise((resolve, reject) => {
      this.authServer = this.authApp!.listen(metricsPort, () => {
        this.logger.info(`Metrics server listening on port ${metricsPort}`);
        this.logger.info(
          `Metrics endpoint available at http://localhost:${metricsPort}/metrics`,
        );
        resolve();
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.warn(
            `Port ${metricsPort} is already in use, skipping metrics server.`,
          );

          this.authServer = null;
          resolve();
        } else {
          this.logger.error('Failed to start metrics server', { error });
          reject(error);
        }
      });
    });
  }

  /**
   * Ensures server is registered as HCS-10 agent using ProfileManager
   */
  private async ensureServerRegistration(): Promise<void> {
    if (!this.profileManager) {
      throw new Error('ProfileManager not initialized');
    }

    try {
      this.logger.info('Checking existing HCS-10/HCS-11 profile...');

      const profileState = await this.profileManager.checkExistingProfile();

      if (profileState.isRegistered) {
        this.logger.info('Using existing HCS-10 profile', {
          accountId: profileState.accountId,
          inboundTopicId: profileState.inboundTopicId,
          outboundTopicId: profileState.outboundTopicId,
          profileTopicId: profileState.profileTopicId,
        });
        return;
      }

      this.logger.warn(
        'No existing profile found, skipping registration for now',
      );
      this.logger.info('To register a new profile, set FORCE_REREGISTER=true');
    } catch (error) {
      this.logger.error('Failed to check server registration', { error });
      this.logger.warn('Continuing without HCS-10 profile');
    }
  }

  /**
   * Publishes HCS-11 profile with MCP server capabilities
   */
  public async publishMCPServerProfile(profileState: any): Promise<void> {
    if (!this.hederaKit || !profileState.profileTopicId) {
      this.logger.warn('Cannot publish MCP profile - missing requirements');
      return;
    }

    try {
      const mcpTools = this.getMCPToolsList();

      const mcpServerProfile = {
        version: '1.0',
        type: 2,
        display_name: this.config.AGENT_NAME,
        alias: this.config.AGENT_NAME.toLowerCase().replace(/\s+/g, '_'),
        bio: this.config.AGENT_DESCRIPTION,
        inboundTopicId: profileState.inboundTopicId,
        outboundTopicId: profileState.outboundTopicId,
        properties: {
          description: 'Production MCP server for Hedera network operations',
          supportedClients: ['Claude', 'Cursor', 'HCS-10 Agents'],
          version: this.config.MCP_SERVER_VERSION,
        },
        mcpServer: {
          version: '2025-03-26',
          connectionInfo: {
            url: this.buildConnectionUrl(),
            transport: this.getTransportType(),
          },
          services: [0, 1, 4, 5, 11, 14],
          description:
            'Comprehensive Hedera network access including HBAR transfers, HTS operations, HCS messaging, and smart contract interactions',
          verification: {
            type: this.config.VERIFICATION_TYPE,
            value: this.getVerificationValue(),
          },
          capabilities: ['tools.invoke', 'resources.get', 'resources.list'],
          tools: mcpTools,
          maintainer: 'Hashgraph Online',
          repository: 'https://github.com/hashgraph-online/hedera-mcp-server',
          docs: 'https://docs.hashgraph-online.com/mcp-server',
        },
      };

      const submitResult = await this.hederaKit
        .hcs()
        .submitMessageToTopic({
          topicId: profileState.profileTopicId,
          message: JSON.stringify(mcpServerProfile),
        })
        .execute();

      if (submitResult.success) {
        this.logger.info('Published MCP server profile to HCS', {
          transactionId: submitResult.transactionId,
          profileTopicId: profileState.profileTopicId,
        });
      } else {
        this.logger.warn('Failed to publish MCP profile', {
          error: submitResult.error,
        });
      }
    } catch (error) {
      this.logger.error('Failed to publish MCP server profile', { error });
    }
  }

  /**
   * Create FastMCP server with authentication after services are ready
   */
  protected createMCPServer(): void {
    const authenticateFunction = this.config.REQUIRE_AUTH
      ? async (request: any) => {
          try {
            this.logger.info('=== FastMCP AUTHENTICATE FUNCTION CALLED ===', {
              timestamp: new Date().toISOString(),
            });
            this.logger.debug('FastMCP authentication called', {
              url: request.url,
              method: request.method,
              hasAuth: !!(
                request.headers?.['authorization'] ||
                request.headers?.['Authorization']
              ),
              hasApiKey: !!request.headers?.['x-api-key'],
            });

            const authHeader =
              request.headers?.['authorization'] ||
              request.headers?.['Authorization'];
            const apiKeyHeader = request.headers?.['x-api-key'];

            let apiKey: string | undefined;
            if (
              authHeader &&
              typeof authHeader === 'string' &&
              authHeader.startsWith('Bearer ')
            ) {
              apiKey = authHeader.replace('Bearer ', '');
              this.logger.debug('Found API key in Authorization header');
            } else if (apiKeyHeader && typeof apiKeyHeader === 'string') {
              apiKey = apiKeyHeader;
              this.logger.debug('Found API key in x-api-key header');
            } else {
              try {
                const url = new URL(request.url);
                const urlApiKey = url.searchParams.get('apiKey');
                if (urlApiKey) {
                  apiKey = urlApiKey;
                  this.logger.debug('Found API key in URL query parameter');
                }
              } catch (urlError: unknown) {
                const errorMessage =
                  urlError instanceof Error
                    ? urlError.message
                    : 'Unknown error';
                this.logger.debug('Failed to parse URL for query parameters', {
                  url: request.url,
                  error: errorMessage,
                });
              }
            }

            if (!apiKey) {
              this.logger.debug('No API key found - returning 401');
              return new Response(
                JSON.stringify({ error: 'Authentication required' }),
                {
                  status: 401,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            }

            this.logger.debug('Attempting to authenticate API key', {
              keyPrefix: apiKey.substring(0, 8) + '...',
            });
            const result = await this.authenticateApiKey(apiKey);

            if (result instanceof Response) {
              this.logger.debug('Authentication returned error response');
              return result;
            }

            this.logger.debug('Authentication successful', {
              accountId: result.accountId,
            });
            return result;
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error('AUTHENTICATION FUNCTION ERROR', {
              error: errorMessage,
              stack: errorStack,
              url: request.url,
              method: request.method,
            });
            return new Response(
              JSON.stringify({ error: 'Authentication failed' }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              },
            );
          }
        }
      : async (request: any) => {
          this.logger.debug('FastMCP no-auth session created', {
            url: request.url,
            method: request.method,
          });

          return {
            accountId: this.config.HEDERA_OPERATOR_ID,
            permissions: ['read', 'write', 'admin'],
            sessionId: `no-auth-${Date.now()}`,
            isAuthenticated: false,
          };
        };

    this.mcp = new FastMCP({
      name: 'hedera-mcp-server',
      version: '1.0.0',
      authenticate: authenticateFunction as any,
    }) as any;
  }

  /**
   * Authenticate API key for FastMCP
   */
  private async authenticateApiKey(
    apiKey: string,
  ): Promise<{ accountId: string; permissions: string[] } | Response> {
    if (!this.apiKeyService) {
      this.logger.error('ApiKeyService not initialized');
      return new Response(
        JSON.stringify({ error: 'Authentication service not initialized' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    try {
      this.logger.debug('Verifying API key with service');
      const keyData = await this.apiKeyService.verifyApiKey(apiKey);

      if (!keyData) {
        this.logger.debug(
          'API key verification failed - key not found or expired',
        );
        return new Response(
          JSON.stringify({ error: 'Invalid or expired API key' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      this.logger.debug('API key verified successfully', {
        accountId: keyData.hederaAccountId,
        permissions: keyData.permissions?.length || 0,
      });

      return {
        accountId: keyData.hederaAccountId,
        permissions: keyData.permissions || [],
      };
    } catch (error) {
      this.logger.error('Authentication error', { error });
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  /**
   * Sets up MCP tools using FastMCP framework
   */
  private setupMCPTools(): void {
    if (!this.mcp) {
      throw new Error('MCP server not created yet');
    }
    this.mcp.addTool({
      name: 'health_check',
      description: 'Check server health and status',
      parameters: z.object({}),
      execute: async () => {
        const profileState = this.profileManager?.getProfileState();
        return JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          network: this.config.HEDERA_NETWORK,
          version: this.config.MCP_SERVER_VERSION,
          hederaNetwork: this.config.HEDERA_NETWORK,
          hcs10Enabled: this.config.ENABLE_HCS10,
          serverAccount: this.config.SERVER_ACCOUNT_ID,
          registrationStatus: profileState
            ? {
                isRegistered: profileState.isRegistered,
                hasProfile: !!profileState.profileTopicId,
                lastChecked: profileState.lastChecked,
              }
            : null,
        });
      },
    });

    this.mcp.addTool({
      name: 'get_server_info',
      description: 'Get server configuration and capabilities',
      parameters: z.object({}),
      execute: async () => {
        const profileState = this.profileManager?.getProfileState();
        return JSON.stringify({
          name: this.config.AGENT_NAME,
          version: this.config.MCP_SERVER_VERSION,
          description: this.config.AGENT_DESCRIPTION,
          network: this.config.HEDERA_NETWORK,
          server_account_id: this.config.SERVER_ACCOUNT_ID,
          serverAccount: this.config.SERVER_ACCOUNT_ID,
          hederaNetwork: this.config.HEDERA_NETWORK,
          credits_conversion_rate: this.config.CREDITS_CONVERSION_RATE,
          creditsConversionRate: this.config.CREDITS_CONVERSION_RATE,
          supported_operations: [
            'transfer',
            'token',
            'smart_contract',
            'schedule',
            'hcs',
          ],
          capabilities: {
            traditionalMCP: true,
            hcs10Support: this.config.ENABLE_HCS10,
            mcpServerProfile: !!profileState?.profileTopicId,
          },
          identity: profileState
            ? {
                accountId: profileState.accountId,
                inboundTopicId: profileState.inboundTopicId,
                outboundTopicId: profileState.outboundTopicId,
                profileTopicId: profileState.profileTopicId,
              }
            : null,
        });
      },
    });

    this.mcp.addTool({
      name: 'generate_transaction_bytes',
      description:
        'Generate transaction bytes for any Hedera operation without execution',
      parameters: z.object({
        request: z
          .string()
          .describe(
            'Natural language description of the transaction to generate bytes for',
          ),
        accountId: z
          .string()
          .optional()
          .describe(
            'Account to charge credits (defaults to your authenticated account)',
          ),
      }),
      execute: async (
        params: {
          request: string;
          accountId?: string | undefined;
        },
        context: any,
      ) => {
        const authenticatedAccountId =
          context.auth?.accountId ||
          context.accountId ||
          context.session?.accountId ||
          context.session?.auth?.accountId;
        if (!authenticatedAccountId) {
          return JSON.stringify({
            operation: 'generate_transaction_bytes',
            error: 'Authentication required',
            status: 'unauthorized',
          });
        }

        const chargeAccountId = params.accountId || authenticatedAccountId;
        const permissions =
          context.auth?.permissions ||
          context.permissions ||
          context.session?.permissions ||
          context.session?.auth?.permissions ||
          [];

        if (
          chargeAccountId !== authenticatedAccountId &&
          !permissions.includes('admin')
        ) {
          return JSON.stringify({
            operation: 'generate_transaction_bytes',
            error: 'You can only charge credits to your own account',
            status: 'forbidden',
          });
        }

        if (this.creditManager) {
          const creditCheck = await this.creditManager.checkSufficientCredits(
            chargeAccountId,
            'generate_transaction_bytes',
          );

          if (!creditCheck.sufficient) {
            return JSON.stringify({
              operation: 'generate_transaction_bytes',
              error: `Insufficient credits. Required: ${creditCheck.requiredCredits}, Current: ${creditCheck.currentBalance}`,
              required: creditCheck.requiredCredits,
              current: creditCheck.currentBalance,
              shortfall: creditCheck.shortfall,
              message: `You need ${creditCheck.shortfall} more credits. Purchase HBAR using the purchase_credits tool.`,
              status: 'insufficient_credits',
            });
          }

          const success = await this.creditManager.consumeCredits(
            chargeAccountId,
            'generate_transaction_bytes',
            `Generate bytes: ${params.request.substring(0, 50)}...`,
          );

          if (!success) {
            return JSON.stringify({
              operation: 'generate_transaction_bytes',
              error: 'Failed to consume credits',
              status: 'failed',
            });
          }
        }

        return await this.processWithConversationalAgent(
          params.request,
          'provideBytes',
          chargeAccountId,
        );
      },
    });

    this.mcp.addTool({
      name: 'schedule_transaction',
      description: 'Create scheduled transaction for any Hedera operation',
      parameters: z.object({
        request: z
          .string()
          .describe(
            'Natural language description of the transaction to schedule',
          ),
        accountId: z
          .string()
          .optional()
          .describe(
            'Account to charge credits (defaults to your authenticated account)',
          ),
      }),
      execute: async (
        params: {
          request: string;
          accountId?: string | undefined;
        },
        context: any,
      ) => {
        const authenticatedAccountId =
          context.auth?.accountId ||
          context.accountId ||
          context.session?.accountId ||
          context.session?.auth?.accountId;
        if (!authenticatedAccountId) {
          return JSON.stringify({
            operation: 'schedule_transaction',
            error: 'Authentication required',
            status: 'unauthorized',
          });
        }

        const chargeAccountId = params.accountId || authenticatedAccountId;
        const permissions =
          context.auth?.permissions ||
          context.permissions ||
          context.session?.permissions ||
          context.session?.auth?.permissions ||
          [];

        if (
          chargeAccountId !== authenticatedAccountId &&
          !permissions.includes('admin')
        ) {
          return JSON.stringify({
            operation: 'schedule_transaction',
            error: 'You can only charge credits to your own account',
            status: 'forbidden',
          });
        }

        if (this.creditManager) {
          const creditCheck = await this.creditManager.checkSufficientCredits(
            chargeAccountId,
            'schedule_transaction',
          );

          if (!creditCheck.sufficient) {
            return JSON.stringify({
              operation: 'schedule_transaction',
              error: `Insufficient credits. Required: ${creditCheck.requiredCredits}, Current: ${creditCheck.currentBalance}`,
              required: creditCheck.requiredCredits,
              current: creditCheck.currentBalance,
              shortfall: creditCheck.shortfall,
              message: `You need ${creditCheck.shortfall} more credits. Purchase HBAR using the purchase_credits tool.`,
              status: 'insufficient_credits',
            });
          }

          const success = await this.creditManager.consumeCredits(
            chargeAccountId,
            'schedule_transaction',
            `Schedule transaction: ${params.request.substring(0, 50)}...`,
          );

          if (!success) {
            return JSON.stringify({
              operation: 'schedule_transaction',
              error: 'Failed to consume credits',
              status: 'failed',
            });
          }
        }

        return await this.processWithConversationalAgent(
          params.request,
          'scheduleTransaction',
          chargeAccountId,
        );
      },
    });

    this.mcp.addTool({
      name: 'execute_transaction',
      description: 'Execute any Hedera transaction immediately',
      parameters: z.object({
        request: z
          .string()
          .describe(
            'Natural language description of the transaction to execute',
          ),
        accountId: z
          .string()
          .optional()
          .describe(
            'Account to charge credits (defaults to your authenticated account)',
          ),
      }),
      execute: async (
        params: {
          request: string;
          accountId?: string | undefined;
        },
        context: any,
      ) => {
        const authenticatedAccountId =
          context.auth?.accountId ||
          context.accountId ||
          context.session?.accountId ||
          context.session?.auth?.accountId;
        if (!authenticatedAccountId) {
          return JSON.stringify({
            operation: 'execute_transaction',
            error: 'Authentication required',
            status: 'unauthorized',
          });
        }

        const chargeAccountId = params.accountId || authenticatedAccountId;
        const permissions =
          context.auth?.permissions ||
          context.permissions ||
          context.session?.permissions ||
          context.session?.auth?.permissions ||
          [];

        if (
          chargeAccountId !== authenticatedAccountId &&
          !permissions.includes('admin')
        ) {
          return JSON.stringify({
            operation: 'execute_transaction',
            error: 'You can only charge credits to your own account',
            status: 'forbidden',
          });
        }

        if (this.creditManager) {
          const creditCheck = await this.creditManager.checkSufficientCredits(
            chargeAccountId,
            'execute_transaction',
          );

          if (!creditCheck.sufficient) {
            return JSON.stringify({
              operation: 'execute_transaction',
              error: `Insufficient credits. Required: ${creditCheck.requiredCredits}, Current: ${creditCheck.currentBalance}`,
              required: creditCheck.requiredCredits,
              current: creditCheck.currentBalance,
              shortfall: creditCheck.shortfall,
              message: `You need ${creditCheck.shortfall} more credits. Purchase HBAR using the purchase_credits tool.`,
              status: 'insufficient_credits',
            });
          }

          const success = await this.creditManager.consumeCredits(
            chargeAccountId,
            'execute_transaction',
            `Execute transaction: ${params.request.substring(0, 50)}...`,
          );

          if (!success) {
            return JSON.stringify({
              operation: 'execute_transaction',
              error: 'Failed to consume credits',
              status: 'failed',
            });
          }
        }

        return await this.processWithConversationalAgent(
          params.request,
          'directExecution',
          chargeAccountId,
        );
      },
    });

    this.mcp.addTool({
      name: 'check_credit_balance',
      description: 'Check credit balance for your authenticated account',
      parameters: z.object({
        accountId: z
          .string()
          .optional()
          .describe(
            'Account to check (defaults to your authenticated account)',
          ),
      }),
      execute: async (
        params: { accountId?: string | undefined },
        context: any,
      ) => {
        if (!this.creditManager) {
          return JSON.stringify({ error: 'Credit system not initialized' });
        }

        const authenticatedAccountId =
          context.auth?.accountId ||
          context.accountId ||
          context.session?.accountId ||
          context.session?.auth?.accountId;
        if (!authenticatedAccountId) {
          return JSON.stringify({
            error: 'Authentication required',
            operation: 'check_credit_balance',
            status: 'unauthorized',
          });
        }

        const accountId = params.accountId || authenticatedAccountId;
        const permissions =
          context.auth?.permissions ||
          context.permissions ||
          context.session?.permissions ||
          context.session?.auth?.permissions ||
          [];

        if (
          accountId !== authenticatedAccountId &&
          !permissions.includes('admin')
        ) {
          return JSON.stringify({
            error: 'You can only check your own credit balance',
            operation: 'check_credit_balance',
            status: 'forbidden',
          });
        }

        const balance = await this.creditManager.getCreditBalance(accountId);
        const costs = await this.creditManager.getOperationCosts();

        const result = {
          accountId,
          balance: balance
            ? {
                current: balance.balance,
                totalPurchased: balance.totalPurchased,
                totalConsumed: balance.totalConsumed,
                lastUpdated: balance.updatedAt,
              }
            : { current: 0, totalPurchased: 0, totalConsumed: 0 },
          operationCosts: costs,
          conversionRate: this.config.CREDITS_CONVERSION_RATE,
          message: balance
            ? `You have ${balance.balance} credits available`
            : 'No credits found. Purchase credits using HBAR.',
        };

        return JSON.stringify(result);
      },
    });

    this.mcp.addTool({
      name: 'get_credit_history',
      description:
        'Get credit transaction history for your authenticated account',
      parameters: z.object({
        accountId: z
          .string()
          .optional()
          .describe(
            'Account to check (defaults to your authenticated account)',
          ),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of transactions to return (default 20)'),
      }),
      execute: async (
        params: {
          accountId?: string | undefined;
          limit?: number | undefined;
        },
        context: any,
      ) => {
        if (!this.creditManager) {
          return JSON.stringify({ error: 'Credit system not initialized' });
        }

        const authenticatedAccountId =
          context.auth?.accountId ||
          context.accountId ||
          context.session?.accountId ||
          context.session?.auth?.accountId;
        if (!authenticatedAccountId) {
          return JSON.stringify({
            error: 'Authentication required',
            operation: 'get_credit_history',
            status: 'unauthorized',
          });
        }

        const accountId = params.accountId || authenticatedAccountId;
        const permissions =
          context.auth?.permissions ||
          context.permissions ||
          context.session?.permissions ||
          context.session?.auth?.permissions ||
          [];

        if (
          accountId !== authenticatedAccountId &&
          !permissions.includes('admin')
        ) {
          return JSON.stringify({
            error: 'You can only check your own credit history',
            operation: 'get_credit_history',
            status: 'forbidden',
          });
        }
        const limit = params.limit || 20;
        const history = await this.creditManager.getCreditHistory(
          accountId,
          limit,
        );

        return JSON.stringify({
          accountId,
          transactions: history,
          count: history.length,
          message: `Retrieved ${history.length} credit transactions`,
          pagination: {
            limit: limit,
            offset: 0,
            total: history.length,
          },
        });
      },
    });

    this.mcp.addTool({
      name: 'process_hbar_payment',
      description: 'Manually process an HBAR payment for credit allocation',
      parameters: z.object({
        transactionId: z.string().describe('Hedera transaction ID'),
        payerAccountId: z.string().describe('Account that made the payment'),
        hbarAmount: z.number().min(0.1).describe('Amount of HBAR paid'),
        memo: z.string().optional().describe('Payment memo'),
      }),
      execute: async (params: {
        transactionId: string;
        payerAccountId: string;
        hbarAmount: number;
        memo?: string | undefined;
      }) => {
        if (!this.creditManager) {
          return JSON.stringify({ error: 'Credit system not initialized' });
        }

        const success = await this.creditManager.processHbarPayment({
          transactionId: params.transactionId,
          payerAccountId: params.payerAccountId,
          hbarAmount: params.hbarAmount,
          creditsAllocated: 0,
          ...(params.memo ? { memo: params.memo } : {}),
          status: 'completed',
        });

        if (success) {
          const creditsAllocated = Math.floor(
            params.hbarAmount * this.config.CREDITS_CONVERSION_RATE,
          );
          return JSON.stringify({
            success: true,
            transactionId: params.transactionId,
            hbarAmount: params.hbarAmount,
            creditsAllocated,
            message: `Successfully processed payment: ${params.hbarAmount} HBAR → ${creditsAllocated} credits`,
          });
        } else {
          return JSON.stringify({
            success: false,
            error: 'Failed to process payment (possibly already processed)',
            transactionId: params.transactionId,
          });
        }
      },
    });

    this.mcp.addTool({
      name: 'refresh_profile',
      description: 'Refresh server HCS-11 profile and registration status',
      parameters: z.object({}),
      execute: async () => {
        if (!this.profileManager) {
          return JSON.stringify({ error: 'ProfileManager not initialized' });
        }

        try {
          const fullProfile = await this.profileManager.getFullProfile();

          return JSON.stringify({
            success: true,
            profileState: {
              isRegistered: fullProfile.state.isRegistered,
              accountId: fullProfile.state.accountId,
              inboundTopicId: fullProfile.state.inboundTopicId,
              outboundTopicId: fullProfile.state.outboundTopicId,
              profileTopicId: fullProfile.state.profileTopicId,
              lastChecked: fullProfile.state.lastChecked,
              needsUpdate: fullProfile.state.needsUpdate,
            },
            profile: fullProfile.profile,
            topicInfo: fullProfile.topicInfo,
          });
        } catch (error) {
          return JSON.stringify({ error: (error as Error).message });
        }
      },
    });

    this.mcp.addTool({
      name: 'get_pricing_configuration',
      description:
        'Gets pricing configuration including operation costs, tiers, and modifiers',
      parameters: z.object({}),
      execute: async () => {
        if (!this.creditManager) {
          return JSON.stringify({
            error: 'Credit system not initialized',
            operations: {},
            tiers: [],
            modifiers: {},
          });
        }

        try {
          const paymentTools = new PaymentTools(
            this.config.SERVER_ACCOUNT_ID,
            this.config.HEDERA_NETWORK as 'testnet' | 'mainnet',
            this.creditManager,
            this.logger,
          );
          const result = await paymentTools.getPricingConfiguration();
          return JSON.stringify(result);
        } catch (error) {
          this.logger.error('Failed to get pricing configuration', { error });
          return JSON.stringify({
            error: 'Failed to get pricing configuration',
            operations: {},
            tiers: [],
            modifiers: {},
          });
        }
      },
    });

    this.mcp.addTool({
      name: 'execute_query',
      description:
        'Execute read-only queries on Hedera network (account info, balances, tokens, NFTs, etc.)',
      parameters: z.object({
        request: z
          .string()
          .describe(
            'Natural language query request (e.g., "What is my HBAR balance?", "Show me my NFTs", "Get token info for 0.0.123456")',
          ),
      }),
      execute: async (params: { request: string }, context: any) => {
        const authenticatedAccountId =
          context.auth?.accountId ||
          context.accountId ||
          context.session?.accountId ||
          context.session?.auth?.accountId;
        if (!authenticatedAccountId) {
          return JSON.stringify({
            operation: 'execute_query',
            error: 'Authentication required',
            status: 'unauthorized',
          });
        }

        try {
          this.logger.info('Processing query request', {
            request: params.request,
            accountId: authenticatedAccountId,
          });

          const result = await this.conversationalAgent!.processMessage(
            params.request,
          );

          this.logger.info('Query completed', {
            success: result && result.success !== false,
          });

          return JSON.stringify({
            operation: 'execute_query',
            result: result,
            message: result?.message || result?.output || 'Query processed',
            status: result && result.success !== false ? 'completed' : 'failed',
          });
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.error('Query execution failed', {
            error: errorMessage,
            request: params.request,
          });
          return JSON.stringify({
            operation: 'execute_query',
            error: errorMessage,
            status: 'failed',
          });
        }
      },
    });

    if (this.config.REQUIRE_AUTH) {
      const authTools = [
        createRequestAuthChallengeTool(this.challengeService, this.logger),
        createVerifyAuthSignatureTool(
          this.challengeService,
          this.signatureService,
          this.apiKeyService,
          this.logger,
        ),
        createGetApiKeysTool(this.apiKeyService, this.logger),
        createRotateApiKeyTool(this.apiKeyService, this.logger),
        createRevokeApiKeyTool(this.apiKeyService, this.logger),
      ];

      authTools.forEach(tool => {
        this.logger.info(`Registering auth tool: ${tool.name}`);
        this.mcp!.addTool({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          execute: tool.execute,
        });
      });
    }
  }

  /**
   * Processes natural language requests using the conversational agent with specified operational mode
   */
  private async processWithConversationalAgent(
    request: string,
    operationalMode: 'provideBytes' | 'scheduleTransaction' | 'directExecution',
    userAccountId: string,
  ): Promise<any> {
    if (!this.hederaKit) {
      throw new Error('HederaAgentKit not initialized');
    }

    if (!this.conversationalAgent) {
      throw new Error('HederaConversationalAgent not initialized');
    }

    try {
      this.logger.info(
        `Processing request with ${operationalMode} mode: "${request.substring(0, 100)}..."`,
      );

      if (operationalMode === 'directExecution') {
        this.logger.info('Starting directExecution mode processing...');

        const timeoutMs = 30000;

        this.logger.info('Calling conversational agent...');
        const result = (await Promise.race([
          this.conversationalAgent.processMessage(request),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout after 30 seconds')),
              timeoutMs,
            ),
          ),
        ])) as any;

        this.logger.info('Conversational agent response received');
        return JSON.stringify({
          operation: 'execute_transaction',
          mode: operationalMode,
          result: result,
          message: result?.message || result?.output || 'Transaction processed',
          status: result && result.success !== false ? 'completed' : 'failed',
        });
      } else if (operationalMode === 'provideBytes') {
        this.logger.info('Starting provideBytes mode processing...');

        const shouldDisableLogs =
          this.config.MCP_TRANSPORT === 'stdio' ||
          process.env.DISABLE_LOGS === 'true';

        const bytesAgent = new HederaConversationalAgent(
          new ServerSigner(
            this.config.HEDERA_OPERATOR_ID,
            this.config.HEDERA_OPERATOR_KEY,
            this.config.HEDERA_NETWORK,
          ),
          {
            operationalMode: 'provideBytes',
            userAccountId: userAccountId,
            verbose: false,
            openAIApiKey: process.env.OPENAI_API_KEY!,
            scheduleUserTransactionsInBytesMode: false,
            disableLogging: shouldDisableLogs,
          },
        );
        await bytesAgent.initialize();

        const timeoutMs = 30000;
        const result = (await Promise.race([
          bytesAgent.processMessage(request),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout after 30 seconds')),
              timeoutMs,
            ),
          ),
        ])) as any;

        return JSON.stringify({
          operation: 'generate_transaction_bytes',
          mode: operationalMode,
          result: result,
          transactionBytes: result?.transactionBytes,
          message:
            result?.message || result?.output || 'Transaction bytes generated',
          status: result?.transactionBytes ? 'completed' : 'failed',
        });
      } else if (operationalMode === 'scheduleTransaction') {
        this.logger.info('Starting scheduleTransaction mode processing...');

        const shouldDisableLogs =
          this.config.MCP_TRANSPORT === 'stdio' ||
          process.env.DISABLE_LOGS === 'true';

        const scheduleAgent = new HederaConversationalAgent(
          new ServerSigner(
            this.config.HEDERA_OPERATOR_ID,
            this.config.HEDERA_OPERATOR_KEY,
            this.config.HEDERA_NETWORK,
          ),
          {
            operationalMode: 'provideBytes',
            userAccountId: userAccountId,
            verbose: false,
            openAIApiKey: process.env.OPENAI_API_KEY!,
            scheduleUserTransactionsInBytesMode: true,
            disableLogging: shouldDisableLogs,
          },
        );
        await scheduleAgent.initialize();

        const timeoutMs = 30000;
        const result = (await Promise.race([
          scheduleAgent.processMessage(request),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout after 30 seconds')),
              timeoutMs,
            ),
          ),
        ])) as any;

        return JSON.stringify({
          operation: 'schedule_transaction',
          mode: operationalMode,
          result: result,
          scheduleId: result?.scheduleId,
          transactionBytes: result?.transactionBytes,
          message: result?.message || result?.output || 'Transaction scheduled',
          status: result?.scheduleId ? 'completed' : 'failed',
        });
      } else {
        return JSON.stringify({
          operation:
            operationalMode === 'provideBytes'
              ? 'generate_transaction_bytes'
              : 'schedule_transaction',
          mode: operationalMode,
          message: `${operationalMode} mode not yet implemented. Use execute_transaction for direct execution.`,
          request: request,
          status: 'not_implemented',
        });
      }
    } catch (error) {
      this.logger.error(`Failed to process request with ${operationalMode}`, {
        error,
        request,
      });

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('API key')
      ) {
        return JSON.stringify({
          operation: operationalMode,
          mode: operationalMode,
          error:
            'Invalid or missing OpenAI API key. Please set a valid OPENAI_API_KEY environment variable.',
          message:
            'To test without OpenAI, try the health_check or get_server_info tools instead.',
          status: 'failed',
          request: request,
        });
      }

      throw error;
    }
  }

  /**
   * Starts the FastMCP server
   */
  async start(): Promise<void> {
    this.logger.info('START METHOD CALLED - Entry point');

    if (!this.isInitialized) {
      this.logger.info('Server not initialized, calling initialize()');
      await this.initialize();
      this.logger.info('Initialize completed successfully');
    } else {
      this.logger.info('Server already initialized, skipping initialization');
    }

    if (!this.mcp) {
      this.logger.error('MCP server not initialized after initialization');
      throw new Error('MCP server not initialized');
    }

    this.logger.info('Starting FastMCP server...');

    const isInteractive = process.stdout.isTTY && process.stdin.isTTY;

    try {
      if (
        this.config.MCP_TRANSPORT === 'http' ||
        (isInteractive && this.config.MCP_TRANSPORT === 'both')
      ) {
        const fastmcpPort = parseInt(process.env.FASTMCP_PORT || '3000');
        this.logger.info(
          `Starting FastMCP with httpStream transport on port ${fastmcpPort}...`,
        );

        try {
          await this.mcp.start({
            transportType: 'httpStream',
            httpStream: {
              port: fastmcpPort,
            },
          });
          this.logger.info(
            `FastMCP httpStream server started successfully on port ${fastmcpPort}`,
          );
          this.logger.info(
            `Connect via SSE: http://localhost:${fastmcpPort}/stream`,
          );
        } catch (startError) {
          this.logger.error('FastMCP start error details', {
            error: startError,
            message:
              startError instanceof Error
                ? startError.message
                : String(startError),
            stack: startError instanceof Error ? startError.stack : undefined,
            port: fastmcpPort,
          });
          throw startError;
        }
      } else if (!isInteractive && this.config.MCP_TRANSPORT === 'stdio') {
        try {
          await this.mcp.start({ transportType: 'stdio' });
          this.logger.info('FastMCP stdio server started');
        } catch (stdioError) {
          this.logger.error('FastMCP stdio start error', { error: stdioError });
          throw stdioError;
        }
      } else if (!isInteractive && this.config.MCP_TRANSPORT === 'both') {
        try {
          await this.mcp.start({ transportType: 'stdio' });
          this.logger.info('FastMCP stdio server started');
        } catch (bothError) {
          this.logger.error('FastMCP both transport start error', {
            error: bothError,
          });
          throw bothError;
        }
      } else if (isInteractive && this.config.MCP_TRANSPORT === 'stdio') {
        this.logger.warn(
          'Running interactively with stdio transport - this will block!',
        );
        this.logger.info('Skipping FastMCP stdio to prevent blocking');
        this.logger.info(
          'To use FastMCP, set MCP_TRANSPORT=http or run without TTY',
        );
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString();
      const errorStack = error?.stack || 'No stack trace available';
      this.logger.error('Failed to start FastMCP', {
        error,
        message: errorMessage,
        stack: errorStack,
        transport: this.config.MCP_TRANSPORT,
        isInteractive,
        port: process.env.FASTMCP_PORT || '3000',
      });
      this.logger.info(
        'Continuing without FastMCP - MCP tools still available',
      );
    }

    this.logger.info('FastMCP server started successfully');

    if (this.config.REQUIRE_AUTH) {
      await this.startMetricsServer();

      await this.updateMetrics();
      setInterval(() => this.updateMetrics(), 60000);
    }
  }

  /**
   * Update metrics periodically
   */
  private async updateMetrics(): Promise<void> {
    if (this.apiKeyService) {
      try {
        const activeKeys = await this.apiKeyService.countActiveKeys();
        metricsCollector.setActiveApiKeys(activeKeys);

        const keyAges = await this.apiKeyService.getKeyAges();
        for (const age of keyAges) {
          metricsCollector.recordApiKeyAge(age);
        }
      } catch (error) {
        this.logger.error('Failed to update metrics', { error });
      }
    }
  }

  /**
   * Stops the server gracefully
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping Hedera MCP Server...');

    if (this.authServer) {
      await new Promise<void>(resolve => {
        this.authServer.close(() => {
          this.logger.info('Metrics server stopped');
          resolve();
        });
      });
    }

    if (this.dbPool) {
      await this.dbPool.end();
      this.logger.info('Database pool closed');
    }

    if (this.auditLogger) {
      await this.auditLogger.close();
    }

    if (this.mcp) {
      await this.mcp.stop();
    }
    this.logger.info('Server stopped');
  }

  /**
   * Gets the list of available MCP tools for server capabilities
   */
  private getMCPToolsList(): Array<{ name: string; description: string }> {
    return [
      { name: 'health_check', description: 'Check server health and status' },
      {
        name: 'get_server_info',
        description: 'Get server configuration and capabilities',
      },
      { name: 'purchase_credits', description: 'Purchase credits using HBAR' },
      {
        name: 'generate_transaction_bytes',
        description:
          'Generate transaction bytes for any Hedera operation without execution',
      },
      {
        name: 'schedule_transaction',
        description: 'Create scheduled transaction for any Hedera operation',
      },
      {
        name: 'execute_transaction',
        description: 'Execute any Hedera transaction immediately',
      },
      {
        name: 'check_credit_balance',
        description: 'Check credit balance for an account',
      },
      {
        name: 'get_credit_history',
        description: 'Get credit transaction history for an account',
      },
      {
        name: 'process_hbar_payment',
        description: 'Manually process an HBAR payment for credit allocation',
      },
      {
        name: 'refresh_profile',
        description: 'Refresh server HCS-11 profile and registration status',
      },
      {
        name: 'execute_query',
        description:
          'Execute read-only queries on Hedera network (account info, balances, tokens, NFTs, etc.)',
      },
    ];
  }

  /**
   * Builds the connection URL for MCP server based on configuration
   */
  private buildConnectionUrl(): string {
    if (this.config.VERIFICATION_DOMAIN) {
      return `https://${this.config.VERIFICATION_DOMAIN}/mcp`;
    }
    return `http://localhost:${this.config.PORT}/mcp`;
  }

  /**
   * Determines the transport type based on server configuration
   */
  private getTransportType(): 'stdio' | 'http' | 'sse' {
    if (
      this.config.MCP_TRANSPORT === 'http' ||
      this.config.MCP_TRANSPORT === 'both'
    ) {
      return 'sse';
    }
    return 'stdio';
  }

  /**
   * Gets the verification value based on the configured verification type
   */
  private getVerificationValue(): string {
    switch (this.config.VERIFICATION_TYPE) {
      case 'dns':
        return this.config.VERIFICATION_DOMAIN || 'localhost';
      case 'signature':
        const profileState = this.profileManager?.getProfileState();
        return profileState?.accountId || this.config.SERVER_ACCOUNT_ID;
      case 'challenge':
        return '/verify';
      default:
        return this.config.SERVER_ACCOUNT_ID;
    }
  }
}
