#!/usr/bin/env tsx
import { spawn } from 'child_process';
import chalk from 'chalk';
import boxen from 'boxen';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '../..');

if (!fs.existsSync(join(rootDir, '.env'))) {
  console.error(
    chalk.red(
      '❌ .env file not found! Please copy env.example to .env and configure it.'
    )
  );
  process.exit(1);
}

import dotenv from 'dotenv';
dotenv.config({ path: join(rootDir, '.env') });

const SERVER_URL = `http://localhost:${process.env.PORT || 3000}`;
const SSE_URL = `${SERVER_URL}/sse`;

let serverReady = false;
let showLogs = false;
const logBuffer: string[] = [];
const MAX_LOGS = 100;

console.clear();

function showBanner() {
  console.clear();

  const banner = boxen(
    chalk.bold.blue('🚀 Hedera MCP Server') +
      '\n\n' +
      chalk.gray('FastMCP-powered server for Hedera network operations') +
      '\n' +
      chalk.gray('with comprehensive credits system'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'blue',
    }
  );

  console.log(banner);

  console.log(chalk.bold('\n📋 Configuration:'));
  console.log(
    chalk.gray('├─') +
      ` Network: ${chalk.cyan(process.env.HEDERA_NETWORK || 'testnet')}`
  );
  console.log(
    chalk.gray('├─') +
      ` Database: ${chalk.cyan(process.env.DATABASE_URL?.includes('sqlite') ? 'SQLite' : 'PostgreSQL')}`
  );
  console.log(
    chalk.gray('├─') +
      ` Server Account: ${chalk.cyan(process.env.SERVER_ACCOUNT_ID || 'Not configured')}`
  );
  console.log(
    chalk.gray('├─') + ` Port: ${chalk.cyan(process.env.PORT || 3000)}`
  );
  console.log(
    chalk.gray('└─') +
      ` Transport: ${chalk.cyan(process.env.MCP_TRANSPORT || 'both')}\n`
  );

  if (serverReady) {
    console.log(chalk.green('✅ Server is running!'));
    console.log(chalk.gray(`🌐 SSE Endpoint: ${chalk.cyan(SSE_URL)}`));
    console.log(
      chalk.gray(`📊 Admin Portal: ${chalk.cyan('http://localhost:3001')}\n`)
    );
  } else {
    console.log(chalk.yellow('🔄 Starting server...\n'));
  }

  console.log(chalk.bold('🛠️  Available Actions:'));
  console.log(chalk.gray('├─') + ` ${chalk.yellow('i')} - Open MCP Inspector`);
  console.log(chalk.gray('├─') + ` ${chalk.yellow('a')} - Open Admin Portal`);
  console.log(
    chalk.gray('├─') +
      ` ${chalk.yellow('l')} - ${showLogs ? 'Hide' : 'Show'} server logs`
  );
  console.log(chalk.gray('├─') + ` ${chalk.yellow('c')} - Clear screen`);
  console.log(
    chalk.gray('├─') + ` ${chalk.yellow('d')} - Show Docker commands`
  );
  console.log(chalk.gray('├─') + ` ${chalk.yellow('h')} - Show help`);
  console.log(chalk.gray('├─') + ` ${chalk.yellow('r')} - Restart server`);
  console.log(chalk.gray('└─') + ` ${chalk.yellow('q')} - Quit\n`);

  if (showLogs && logBuffer.length > 0) {
    console.log(chalk.bold('📜 Recent Logs:'));
    console.log(chalk.gray('─'.repeat(60)));

    const recentLogs = logBuffer.slice(-10);
    recentLogs.forEach((log) => console.log(log));

    console.log(chalk.gray('─'.repeat(60)));
    console.log(
      chalk.gray(
        `Showing ${recentLogs.length} of ${logBuffer.length} logs. Press 'l' to hide.\n`
      )
    );
  }

  if (!showLogs && serverReady) {
    console.log(chalk.gray('💡 Press any key from the menu above...'));
  }
}

showBanner();

let serverProcess = spawn('tsx', ['src/index.ts'], {
  cwd: rootDir,
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env },
});

serverProcess.stdout.on('data', (data) => {
  const output = data.toString();
  const lines = output.split('\n').filter((line: string) => line.trim());

  lines.forEach((line: string) => {
    logBuffer.push(chalk.gray('[Server] ') + line);
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.shift();
    }

    if (line.includes('Hedera MCP Server is running')) {
      serverReady = true;
      showBanner();
    }

    if (showLogs) {
      console.log(chalk.gray('[Server] ') + line);
    }
  });
});

serverProcess.stderr.on('data', (data) => {
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

    const logLine = chalk.red('[Error] ') + line;
    logBuffer.push(logLine);
    if (logBuffer.length > MAX_LOGS) {
      logBuffer.shift();
    }

    if (showLogs) {
      console.log(logLine);
    }
  });
});

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.on('data', async (key) => {
  const keyStr = key.toString();

  if (keyStr === 'q' || keyStr === '\x03') {
    console.log(chalk.yellow('\n\n👋 Shutting down...'));
    serverProcess.kill();
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
      if (!serverReady) {
        console.log(chalk.yellow('\n⏳ Please wait for server to start...'));
        return;
      }

      console.log(chalk.blue('\n🔍 Opening MCP Inspector...'));
      console.log(
        chalk.gray('Running: npx @modelcontextprotocol/inspector ' + SSE_URL)
      );

      const inspector = spawn(
        'npx',
        ['@modelcontextprotocol/inspector', SSE_URL],
        {
          stdio: 'inherit',
          shell: true,
        }
      );

      inspector.on('error', (err) => {
        console.error(chalk.red('Failed to start inspector:'), err);
      });
      break;

    case 'a':
      console.log(chalk.blue('\n🌐 Opening Admin Portal...'));
      console.log(
        chalk.yellow('Note: Admin Portal must be running separately.')
      );
      console.log(
        chalk.gray(
          'Run ' +
            chalk.cyan('npm run admin') +
            ' in another terminal, or use ' +
            chalk.cyan('npm run dev:full')
        )
      );

      const adminUrl = 'http://localhost:3001';

      const openCmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';

      spawn(openCmd, [adminUrl], { shell: true });

      setTimeout(() => {
        if (!showLogs) showBanner();
      }, 3000);
      break;

    case 'd':
      console.log(chalk.blue('\n🐳 Docker Commands:'));
      console.log(
        chalk.gray('├─') + ' Development: ' + chalk.cyan('npm run docker:dev')
      );
      console.log(
        chalk.gray('├─') +
          ' Full Stack: ' +
          chalk.cyan('npm run docker:dev:full')
      );
      console.log(
        chalk.gray('├─') +
          ' With PostgreSQL: ' +
          chalk.cyan('npm run docker:dev:postgres')
      );
      console.log(
        chalk.gray('└─') + ' Production: ' + chalk.cyan('npm run docker:prod')
      );

      setTimeout(() => {
        if (!showLogs) showBanner();
      }, 3000);
      break;

    case 'h':
      console.log(chalk.blue('\n📚 Help:'));
      console.log(
        chalk.gray('├─') + ' Server provides Hedera operations via MCP protocol'
      );
      console.log(
        chalk.gray('├─') + ' Operations consume credits (HBAR-based)'
      );
      console.log(
        chalk.gray('├─') + ' Send HBAR to server account to purchase credits'
      );
      console.log(
        chalk.gray('├─') + ' Use Inspector or Claude Desktop to interact'
      );
      console.log(
        chalk.gray('└─') + ' Admin Portal for managing credits and balances'
      );

      setTimeout(() => {
        if (!showLogs) showBanner();
      }, 3000);
      break;

    case 'r':
      console.log(chalk.yellow('\n🔄 Restarting server...'));
      serverProcess.kill();
      serverReady = false;
      logBuffer.length = 0;

      setTimeout(() => {
        showBanner();

        serverProcess = spawn('tsx', ['src/index.ts'], {
          cwd: rootDir,
          stdio: ['inherit', 'pipe', 'pipe'],
          env: { ...process.env },
        });

        serverProcess.stdout.on('data', (data) => {
          const output = data.toString();
          const lines = output
            .split('\n')
            .filter((line: string) => line.trim());

          lines.forEach((line: string) => {
            logBuffer.push(chalk.gray('[Server] ') + line);
            if (logBuffer.length > MAX_LOGS) {
              logBuffer.shift();
            }

            if (line.includes('Hedera MCP Server is running')) {
              serverReady = true;
              showBanner();
            }

            if (showLogs) {
              console.log(chalk.gray('[Server] ') + line);
            }
          });
        });

        serverProcess.stderr.on('data', (data) => {
          const output = data.toString();
          const lines = output
            .split('\n')
            .filter((line: string) => line.trim());

          lines.forEach((line: string) => {
            if (
              line.includes('DeprecationWarning') ||
              line.includes('MaxListenersExceededWarning') ||
              line.includes('Consider using fromString')
            ) {
              return;
            }

            const logLine = chalk.red('[Error] ') + line;
            logBuffer.push(logLine);
            if (logBuffer.length > MAX_LOGS) {
              logBuffer.shift();
            }

            if (showLogs) {
              console.log(logLine);
            }
          });
        });
      }, 1000);
      break;
  }
});

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n👋 Shutting down...'));
  serverProcess.kill();
  process.exit(0);
});

process.on('exit', () => {
  serverProcess.kill();
});
