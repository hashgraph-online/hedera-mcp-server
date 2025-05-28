/**
 * Manages port allocation for tests to prevent conflicts
 */
export class PortManager {
  private static usedPorts = new Set<number>();
  private static basePort = 14000;
  private static currentPort = PortManager.basePort;

  /**
   * Get a unique port for testing
   */
  static getPort(): number {
    let port = this.currentPort++;

    while (this.usedPorts.has(port)) {
      port = this.currentPort++;
    }

    this.usedPorts.add(port);
    return port;
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
