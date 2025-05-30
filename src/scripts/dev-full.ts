#!/usr/bin/env tsx
/**
 * Development script that runs both MCP server and Admin portal
 *
 * Port Layout:
 * - 3000: MCP Server (FastMCP SSE/HTTP)
 * - 3001: Admin Portal (Next.js)
 * - 3002: HTTP API (for admin operations)
 */
import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import boxen from 'boxen';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');
const adminPortalDir = join(rootDir, 'admin-portal');

if (!fs.existsSync(join(rootDir, '.env'))) {
  console.error(
    chalk.red(
      '❌ .env file not found! Please copy env.example to .env and configure it.',
    ),
  );
  process.exit(1);
}

import dotenv from 'dotenv';
dotenv.config({ path: join(rootDir, '.env') });

let mcpServerProcess: ChildProcess | null = null;
let adminPortalProcess: ChildProcess | null = null;
let mcpServerReady = false;
let adminPortalReady = false;
let showLogs = false;
let mcpServerRestartCount = 0;
let lastMcpServerExit = 0;

const logBuffer: { source: string; message: string; type: 'info' | 'error' }[] =
  [];
const MAX_LOGS = 200;

console.clear();

function showBanner() {
  console.clear();

  const banner = boxen(
    chalk.bold.blue('🚀 Hedera MCP Full Stack') +
      '\n\n' +
      chalk.gray('MCP Server + Admin Portal') +
      '\n' +
      chalk.gray('Complete development environment'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'blue',
    },
  );

  console.log(banner);

  console.log(chalk.bold('\n📋 Services Status:'));
  console.log(
    chalk.gray('├─') +
      ` MCP Server: ${mcpServerReady ? chalk.green('✓ Running') : chalk.yellow('⏳ Starting...')} ${chalk.gray('(port 3000)')}`,
  );
  console.log(
    chalk.gray('└─') +
      ` Admin Portal: ${adminPortalReady ? chalk.green('✓ Running') : chalk.yellow('⏳ Starting...')} ${chalk.gray('(port 3001)')}\n`,
  );

  console.log(chalk.bold('🛠️  Available Actions:'));
  console.log(chalk.gray('├─') + ` ${chalk.yellow('i')} - Open MCP Inspector`);
  console.log(chalk.gray('├─') + ` ${chalk.yellow('a')} - Open Admin Portal`);
  console.log(
    chalk.gray('├─') +
      ` ${chalk.yellow('l')} - ${showLogs ? 'Hide' : 'Show'} service logs`,
  );
  console.log(chalk.gray('├─') + ` ${chalk.yellow('c')} - Clear screen`);
  console.log(
    chalk.gray('├─') + ` ${chalk.yellow('r')} - Restart all services`,
  );
  console.log(
    chalk.gray('├─') + ` ${chalk.yellow('m')} - Restart MCP server only`,
  );
  console.log(
    chalk.gray('├─') + ` ${chalk.yellow('p')} - Restart Admin portal only`,
  );
  console.log(chalk.gray('└─') + ` ${chalk.yellow('q')} - Quit\n`);

  if (showLogs && logBuffer.length > 0) {
    console.log(chalk.bold('📜 Recent Logs:'));
    console.log(chalk.gray('─'.repeat(80)));

    const recentLogs = logBuffer.slice(-15);
    recentLogs.forEach(log => {
      const prefix =
        log.type === 'error'
          ? chalk.red(`[${log.source}]`)
          : chalk.gray(`[${log.source}]`);
      console.log(`${prefix} ${log.message}`);
    });

    console.log(chalk.gray('─'.repeat(80)));
    console.log(
      chalk.gray(
        `Showing ${recentLogs.length} of ${logBuffer.length} logs. Press 'l' to hide.\n`,
      ),
    );
  }

  if (!showLogs && mcpServerReady && adminPortalReady) {
    console.log(chalk.green('✨ All services are running!'));
    console.log(
      chalk.gray('├─') + ` MCP Server: ${chalk.cyan('http://localhost:3000')}`,
    );
    console.log(
      chalk.gray('├─') +
        ` SSE Endpoint: ${chalk.cyan('http://localhost:3000/stream')}`,
    );
    console.log(
      chalk.gray('└─') +
        ` Admin Portal: ${chalk.cyan('http://localhost:3001')}\n`,
    );
    console.log(chalk.gray('💡 Press any key from the menu above...'));
  }
}

function addLog(
  source: string,
  message: string,
  type: 'info' | 'error' = 'info',
) {
  logBuffer.push({ source, message, type });
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }

  if (showLogs) {
    const prefix =
      type === 'error' ? chalk.red(`[${source}]`) : chalk.gray(`[${source}]`);
    console.log(`${prefix} ${message}`);
  }
}

function startMCPServer() {
  addLog('System', 'Starting MCP Server...', 'info');

  mcpServerProcess = spawn('tsx', ['src/index.ts'], {
    cwd: rootDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FASTMCP_PORT: process.env.FASTMCP_PORT || '3000',
      MCP_TRANSPORT: 'http',
    },
  });

  mcpServerProcess.stdout?.on('data', data => {
    const output = data.toString();
    const lines = output.split('\n').filter((line: string) => line.trim());

    lines.forEach((line: string) => {
      addLog('MCP Server', line);

      if (
        line.includes('Hedera MCP Server is running') ||
        line.includes('FastMCP server started successfully') ||
        line.includes('HTTP API server started on port')
      ) {
        mcpServerReady = true;
        showBanner();
      }
    });
  });

  mcpServerProcess.stderr?.on('data', data => {
    const output = data.toString();
    const lines = output.split('\n').filter((line: string) => line.trim());

    lines.forEach((line: string) => {
      if (
        line.includes('DeprecationWarning') ||
        line.includes('MaxListenersExceededWarning') ||
        line.includes('Consider using fromString')
      ) {
        return;
      }

      addLog('MCP Server', line, 'error');
    });
  });

  mcpServerProcess.on('exit', (code, signal) => {
    mcpServerReady = false;
    const now = Date.now();
    const timeSinceLastExit = now - lastMcpServerExit;
    lastMcpServerExit = now;

    addLog(
      'MCP Server',
      `Process exited with code ${code} and signal ${signal}`,
      'error',
    );

    if (code === 0) {
      addLog('MCP Server', 'Process exited cleanly but unexpectedly', 'error');

      if (timeSinceLastExit < 10000) {
        mcpServerRestartCount++;
        addLog(
          'MCP Server',
          `Rapid exit detected (${timeSinceLastExit}ms). Restart count: ${mcpServerRestartCount}`,
          'error',
        );

        if (mcpServerRestartCount >= 3) {
          addLog(
            'MCP Server',
            'Too many rapid restarts. Stopping auto-restart. Check logs and restart manually with "m"',
            'error',
          );
          showBanner();
          return;
        }
      } else {
        mcpServerRestartCount = 0;
      }
    }

    showBanner();
  });

  mcpServerProcess.on('error', error => {
    mcpServerReady = false;
    addLog('MCP Server', `Process error: ${error.message}`, 'error');
    showBanner();
  });
}

function startAdminPortal() {
  addLog('System', 'Starting Admin Portal...', 'info');

  if (!fs.existsSync(join(adminPortalDir, 'package.json'))) {
    addLog('Admin Portal', 'Admin portal not found or not set up', 'error');
    return;
  }

  adminPortalProcess = spawn('npm', ['run', 'dev'], {
    cwd: adminPortalDir,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env },
  });

  adminPortalProcess.stdout?.on('data', data => {
    const output = data.toString();
    const lines = output.split('\n').filter((line: string) => line.trim());

    lines.forEach((line: string) => {
      addLog('Admin Portal', line);

      if (line.includes('Ready in') || line.includes('started server on')) {
        adminPortalReady = true;
        showBanner();
      }
    });
  });

  adminPortalProcess.stderr?.on('data', data => {
    const output = data.toString();
    const lines = output.split('\n').filter((line: string) => line.trim());

    lines.forEach((line: string) => {
      if (line.includes('warn') && line.includes('Next.js')) {
        return;
      }

      addLog('Admin Portal', line, 'error');
    });
  });

  adminPortalProcess.on('exit', code => {
    adminPortalReady = false;
    addLog('Admin Portal', `Process exited with code ${code}`, 'error');
    showBanner();
  });
}

showBanner();

startMCPServer();
setTimeout(() => {
  startAdminPortal();
}, 2000);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

process.stdin.on('data', async key => {
  const keyStr = key.toString();

  if (keyStr === 'q' || keyStr === '\x03') {
    console.log(chalk.yellow('\n\n👋 Shutting down all services...'));
    mcpServerProcess?.kill();
    adminPortalProcess?.kill();
    process.exit(0);
  }

  switch (keyStr) {
    case 'l':
      showLogs = !showLogs;
      showBanner();
      break;

    case 'c':
      showBanner();
      break;

    case 'i':
      if (!mcpServerReady) {
        console.log(
          chalk.yellow('\n⏳ Please wait for MCP server to start...'),
        );
        setTimeout(() => showBanner(), 2000);
        return;
      }

      console.log(chalk.blue('\n🔍 Opening MCP Inspector...'));
      const inspector = spawn(
        'npx',
        ['@modelcontextprotocol/inspector', 'http://localhost:3000/stream'],
        {
          stdio: 'inherit',
          shell: true,
        },
      );

      inspector.on('error', err => {
        console.error(chalk.red('Failed to start inspector:'), err);
      });
      break;

    case 'a':
      if (!adminPortalReady) {
        console.log(
          chalk.yellow('\n⏳ Please wait for Admin Portal to start...'),
        );
        setTimeout(() => showBanner(), 2000);
        return;
      }

      console.log(chalk.blue('\n🌐 Opening Admin Portal...'));
      const openCmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';

      spawn(openCmd, ['http://localhost:3001'], { shell: true });
      setTimeout(() => showBanner(), 2000);
      break;

    case 'r':
      console.log(chalk.yellow('\n🔄 Restarting all services...'));
      mcpServerProcess?.kill();
      adminPortalProcess?.kill();
      mcpServerReady = false;
      adminPortalReady = false;
      mcpServerRestartCount = 0;
      lastMcpServerExit = 0;
      logBuffer.length = 0;

      setTimeout(() => {
        showBanner();
        startMCPServer();
        setTimeout(() => startAdminPortal(), 2000);
      }, 1000);
      break;

    case 'm':
      console.log(chalk.yellow('\n🔄 Restarting MCP server...'));
      mcpServerProcess?.kill();
      mcpServerReady = false;
      mcpServerRestartCount = 0;
      lastMcpServerExit = 0;

      setTimeout(() => {
        startMCPServer();
      }, 1000);
      break;

    case 'p':
      console.log(chalk.yellow('\n🔄 Restarting Admin portal...'));
      adminPortalProcess?.kill();
      adminPortalReady = false;

      setTimeout(() => {
        startAdminPortal();
      }, 1000);
      break;
  }
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Shutting down all services...'));
  mcpServerProcess?.kill();
  adminPortalProcess?.kill();
  process.exit(0);
});

process.on('exit', () => {
  mcpServerProcess?.kill();
  adminPortalProcess?.kill();
});
