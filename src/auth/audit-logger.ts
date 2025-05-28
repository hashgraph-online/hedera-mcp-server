import { Logger } from '@hashgraphonline/standards-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface AuditEvent {
  eventType: 'auth.challenge' | 'auth.verify' | 'auth.success' | 'auth.failure' | 
             'key.created' | 'key.rotated' | 'key.revoked' | 'key.suspended' |
             'anomaly.detected' | 'request.authenticated' | 'request.denied';
  timestamp: string;
  accountId?: string;
  apiKeyId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  details?: Record<string, any>;
  severity: 'info' | 'warn' | 'error' | 'critical';
}

export interface AuditLoggerConfig {
  logger: Logger;
  logDir?: string;
  maxFileSize?: number;
  retentionDays?: number;
  webhookUrl?: string;
}

/**
 * Audit logger for security events with SIEM-compatible output
 */
export class AuditLogger {
  private logger: Logger;
  private logDir: string;
  private maxFileSize: number;
  private retentionDays: number;
  private webhookUrl?: string;
  private currentLogFile?: string;
  private writeStream?: fs.FileHandle;

  constructor(config: AuditLoggerConfig) {
    this.logger = config.logger;
    this.logDir = config.logDir || './audit-logs';
    this.maxFileSize = config.maxFileSize || 100 * 1024 * 1024;
    this.retentionDays = config.retentionDays || 90;
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * Initialize the audit logger
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.logDir, { recursive: true });
    await this.rotateLogFile();
    await this.cleanupOldLogs();
  }

  /**
   * Log an audit event
   */
  async logEvent(event: AuditEvent): Promise<void> {
    const logEntry = this.formatLogEntry(event);
    
    await this.writeToFile(logEntry);
    
    this.logger.info('Audit event', {
      eventType: event.eventType,
      severity: event.severity,
      accountId: event.accountId,
      apiKeyId: event.apiKeyId
    });

    if (event.severity === 'critical' && this.webhookUrl) {
      await this.sendWebhook(event);
    }
  }

  /**
   * Log authentication challenge request
   */
  async logChallengeRequest(accountId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.logEvent({
      eventType: 'auth.challenge',
      timestamp: new Date().toISOString(),
      accountId,
      ipAddress,
      userAgent,
      severity: 'info'
    });
  }

  /**
   * Log authentication verification attempt
   */
  async logVerificationAttempt(
    accountId: string, 
    success: boolean, 
    ipAddress?: string, 
    userAgent?: string,
    reason?: string
  ): Promise<void> {
    await this.logEvent({
      eventType: success ? 'auth.success' : 'auth.failure',
      timestamp: new Date().toISOString(),
      accountId,
      ipAddress,
      userAgent,
      details: reason ? { reason } : undefined,
      severity: success ? 'info' : 'warn'
    });
  }

  /**
   * Log API key lifecycle events
   */
  async logKeyEvent(
    eventType: 'key.created' | 'key.rotated' | 'key.revoked' | 'key.suspended',
    accountId: string,
    apiKeyId: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      eventType,
      timestamp: new Date().toISOString(),
      accountId,
      apiKeyId,
      details,
      severity: eventType === 'key.suspended' ? 'warn' : 'info'
    });
  }

  /**
   * Log authenticated request
   */
  async logAuthenticatedRequest(
    apiKeyId: string,
    accountId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    requestId?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.logEvent({
      eventType: 'request.authenticated',
      timestamp: new Date().toISOString(),
      accountId,
      apiKeyId,
      endpoint,
      method,
      statusCode,
      requestId,
      ipAddress,
      severity: 'info'
    });
  }

  /**
   * Log denied request
   */
  async logDeniedRequest(
    endpoint: string,
    method: string,
    reason: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      eventType: 'request.denied',
      timestamp: new Date().toISOString(),
      endpoint,
      method,
      ipAddress,
      userAgent,
      details: { reason },
      severity: 'warn'
    });
  }

  /**
   * Format log entry for SIEM compatibility
   */
  private formatLogEntry(event: AuditEvent): string {
    const syslogSeverity = this.getSyslogSeverity(event.severity);
    const facility = 16;
    const priority = facility * 8 + syslogSeverity;
    
    const cef = [
      `CEF:0`,
      `HashgraphMCP`,
      `MCPServer`,
      `1.0`,
      event.eventType,
      event.eventType.replace(/\./g, ' '),
      syslogSeverity,
      this.formatCEFExtensions(event)
    ].join('|');

    const syslog = `<${priority}>${event.timestamp} mcp-server ${cef}`;
    
    return JSON.stringify({
      ...event,
      syslog,
      cef,
      _meta: {
        version: '1.0',
        format: 'json+syslog+cef'
      }
    }) + '\n';
  }

  /**
   * Format CEF extensions
   */
  private formatCEFExtensions(event: AuditEvent): string {
    const extensions: string[] = [];
    
    if (event.accountId) extensions.push(`suser=${event.accountId}`);
    if (event.apiKeyId) extensions.push(`cs1=${event.apiKeyId} cs1Label=ApiKeyId`);
    if (event.ipAddress) extensions.push(`src=${event.ipAddress}`);
    if (event.userAgent) extensions.push(`requestClientApplication=${event.userAgent}`);
    if (event.requestId) extensions.push(`cs2=${event.requestId} cs2Label=RequestId`);
    if (event.endpoint) extensions.push(`request=${event.endpoint}`);
    if (event.method) extensions.push(`requestMethod=${event.method}`);
    if (event.statusCode) extensions.push(`outcome=${event.statusCode < 400 ? 'success' : 'failure'}`);
    
    return extensions.join(' ');
  }

  /**
   * Get syslog severity from event severity
   */
  private getSyslogSeverity(severity: AuditEvent['severity']): number {
    switch (severity) {
      case 'critical': return 2;
      case 'error': return 3;
      case 'warn': return 4;
      case 'info': return 6;
      default: return 6;
    }
  }

  /**
   * Write log entry to file
   */
  private async writeToFile(logEntry: string): Promise<void> {
    if (!this.writeStream) {
      await this.openLogFile();
    }

    try {
      await this.writeStream!.write(logEntry);
      
      const stats = await this.writeStream!.stat();
      if (stats.size >= this.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch (error) {
      this.logger.error('Failed to write audit log', { error });
      await this.rotateLogFile();
    }
  }

  /**
   * Open current log file
   */
  private async openLogFile(): Promise<void> {
    const filename = `audit-${new Date().toISOString().split('T')[0]}.log`;
    this.currentLogFile = path.join(this.logDir, filename);
    
    this.writeStream = await fs.open(this.currentLogFile, 'a');
  }

  /**
   * Rotate log file
   */
  private async rotateLogFile(): Promise<void> {
    if (this.writeStream) {
      await this.writeStream.close();
    }
    
    await this.openLogFile();
  }

  /**
   * Clean up old log files
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      for (const file of files) {
        if (!file.startsWith('audit-') || !file.endsWith('.log')) continue;
        
        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          this.logger.info('Deleted old audit log', { file });
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old logs', { error });
    }
  }

  /**
   * Send webhook for critical events
   */
  private async sendWebhook(event: AuditEvent): Promise<void> {
    if (!this.webhookUrl) return;
    
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event: 'security_alert',
          audit: event,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      this.logger.error('Failed to send audit webhook', { error });
    }
  }

  /**
   * Get audit trail for an account
   */
  async getAuditTrail(
    accountId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];
    const files = await fs.readdir(this.logDir);
    
    for (const file of files) {
      if (!file.startsWith('audit-') || !file.endsWith('.log')) continue;
      
      const filePath = path.join(this.logDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as AuditEvent;
          
          if (event.accountId !== accountId) continue;
          
          const eventDate = new Date(event.timestamp);
          if (startDate && eventDate < startDate) continue;
          if (endDate && eventDate > endDate) continue;
          
          events.push(event);
        } catch (error) {
        }
      }
    }
    
    return events.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Close the audit logger
   */
  async close(): Promise<void> {
    if (this.writeStream) {
      await this.writeStream.close();
    }
  }
}