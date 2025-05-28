import * as dotenv from 'dotenv';
import { Logger } from '@hashgraphonline/standards-sdk';
import { config } from './config/server-config';
import { HederaMCPServer } from './server/fastmcp-server';

dotenv.config();

/**
 * Main entry point for the Hedera MCP Server
 */
async function main(): Promise<void> {
  let server: HederaMCPServer | null = null;
  const logger = Logger.getInstance({
    level: (process.env.LOG_LEVEL as any) || 'info',
    module: 'HederaMCPMain',
    prettyPrint: true,
  });

  try {
    logger.info('Starting Hedera MCP Server...');

    logger.info('Configuration loaded', {
      network: config.HEDERA_NETWORK,
      hcs10Enabled: config.ENABLE_HCS10,
      transport: config.MCP_TRANSPORT,
    });

    server = new HederaMCPServer(config, logger);

    await server.start();

    logger.info('Hedera MCP Server is running', {
      serverAccount: config.SERVER_ACCOUNT_ID,
      hcs10: config.ENABLE_HCS10,
      transport: config.MCP_TRANSPORT,
    });
  } catch (error) {
    logger.error('Failed to start Hedera MCP Server', { error });
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down Hedera MCP Server');

    if (server) {
      try {
        await server.stop();
        logger.info('Server shutdown complete');
      } catch (error) {
        logger.error('Error during shutdown', { error });
      }
    }

    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', error => {
    logger.error('Uncaught exception', { error });
    shutdown();
  });
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { promise, reason });
    shutdown();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    const logger = Logger.getInstance({ module: 'HederaMCPMain' });
    logger.error('Fatal error', { error });
    process.exit(1);
  });
}

export { main };
