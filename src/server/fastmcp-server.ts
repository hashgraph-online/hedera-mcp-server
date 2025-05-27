import { FastMCP } from 'fastmcp';
import {
  HederaAgentKit,
  HederaConversationalAgent,
  ServerSigner,
} from '@hashgraphonline/hedera-agent-kit';
import { Logger } from '@hashgraphonline/standards-sdk';
import { z } from 'zod';
import type { ServerConfig } from '../config/server-config';
import { ProfileManager } from '../profile/profile-manager';
import { CreditManagerFactory } from '../db/credit-manager-factory';
import type { CreditManagerBase } from '../db/credit-manager-base';
import { HttpApiServer } from './http-api';
import { createPaymentTools } from '../tools/mcp-payment-tools';

/**
 * FastMCP server implementation with dual-mode support for traditional MCP clients and HCS-10 agents
 */
export class HederaMCPServer {
  private mcp: FastMCP;
  private hederaKit: HederaAgentKit | null = null;
  private conversationalAgent: HederaConversationalAgent | null = null;
  private profileManager: ProfileManager | null = null;
  private creditManager: CreditManagerBase | null = null;
  private httpApiServer: HttpApiServer | null = null;
  private logger: Logger;
  private isInitialized = false;

  constructor(
    private config: ServerConfig,
    logger?: Logger
  ) {
    this.logger =
      logger ||
      Logger.getInstance({
        level: config.LOG_LEVEL as any,
        module: 'HederaMCPServer',
        prettyPrint: true,
      });

    this.mcp = new FastMCP({
      name: 'hedera-mcp-server',
      version: '1.0.0',
    });

    this.setupMCPTools();
  }

  /**
   * Initializes the Hedera MCP server with dual-mode capabilities
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing Hedera MCP Server...');

      const signer = new ServerSigner(
        this.config.HEDERA_OPERATOR_ID,
        this.config.HEDERA_OPERATOR_KEY,
        this.config.HEDERA_NETWORK
      );

      this.hederaKit = new HederaAgentKit(signer, {}, 'directExecution');
      await this.hederaKit.initialize();

      const openAIApiKey = process.env.OPENAI_API_KEY;
      if (!openAIApiKey) {
        throw new Error(
          'OPENAI_API_KEY environment variable is required for conversational agent'
        );
      }

      this.conversationalAgent = new HederaConversationalAgent(signer, {
        operationalMode: 'directExecution',
        userAccountId: this.config.HEDERA_OPERATOR_ID,
        verbose: false,
        openAIApiKey: openAIApiKey,
      });
      await this.conversationalAgent.initialize();

      this.profileManager = new ProfileManager(
        this.config,
        this.hederaKit,
        this.logger
      );

      this.creditManager = await CreditManagerFactory.create(
        this.config,
        this.hederaKit,
        this.logger
      );
      await this.creditManager.initialize();

      if (this.creditManager) {
        const paymentTools = createPaymentTools(
          this.config.SERVER_ACCOUNT_ID,
          this.config.HEDERA_NETWORK as 'testnet' | 'mainnet',
          this.creditManager,
          this.logger
        );

        paymentTools.forEach((tool) => {
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

          this.mcp.addTool({
            name: tool.name,
            description: tool.description,
            parameters: z.object(zodSchema),
            execute: async (params) => {
              const result = await tool.handler(params);
              return JSON.stringify(result);
            },
          });
        });
      }

      if (this.creditManager) {
        this.httpApiServer = new HttpApiServer(
          this.creditManager,
          this.config,
          this.logger
        );
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
      this.logger.error('Failed to initialize Hedera MCP Server', { error });
      throw error;
    }
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
        'No existing profile found, skipping registration for now'
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
   * Sets up MCP tools using FastMCP framework
   */
  private setupMCPTools(): void {
    this.mcp.addTool({
      name: 'health_check',
      description: 'Check server health and status',
      parameters: z.object({}),
      execute: async () => {
        const profileState = this.profileManager?.getProfileState();
        return JSON.stringify({
          status: 'healthy',
          timestamp: new Date().toISOString(),
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
      name: 'purchase_credits',
      description: 'Purchase credits using HBAR for server operations',
      parameters: z.object({
        hbarAmount: z
          .number()
          .min(1)
          .describe('Amount of HBAR to convert to credits'),
        targetAccount: z
          .string()
          .describe('Account to credit'),
      }),
      execute: async (params: {
        hbarAmount: number;
        targetAccount?: string | undefined;
      }) => {
        return JSON.stringify({
          instructions: `To purchase ${params.hbarAmount} HBAR worth of credits:`,
          steps: [
            `Send ${params.hbarAmount} HBAR to server account: ${this.config.SERVER_ACCOUNT_ID}`,
            'Include your account ID in the memo field for automatic credit allocation',
            'Credits will be allocated within 1-2 minutes after transaction confirmation',
            `Rate: 1 HBAR = ${this.config.CREDITS_CONVERSION_RATE} credits (you will receive ${params.hbarAmount * this.config.CREDITS_CONVERSION_RATE} credits)`,
          ],
          serverAccount: this.config.SERVER_ACCOUNT_ID,
          expectedCredits:
            params.hbarAmount * this.config.CREDITS_CONVERSION_RATE,
          memo: params.targetAccount || 'your-account-id-here',
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
            'Natural language description of the transaction to generate bytes for'
          ),
        accountId: z
          .string()
          .describe('Account to charge credits and execute the transaction'),
      }),
      execute: async (params: {
        request: string;
        accountId?: string | undefined;
      }) => {
        const chargeAccountId = params.accountId;

        if (!chargeAccountId) {
          return JSON.stringify({
            operation: 'schedule_transaction',
            error: 'Account ID is required',
            status: 'failed',
          });
        }

        if (this.creditManager) {
          const creditCheck = await this.creditManager.checkSufficientCredits(
            chargeAccountId,
            'generate_transaction_bytes'
          );

          if (!creditCheck.sufficient) {
            return JSON.stringify({
              operation: 'generate_transaction_bytes',
              error: 'Insufficient credits',
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
            `Generate bytes: ${params.request.substring(0, 50)}...`
          );

          if (!success) {
            return JSON.stringify({
              operation: 'generate_transaction_bytes',
              error: 'Failed to consume credits',
              status: 'failed',
            });
          }
        }

        return JSON.stringify(
          await this.processWithConversationalAgent(
            params.request,
            'provideBytes',
            chargeAccountId
          )
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
            'Natural language description of the transaction to schedule'
          ),
        accountId: z
          .string()
          .describe('Account to charge credits'),
      }),
      execute: async (params: {
        request: string;
        accountId?: string | undefined;
      }) => {
        const chargeAccountId = params.accountId;

        if (!chargeAccountId) {
          return JSON.stringify({
            operation: 'schedule_transaction',
            error: 'Account ID is required',
            status: 'failed',
          });
        }

        if (this.creditManager) {
          const creditCheck = await this.creditManager.checkSufficientCredits(
            chargeAccountId,
            'schedule_transaction'
          );

          if (!creditCheck.sufficient) {
            return JSON.stringify({
              operation: 'schedule_transaction',
              error: 'Insufficient credits',
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
            `Schedule transaction: ${params.request.substring(0, 50)}...`
          );

          if (!success) {
            return JSON.stringify({
              operation: 'schedule_transaction',
              error: 'Failed to consume credits',
              status: 'failed',
            });
          }
        }

        return JSON.stringify(
          await this.processWithConversationalAgent(
            params.request,
            'scheduleTransaction',
            chargeAccountId
          )
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
            'Natural language description of the transaction to execute'
          ),
        accountId: z
          .string()
          .describe('Account to charge credits'),
      }),
      execute: async (params: {
        request: string;
        accountId?: string | undefined;
      }) => {
        const chargeAccountId = params.accountId;

        if (!chargeAccountId) {
          return JSON.stringify({
            operation: 'execute_transaction',
            error: 'Account ID is required',
            status: 'failed',
          });
        }

        if (this.creditManager) {
          const creditCheck = await this.creditManager.checkSufficientCredits(
            chargeAccountId,
            'execute_transaction'
          );

          if (!creditCheck.sufficient) {
            return JSON.stringify({
              operation: 'execute_transaction',
              error: 'Insufficient credits',
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
            `Execute transaction: ${params.request.substring(0, 50)}...`
          );

          if (!success) {
            return JSON.stringify({
              operation: 'execute_transaction',
              error: 'Failed to consume credits',
              status: 'failed',
            });
          }
        }

        return JSON.stringify(
          await this.processWithConversationalAgent(
            params.request,
            'directExecution',
            chargeAccountId
          )
        );
      },
    });

    this.mcp.addTool({
      name: 'check_credit_balance',
      description: 'Check credit balance for an account',
      parameters: z.object({
        accountId: z
          .string()
          .describe('Account to check (defaults to server operator)'),
      }),
      execute: async (params: { accountId?: string | undefined }) => {
        if (!this.creditManager) {
          return JSON.stringify({ error: 'Credit system not initialized' });
        }

        const accountId = params.accountId;
        if (!accountId) {
          return JSON.stringify({ error: 'Account ID is required' });
        }
        const balance = await this.creditManager.getCreditBalance(accountId);
        const costs = await this.creditManager.getOperationCosts();

        return JSON.stringify({
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
        });
      },
    });

    this.mcp.addTool({
      name: 'get_credit_history',
      description: 'Get credit transaction history for an account',
      parameters: z.object({
        accountId: z
          .string()
          .describe('Account to check'),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of transactions to return (default 20)'),
      }),
      execute: async (params: {
        accountId?: string | undefined;
        limit?: number | undefined;
      }) => {
        if (!this.creditManager) {
          return JSON.stringify({ error: 'Credit system not initialized' });
        }

        const accountId = params.accountId;
        if (!accountId) {
          return JSON.stringify({ error: 'Account ID is required' });
        }
        const limit = params.limit || 20;
        const history = await this.creditManager.getCreditHistory(
          accountId,
          limit
        );

        return JSON.stringify({
          accountId,
          transactions: history,
          count: history.length,
          message: `Retrieved ${history.length} credit transactions`,
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
            params.hbarAmount * this.config.CREDITS_CONVERSION_RATE
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
  }

  /**
   * Processes natural language requests using the conversational agent with specified operational mode
   */
  private async processWithConversationalAgent(
    request: string,
    operationalMode: 'provideBytes' | 'scheduleTransaction' | 'directExecution',
    userAccountId: string
  ): Promise<any> {
    if (!this.hederaKit) {
      throw new Error('HederaAgentKit not initialized');
    }

    if (!this.conversationalAgent) {
      throw new Error('HederaConversationalAgent not initialized');
    }

    try {
      this.logger.info(
        `Processing request with ${operationalMode} mode: "${request.substring(0, 100)}..."`
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
              timeoutMs
            )
          ),
        ])) as any;

        this.logger.info('Conversational agent response received');
        return {
          operation: 'execute_transaction',
          mode: operationalMode,
          result: result,
          message: result?.message || result?.output || 'Transaction processed',
          status: result && result.success !== false ? 'completed' : 'failed',
        };
      } else if (operationalMode === 'provideBytes') {
        this.logger.info('Starting provideBytes mode processing...');

        const bytesAgent = new HederaConversationalAgent(
          new ServerSigner(
            this.config.HEDERA_OPERATOR_ID,
            this.config.HEDERA_OPERATOR_KEY,
            this.config.HEDERA_NETWORK
          ),
          {
            operationalMode: 'provideBytes',
            userAccountId: userAccountId,
            verbose: false,
            openAIApiKey: process.env.OPENAI_API_KEY!,
            scheduleUserTransactionsInBytesMode: false,
          }
        );
        await bytesAgent.initialize();

        const timeoutMs = 30000;
        const result = (await Promise.race([
          bytesAgent.processMessage(request),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout after 30 seconds')),
              timeoutMs
            )
          ),
        ])) as any;

        return {
          operation: 'generate_transaction_bytes',
          mode: operationalMode,
          result: result,
          transactionBytes: result?.transactionBytes,
          message:
            result?.message || result?.output || 'Transaction bytes generated',
          status: result?.transactionBytes ? 'completed' : 'failed',
        };
      } else if (operationalMode === 'scheduleTransaction') {
        this.logger.info('Starting scheduleTransaction mode processing...');

        const scheduleAgent = new HederaConversationalAgent(
          new ServerSigner(
            this.config.HEDERA_OPERATOR_ID,
            this.config.HEDERA_OPERATOR_KEY,
            this.config.HEDERA_NETWORK
          ),
          {
            operationalMode: 'provideBytes',
            userAccountId: userAccountId,
            verbose: false,
            openAIApiKey: process.env.OPENAI_API_KEY!,
            scheduleUserTransactionsInBytesMode: true,
          }
        );
        await scheduleAgent.initialize();

        const timeoutMs = 30000;
        const result = (await Promise.race([
          scheduleAgent.processMessage(request),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Request timeout after 30 seconds')),
              timeoutMs
            )
          ),
        ])) as any;

        return {
          operation: 'schedule_transaction',
          mode: operationalMode,
          result: result,
          scheduleId: result?.scheduleId,
          transactionBytes: result?.transactionBytes,
          message: result?.message || result?.output || 'Transaction scheduled',
          status: result?.scheduleId ? 'completed' : 'failed',
        };
      } else {
        return {
          operation:
            operationalMode === 'provideBytes'
              ? 'generate_transaction_bytes'
              : 'schedule_transaction',
          mode: operationalMode,
          message: `${operationalMode} mode not yet implemented. Use execute_transaction for direct execution.`,
          request: request,
          status: 'not_implemented',
        };
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
        return {
          operation: operationalMode,
          mode: operationalMode,
          error:
            'Invalid or missing OpenAI API key. Please set a valid OPENAI_API_KEY environment variable.',
          message:
            'To test without OpenAI, try the health_check or get_server_info tools instead.',
          status: 'failed',
          request: request,
        };
      }

      throw error;
    }
  }

  /**
   * Starts the FastMCP server
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
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
          `Starting FastMCP with httpStream transport on port ${fastmcpPort}...`
        );
        await this.mcp.start({
          transportType: 'httpStream',
          httpStream: {
            port: fastmcpPort,
          },
        });
        this.logger.info(
          `FastMCP httpStream server started on port ${fastmcpPort}`
        );
        this.logger.info(
          `Connect via SSE: http://localhost:${fastmcpPort}/stream`
        );
      } else if (!isInteractive && this.config.MCP_TRANSPORT === 'stdio') {
        await this.mcp.start({ transportType: 'stdio' });
        this.logger.info('FastMCP stdio server started');
      } else if (!isInteractive && this.config.MCP_TRANSPORT === 'both') {
        await this.mcp.start({ transportType: 'stdio' });
        this.logger.info(
          'FastMCP stdio server started (use HTTP API on port 3002 for web)'
        );
      } else if (isInteractive && this.config.MCP_TRANSPORT === 'stdio') {
        this.logger.warn(
          'Running interactively with stdio transport - this will block!'
        );
        this.logger.info(
          'Skipping FastMCP stdio to prevent blocking. Use HTTP API on port 3002'
        );
        this.logger.info(
          'To use FastMCP, set MCP_TRANSPORT=http or run without TTY'
        );
      }
    } catch (error) {
      this.logger.error('Failed to start FastMCP', { error });
      this.logger.info(
        'Continuing without FastMCP - use HTTP API on port 3002'
      );
    }

    this.logger.info('FastMCP server started successfully');

    if (this.httpApiServer) {
      const httpPort = parseInt(process.env.HTTP_API_PORT || '3002');
      await this.httpApiServer.start(httpPort);
      this.logger.info(`HTTP API server started on port ${httpPort}`);
    }
  }

  /**
   * Stops the server gracefully
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping Hedera MCP Server...');

    if (this.httpApiServer) {
      await this.httpApiServer.stop();
    }

    await this.mcp.stop();
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
