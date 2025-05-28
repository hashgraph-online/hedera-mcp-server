/**
 * Test setup file for Jest
 * Configures global test environment for credit system integration tests
 */
import { jest } from '@jest/globals';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

Object.defineProperty(global, 'window', {
  value: undefined,
  writable: true
});
jest.setTimeout(60000);

process.setMaxListeners(50);

const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: originalConsole.error,
};
process.env.NODE_ENV = 'test';
process.env.DISABLE_LOGS = 'true';
process.env.LOG_LEVEL = 'error';

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(() => Promise.resolve({ ext: 'png', mime: 'image/png' })),
  fileTypeFromFile: jest.fn(() => Promise.resolve({ ext: 'png', mime: 'image/png' })),
  fileTypeFromStream: jest.fn(() => Promise.resolve({ ext: 'png', mime: 'image/png' }))
}));