/**
 * Test setup file for Jest
 * Configures global test environment for credit system integration tests
 */
Object.defineProperty(global, 'window', {
  value: undefined,
  writable: true
});
jest.setTimeout(60000);
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
process.env.LOG_LEVEL = 'error';

// Mock file-type module for tests
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn().mockResolvedValue({ ext: 'png', mime: 'image/png' }),
  fileTypeFromFile: jest.fn().mockResolvedValue({ ext: 'png', mime: 'image/png' }),
  fileTypeFromStream: jest.fn().mockResolvedValue({ ext: 'png', mime: 'image/png' })
})); 