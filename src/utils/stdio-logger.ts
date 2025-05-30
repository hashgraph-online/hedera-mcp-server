import { Logger } from '@hashgraphonline/standards-sdk';

/**
 * Creates a logger instance that respects STDIO transport mode
 * In STDIO mode, logs are silenced to prevent corrupting JSON-RPC messages
 */
export function createStdioSafeLogger(options: Parameters<typeof Logger.getInstance>[0]): Logger {
  const isStdioMode = process.env.MCP_TRANSPORT === 'stdio';
  const disableLogs = process.env.DISABLE_LOGS === 'true';
  
  if (isStdioMode || disableLogs) {
    return Logger.getInstance({
      ...options,
      silent: true,
      level: 'silent' as any,
    });
  }
  
  return Logger.getInstance(options);
}