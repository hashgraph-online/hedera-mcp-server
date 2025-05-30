/**
 * Bootstrap file that MUST run before any other imports
 * This ensures stdout is properly intercepted for STDIO mode
 */

const isStdioMode = process.env.MCP_TRANSPORT === 'stdio';
const disableLogs = process.env.DISABLE_LOGS === 'true';

if (isStdioMode || disableLogs) {
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalConsoleDebug = console.debug;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);

  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.debug = noop;

  if (isStdioMode) {
    (process.stdout as any).write = function (
      chunk: any,
      encoding?: any,
      callback?: any,
    ): boolean {
      const str = chunk?.toString ? chunk.toString() : String(chunk);

      const trimmed = str.trim();
      if (trimmed && trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.jsonrpc === '2.0') {
            return originalStdoutWrite(chunk, encoding, callback);
          }
        } catch (e) {
        }
      } else if (str === '\n' || str === '\r\n') {
        return originalStdoutWrite(chunk, encoding, callback);
      }

      if (typeof encoding === 'function') {
        encoding();
      } else if (typeof callback === 'function') {
        callback();
      }
      return true;
    };
  }

  process.on('exit', () => {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
    if (isStdioMode) {
      (process.stdout as any).write = originalStdoutWrite;
    }
  });
}
