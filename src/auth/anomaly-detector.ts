import { Logger } from '@hashgraphonline/standards-sdk';
import Redis from 'ioredis';
import { ApiKeyService } from './api-key-service';
import * as schema from '../db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

export interface AnomalyDetectorConfig {
  redis: Redis;
  db: any;
  isPostgres: boolean;
  logger: Logger;
  apiKeyService: ApiKeyService;
  thresholds: {
    requestsPerMinute: number;
    requestsPerHour: number;
    uniqueEndpointsPerHour: number;
    errorRatePercent: number;
    newLocationAlertEnabled: boolean;
  };
}

export interface AnomalyEvent {
  type: 'spike' | 'new_location' | 'error_rate' | 'unusual_pattern';
  apiKeyId: string;
  accountId: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  details: Record<string, any>;
  timestamp: Date;
}

/**
 * Service for detecting anomalous API key usage patterns
 */
export class AnomalyDetector {
  private redis: Redis;
  private db: any;
  private isPostgres: boolean;
  private logger: Logger;
  private apiKeyService: ApiKeyService;
  private thresholds: AnomalyDetectorConfig['thresholds'];

  constructor(config: AnomalyDetectorConfig) {
    this.redis = config.redis;
    this.db = config.db;
    this.isPostgres = config.isPostgres;
    this.logger = config.logger;
    this.apiKeyService = config.apiKeyService;
    this.thresholds = config.thresholds;
  }

  /**
   * Analyze API key usage for anomalies
   */
  async analyzeUsage(apiKeyId: string, accountId: string): Promise<AnomalyEvent[]> {
    const anomalies: AnomalyEvent[] = [];

    try {
      const [
        requestSpike,
        newLocation,
        errorRate,
        unusualPattern
      ] = await Promise.all([
        this.checkRequestSpike(apiKeyId, accountId),
        this.checkNewLocation(apiKeyId, accountId),
        this.checkErrorRate(apiKeyId, accountId),
        this.checkUnusualPattern(apiKeyId, accountId)
      ]);

      if (requestSpike) anomalies.push(requestSpike);
      if (newLocation) anomalies.push(newLocation);
      if (errorRate) anomalies.push(errorRate);
      if (unusualPattern) anomalies.push(unusualPattern);

    } catch (error) {
      this.logger.error('Error analyzing usage', { error, apiKeyId });
    }

    return anomalies;
  }

  /**
   * Check for request spikes
   */
  private async checkRequestSpike(apiKeyId: string, accountId: string): Promise<AnomalyEvent | null> {
    const minuteKey = `anomaly:requests:minute:${apiKeyId}`;
    const hourKey = `anomaly:requests:hour:${apiKeyId}`;

    const [minuteCount, hourCount] = await Promise.all([
      this.redis.incr(minuteKey),
      this.redis.incr(hourKey)
    ]);

    await Promise.all([
      this.redis.expire(minuteKey, 60),
      this.redis.expire(hourKey, 3600)
    ]);

    if (minuteCount > this.thresholds.requestsPerMinute) {
      return {
        type: 'spike',
        apiKeyId,
        accountId,
        severity: 'high',
        description: `Unusual spike in requests: ${minuteCount} requests in the last minute`,
        details: {
          minuteCount,
          threshold: this.thresholds.requestsPerMinute
        },
        timestamp: new Date()
      };
    }

    if (hourCount > this.thresholds.requestsPerHour) {
      return {
        type: 'spike',
        apiKeyId,
        accountId,
        severity: 'medium',
        description: `High request volume: ${hourCount} requests in the last hour`,
        details: {
          hourCount,
          threshold: this.thresholds.requestsPerHour
        },
        timestamp: new Date()
      };
    }

    return null;
  }

  /**
   * Check for requests from new geographic locations
   */
  private async checkNewLocation(apiKeyId: string, accountId: string): Promise<AnomalyEvent | null> {
    if (!this.thresholds.newLocationAlertEnabled) {
      return null;
    }

    const apiKeyUsage = this.isPostgres
      ? schema.pgApiKeyUsage
      : schema.sqliteApiKeyUsage;

    const recentUsage = await this.db
      .select({
        ipAddress: apiKeyUsage.ipAddress
      })
      .from(apiKeyUsage)
      .where(
        and(
          eq(apiKeyUsage.apiKeyId, apiKeyId),
          gte(apiKeyUsage.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        )
      )
      .limit(100);

    const locationKey = `anomaly:locations:${apiKeyId}`;
    const knownLocations = await this.redis.smembers(locationKey);
    
    for (const usage of recentUsage) {
      if (usage.ipAddress && !knownLocations.includes(usage.ipAddress)) {
        await this.redis.sadd(locationKey, usage.ipAddress);
        await this.redis.expire(locationKey, 30 * 24 * 60 * 60);

        if (knownLocations.length > 0) {
          return {
            type: 'new_location',
            apiKeyId,
            accountId,
            severity: 'low',
            description: `API key used from new IP address: ${usage.ipAddress}`,
            details: {
              newIp: usage.ipAddress,
              knownIps: knownLocations
            },
            timestamp: new Date()
          };
        }
      }
    }

    return null;
  }

  /**
   * Check for high error rates
   */
  private async checkErrorRate(apiKeyId: string, accountId: string): Promise<AnomalyEvent | null> {
    const apiKeyUsage = this.isPostgres
      ? schema.pgApiKeyUsage
      : schema.sqliteApiKeyUsage;

    const recentUsage = await this.db
      .select({
        total: sql<number>`count(*)`,
        errors: sql<number>`count(case when ${apiKeyUsage.statusCode} >= 400 then 1 end)`
      })
      .from(apiKeyUsage)
      .where(
        and(
          eq(apiKeyUsage.apiKeyId, apiKeyId),
          gte(apiKeyUsage.createdAt, new Date(Date.now() - 60 * 60 * 1000).toISOString())
        )
      );

    if (recentUsage.length === 0) {
      return null;
    }

    const { total, errors } = recentUsage[0];
    const errorRate = total > 0 ? (errors / total) * 100 : 0;

    if (errorRate > this.thresholds.errorRatePercent && total >= 10) {
      return {
        type: 'error_rate',
        apiKeyId,
        accountId,
        severity: 'medium',
        description: `High error rate detected: ${errorRate.toFixed(1)}% errors`,
        details: {
          errorRate,
          totalRequests: total,
          errorRequests: errors,
          threshold: this.thresholds.errorRatePercent
        },
        timestamp: new Date()
      };
    }

    return null;
  }

  /**
   * Check for unusual usage patterns
   */
  private async checkUnusualPattern(apiKeyId: string, accountId: string): Promise<AnomalyEvent | null> {
    const apiKeyUsage = this.isPostgres
      ? schema.pgApiKeyUsage
      : schema.sqliteApiKeyUsage;

    const endpointKey = `anomaly:endpoints:${apiKeyId}`;
    const recentEndpoints = await this.redis.scard(endpointKey);

    if (recentEndpoints > this.thresholds.uniqueEndpointsPerHour) {
      return {
        type: 'unusual_pattern',
        apiKeyId,
        accountId,
        severity: 'low',
        description: `Unusual number of unique endpoints accessed: ${recentEndpoints}`,
        details: {
          uniqueEndpoints: recentEndpoints,
          threshold: this.thresholds.uniqueEndpointsPerHour
        },
        timestamp: new Date()
      };
    }

    const timePattern = await this.analyzeTimePattern(apiKeyId);
    if (timePattern) {
      return timePattern;
    }

    return null;
  }

  /**
   * Analyze time-based usage patterns
   */
  private async analyzeTimePattern(apiKeyId: string): Promise<AnomalyEvent | null> {
    const hourKey = `anomaly:hourly:${apiKeyId}:${new Date().getHours()}`;
    const historicalAvg = await this.redis.get(`anomaly:avg:${apiKeyId}:${new Date().getHours()}`);
    const currentCount = await this.redis.incr(hourKey);
    await this.redis.expire(hourKey, 3600);

    if (historicalAvg && currentCount > parseInt(historicalAvg) * 3) {
      return {
        type: 'unusual_pattern',
        apiKeyId,
        accountId: '',
        severity: 'low',
        description: `Unusual activity for this time of day`,
        details: {
          currentCount,
          historicalAverage: parseInt(historicalAvg),
          hour: new Date().getHours()
        },
        timestamp: new Date()
      };
    }

    await this.updateHistoricalAverage(apiKeyId, new Date().getHours(), currentCount);
    return null;
  }

  /**
   * Update historical averages for pattern detection
   */
  private async updateHistoricalAverage(apiKeyId: string, hour: number, count: number): Promise<void> {
    const avgKey = `anomaly:avg:${apiKeyId}:${hour}`;
    const currentAvg = await this.redis.get(avgKey);
    
    if (currentAvg) {
      const newAvg = Math.floor((parseInt(currentAvg) * 0.9) + (count * 0.1));
      await this.redis.set(avgKey, newAvg);
    } else {
      await this.redis.set(avgKey, count);
    }
    
    await this.redis.expire(avgKey, 30 * 24 * 60 * 60);
  }

  /**
   * Handle detected anomalies
   */
  async handleAnomalies(anomalies: AnomalyEvent[]): Promise<void> {
    for (const anomaly of anomalies) {
      this.logger.warn('Anomaly detected', anomaly);

      if (anomaly.severity === 'high') {
        await this.suspendApiKey(anomaly.apiKeyId, anomaly.description);
      }

      await this.recordAnomaly(anomaly);
      await this.sendAlert(anomaly);
    }
  }

  /**
   * Suspend a suspicious API key
   */
  private async suspendApiKey(apiKeyId: string, reason: string): Promise<void> {
    const apiKeys = this.isPostgres
      ? schema.pgApiKeys
      : schema.sqliteApiKeys;

    await this.db
      .update(apiKeys)
      .set({
        isActive: false,
        metadata: sql`
          CASE 
            WHEN ${this.isPostgres} 
            THEN jsonb_set(COALESCE(metadata, '{}'), '{suspendedAt}', to_jsonb(${new Date().toISOString()}::text))
            ELSE json_set(COALESCE(metadata, '{}'), '$.suspendedAt', ${new Date().toISOString()})
          END
        `,
        updatedAt: new Date().toISOString()
      })
      .where(eq(apiKeys.id, apiKeyId));

    this.logger.info('API key suspended due to anomaly', { apiKeyId, reason });
  }

  /**
   * Record anomaly in database for audit trail
   */
  private async recordAnomaly(anomaly: AnomalyEvent): Promise<void> {
    const key = `anomaly:history:${anomaly.apiKeyId}`;
    await this.redis.lpush(key, JSON.stringify(anomaly));
    await this.redis.ltrim(key, 0, 99);
    await this.redis.expire(key, 30 * 24 * 60 * 60);
  }

  /**
   * Send alert for anomaly (webhook, email, etc.)
   */
  private async sendAlert(anomaly: AnomalyEvent): Promise<void> {
    if (process.env.ANOMALY_WEBHOOK_URL) {
      try {
        await fetch(process.env.ANOMALY_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event: 'anomaly_detected',
            anomaly,
            timestamp: new Date().toISOString()
          })
        });
      } catch (error) {
        this.logger.error('Failed to send anomaly alert', { error });
      }
    }
  }

  /**
   * Get anomaly history for an API key
   */
  async getAnomalyHistory(apiKeyId: string): Promise<AnomalyEvent[]> {
    const key = `anomaly:history:${apiKeyId}`;
    const history = await this.redis.lrange(key, 0, -1);
    return history.map(h => JSON.parse(h));
  }
}