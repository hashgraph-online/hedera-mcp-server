import { HederaMCPServer } from '../../server/fastmcp-server';
import { CreditManagerFactory } from '../../db/credit-manager-factory';
import { CreditManagerBase } from '../../db/credit-manager-base';
import { Logger } from '@hashgraphonline/standards-sdk';
import { setupTestDatabase } from '../test-db-setup';
import { loadServerConfig, type ServerConfig } from '../../config/server-config';
import { HederaAgentKit, ServerSigner } from '@hashgraphonline/hedera-agent-kit';
import { PrivateKey, AccountId, Client, TransferTransaction, Hbar, AccountCreateTransaction, AccountBalanceQuery } from '@hashgraph/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { PortManager } from '../test-utils/port-manager';
dotenv.config();
export interface TestServerOptions {
  usePostgres?: boolean;
  serverAccountId?: string;
  serverPrivateKey?: string;
  network?: 'testnet' | 'mainnet';
  creditsConversionRate?: number;
  transport?: 'stdio' | 'http';
  httpPort?: number;
}
export interface TestAccount {
  accountId: AccountId;
  privateKey: PrivateKey;
}
/**
 * Test environment for setting up and managing test infrastructure
 */
export class TestEnvironment {
  private server: HederaMCPServer | null = null;
  private creditManager: CreditManagerBase | null = null;
  private dbPath: string | null = null;
  private testAccounts: TestAccount[] = [];
  private client: Client | null = null;
  private serverConfig: ServerConfig;
  private hederaKit: HederaAgentKit | null = null;
  
  constructor(private options: TestServerOptions = {}) {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';
    if (options.network) process.env.HEDERA_NETWORK = options.network;
    if (options.serverAccountId) {
      process.env.HEDERA_OPERATOR_ID = options.serverAccountId;
      process.env.SERVER_ACCOUNT_ID = options.serverAccountId;
    }
    if (options.serverPrivateKey) {
      process.env.HEDERA_OPERATOR_KEY = options.serverPrivateKey;
      process.env.SERVER_PRIVATE_KEY = options.serverPrivateKey;
    }
    process.env.CREDITS_CONVERSION_RATE = String(options.creditsConversionRate || 1000);
    process.env.MCP_TRANSPORT = options.transport || 'stdio';
    process.env.PORT = String(options.httpPort || PortManager.getPort());
    this.serverConfig = loadServerConfig();
  }
  /**
   * Sets up the test environment including database, migrations, and services
   */
  async setup(): Promise<void> {
    if (this.options.usePostgres) {
      process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL || 'postgresql://test:test@localhost:5432/hedera_mcp_test';
    } else {
      this.dbPath = path.join(__dirname, `../../../test-db-${randomBytes(8).toString('hex')}.sqlite`);
      process.env.DATABASE_URL = `sqlite://${this.dbPath}`;
    }
    const logger = Logger.getInstance({
      level: 'error',
      module: 'test',
      prettyPrint: false
    });
    
    await setupTestDatabase(process.env.DATABASE_URL!, logger);
    const signer = new ServerSigner(
      this.serverConfig.HEDERA_OPERATOR_ID,
      this.serverConfig.HEDERA_OPERATOR_KEY,
      this.serverConfig.HEDERA_NETWORK
    );
    this.hederaKit = new HederaAgentKit(signer, {}, 'directExecution');
    await this.hederaKit.initialize();
    this.creditManager = await CreditManagerFactory.create(
      this.serverConfig,
      this.hederaKit,
      logger
    );
    await this.creditManager.initialize();
    this.server = new HederaMCPServer(
      this.serverConfig,
      logger
    );
    if (this.serverConfig.SERVER_ACCOUNT_ID && this.serverConfig.SERVER_PRIVATE_KEY) {
      this.client = this.serverConfig.HEDERA_NETWORK === 'mainnet' 
        ? Client.forMainnet()
        : Client.forTestnet();
      this.client.setOperator(
        AccountId.fromString(this.serverConfig.SERVER_ACCOUNT_ID),
        PrivateKey.fromString(this.serverConfig.SERVER_PRIVATE_KEY)
      );
    }
  }
  /**
   * Creates a new test account on Hedera with initial balance
   * @param initialBalance - Initial HBAR balance (default: 10)
   * @returns Test account with account ID and private key
   */
  async createTestAccount(initialBalance: number = 10): Promise<TestAccount> {
    if (!this.client) {
      throw new Error('Client not initialized. Provide server credentials.');
    }
    const privateKey = PrivateKey.generateED25519();
    const publicKey = privateKey.publicKey;
    const transaction = await new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(new Hbar(initialBalance))
      .execute(this.client);
    const receipt = await transaction.getReceipt(this.client);
    const accountId = receipt.accountId;
    if (!accountId) {
      throw new Error('Failed to create test account');
    }
    const testAccount = { accountId, privateKey };
    this.testAccounts.push(testAccount);
    return testAccount;
  }
  /**
   * Sends HBAR payment from one account to another
   * @param from - Source account
   * @param toAccountId - Destination account ID
   * @param amount - Amount in HBAR
   * @param memo - Optional transaction memo
   * @returns Transaction ID
   */
  async sendHbarPayment(
    from: TestAccount,
    toAccountId: string,
    amount: number,
    memo?: string
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    const testClient = this.serverConfig.HEDERA_NETWORK === 'mainnet'
      ? Client.forMainnet()
      : Client.forTestnet();
    testClient.setOperator(from.accountId, from.privateKey);
    const transaction = await new TransferTransaction()
      .addHbarTransfer(from.accountId, new Hbar(-amount))
      .addHbarTransfer(AccountId.fromString(toAccountId), new Hbar(amount))
      .setTransactionMemo(memo || `Payment from ${from.accountId.toString()}`)
      .execute(testClient);
    const receipt = await transaction.getReceipt(testClient);
    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Transaction failed: ${receipt.status.toString()}`);
    }
    return transaction.transactionId!.toString();
  }
  /**
   * Gets the HBAR balance of an account
   * @param accountId - Account to check
   * @returns HBAR balance
   */
  async getAccountBalance(accountId: AccountId | string): Promise<Hbar> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }
    const query = new AccountBalanceQuery()
      .setAccountId(typeof accountId === 'string' ? AccountId.fromString(accountId) : accountId);
    const balance = await query.execute(this.client);
    return balance.hbars;
  }
  /**
   * Waits for payment processing to complete
   * @param maxWaitMs - Maximum wait time in milliseconds
   */
  async waitForPaymentProcessing(maxWaitMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  /**
   * Gets the MCP server instance
   * @returns HederaMCPServer instance
   * @throws Error if server not initialized
   */
  getServer(): HederaMCPServer {
    if (!this.server) {
      throw new Error('Server not initialized. Call setup() first.');
    }
    return this.server;
  }
  /**
   * Gets the credit manager instance
   * @returns CreditManagerBase instance
   * @throws Error if credit manager not initialized
   */
  getCreditManager(): CreditManagerBase {
    if (!this.creditManager) {
      throw new Error('Credit manager not initialized. Call setup() first.');
    }
    return this.creditManager;
  }
  /**
   * Gets the server account ID
   * @returns Server account ID
   */
  getServerAccountId(): string {
    return this.serverConfig.SERVER_ACCOUNT_ID;
  }
  /**
   * Gets the database URL
   * @returns Database URL
   */
  getDatabaseUrl(): string {
    return process.env.DATABASE_URL || '';
  }
  /**
   * Gets the Hedera client instance
   * @returns Client instance or null
   */
  getClient(): Client | null {
    return this.client;
  }
  /**
   * Cleans up test resources including accounts and database
   */
  async cleanup(): Promise<void> {
    for (const account of this.testAccounts) {
      try {
        const balance = await this.getAccountBalance(account.accountId);
        if (balance.toBigNumber().toNumber() > 0.1) {
          await this.sendHbarPayment(
            account,
            this.serverConfig.SERVER_ACCOUNT_ID,
            balance.toBigNumber().toNumber() - 0.1,
            'Test cleanup'
          );
        }
      } catch (error) {
        console.error(`Failed to cleanup test account ${account.accountId}:`, error);
      }
    }
    if (this.creditManager) {
      if ('close' in this.creditManager && typeof this.creditManager.close === 'function') {
        await this.creditManager.close();
      }
    }
    if (this.dbPath && !this.options.usePostgres) {
      try {
        await fs.unlink(this.dbPath);
      } catch (error) {
        console.error('Failed to cleanup test database:', error);
      }
    }
    if (this.client) {
      this.client.close();
    }
  }
}
/**
 * Creates a test client for interacting with the MCP server
 * @param _server - HederaMCPServer instance
 * @returns Test client object with callTool method
 */
export async function createTestClient(_server: HederaMCPServer) {
  return {
    async callTool(_name: string, _args: Record<string, any> = {}) {
      throw new Error('Test client not yet implemented for FastMCP server');
    }
  };
}