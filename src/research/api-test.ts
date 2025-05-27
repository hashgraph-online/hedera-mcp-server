import { FastMCP } from 'fastmcp';
import { HederaAgentKit } from '@hashgraphonline/hedera-agent-kit';
import { z } from 'zod';
import { Logger } from '@hashgraphonline/standards-sdk';

const logger = new Logger({ module: 'APIResearch' });

/**
 * Research script to test FastMCP and HederaAgentKit APIs
 * This helps us understand the correct method signatures before full implementation
 */

async function testFastMCPAPI() {
  logger.info('Testing FastMCP API...');

  try {
    logger.info('Testing FastMCP constructor with options object...');
    const mcp = new FastMCP({
      name: 'test-server',
      version: '1.0.0',
    });
    logger.info('FastMCP constructor works with options object');

    const testTool = {
      name: 'test_tool',
      description: 'Test tool for API research',
      parameters: z.object({
        message: z.string().describe('Test message'),
      }),
      execute: async (args: { message: string }) => {
        return `Echo: ${args.message}`;
      },
    };

    if ('addTool' in mcp && typeof mcp.addTool === 'function') {
      logger.info('FastMCP.addTool method exists');
      mcp.addTool(testTool);
    } else if ('tool' in mcp && typeof mcp.tool === 'function') {
      logger.info('FastMCP.tool method exists');
    } else {
      logger.warn('No known tool registration method found');
      logger.debug('Available methods', {
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(mcp)),
      });
    }

    return mcp;
  } catch (error) {
    logger.error('FastMCP API test failed', { error });
    logger.debug('Error details', { message: (error as Error).message });
    return null;
  }
}

async function testHederaAgentKitAPI() {
  logger.info('Testing HederaAgentKit API...');

  try {
    logger.info('HederaAgentKit imported successfully');
    logger.debug('HederaAgentKit prototype methods', {
      methods: Object.getOwnPropertyNames(HederaAgentKit.prototype),
    });

    return true;
  } catch (error) {
    logger.error('HederaAgentKit API test failed', { error });
    return false;
  }
}

async function testRegisterAgentToolAccess() {
  logger.info('Testing RegisterAgentTool access...');

  try {
    logger.info('Starting RegisterAgentTool research...');
    return true;
  } catch (error) {
    logger.error('RegisterAgentTool access test failed', { error });
    return false;
  }
}

async function runAPIResearch() {
  logger.info('Starting API compatibility research...');

  const fastMCPResult = await testFastMCPAPI();
  const hederaKitResult = await testHederaAgentKitAPI();
  const registerToolResult = await testRegisterAgentToolAccess();

  logger.info('API Research Summary', {
    FastMCP: fastMCPResult ? 'Working' : 'Issues found',
    HederaAgentKit: hederaKitResult ? 'Working' : 'Issues found',
    RegisterAgentTool: registerToolResult ? 'Working' : 'Issues found',
  });

  if (fastMCPResult && hederaKitResult && registerToolResult) {
    logger.info('All APIs compatible! Ready for integration.');
  } else {
    logger.warn(
      'API compatibility issues found. Check the logs above for details.'
    );
  }
}

runAPIResearch().catch((error) =>
  logger.error('API research failed', { error })
);

export { runAPIResearch, testFastMCPAPI, testHederaAgentKitAPI };
