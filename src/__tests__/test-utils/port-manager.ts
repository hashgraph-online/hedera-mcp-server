/**
 * Manages port allocation for tests to prevent conflicts
 */
export class PortManager {
  private static usedPorts = new Set<number>();
  private static basePort = 14000 + Math.floor(Math.random() * 1000);
  private static currentPort = PortManager.basePort;
  private static portLock = new Map<number, string>();

  /**
   * Get a unique port for testing
   */
  static getPort(testName?: string): number {
    let port = this.currentPort;
    this.currentPort += 5;

    while (this.usedPorts.has(port) || this.isPortInUse(port)) {
      port = this.currentPort;
      this.currentPort += 5;
    }

    this.usedPorts.add(port);
    if (testName) {
      this.portLock.set(port, testName);
    }
    return port;
  }
  
  /**
   * Check if a port is potentially in use
   */
  private static isPortInUse(port: number): boolean {
    const reservedPorts = [3000, 3001, 3002, 8080, 8081];
    return reservedPorts.includes(port) || 
           (port >= 3000 && port <= 3010) || 
           (port >= 8080 && port <= 8090);
  }

  /**
   * Release a port when done
   */
  static releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Reset port allocation (for test cleanup)
   */
  static reset(): void {
    this.usedPorts.clear();
    this.currentPort = this.basePort;
  }
}
