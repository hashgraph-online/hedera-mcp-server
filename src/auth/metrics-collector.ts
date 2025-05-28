import { Counter, Histogram, Gauge, register } from 'prom-client';

/**
 * Collects and exposes authentication metrics for monitoring
 */
export class MetricsCollector {
  private authRequests: Counter;
  private authSuccess: Counter;
  private authFailures: Counter;
  private apiKeysActive: Gauge;
  private apiKeyAge: Histogram;
  private rateLimitExceeded: Counter;
  private anomalyDetections: Counter;
  private dbQueryDuration: Histogram;

  constructor() {
    this.authRequests = new Counter({
      name: 'auth_requests_total',
      help: 'Total number of authentication requests',
      labelNames: ['method']
    });

    this.authSuccess = new Counter({
      name: 'auth_success_total',
      help: 'Total number of successful authentications',
      labelNames: ['method']
    });

    this.authFailures = new Counter({
      name: 'auth_failures_total',
      help: 'Total number of failed authentications',
      labelNames: ['method', 'reason']
    });

    this.apiKeysActive = new Gauge({
      name: 'api_keys_active_total',
      help: 'Total number of active API keys'
    });

    this.apiKeyAge = new Histogram({
      name: 'api_key_age_days',
      help: 'Age of API keys in days',
      buckets: [1, 7, 30, 60, 90, 180, 365]
    });

    this.rateLimitExceeded = new Counter({
      name: 'rate_limit_exceeded_total',
      help: 'Total number of rate limit violations',
      labelNames: ['endpoint']
    });

    this.anomalyDetections = new Counter({
      name: 'anomaly_detections_total',
      help: 'Total number of anomaly detections',
      labelNames: ['account_id', 'type']
    });

    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]
    });
  }

  recordAuthRequest(method: string): void {
    this.authRequests.inc({ method });
  }

  recordAuthSuccess(method: string): void {
    this.authSuccess.inc({ method });
  }

  recordAuthFailure(method: string, reason: string): void {
    this.authFailures.inc({ method, reason });
  }

  setActiveApiKeys(count: number): void {
    this.apiKeysActive.set(count);
  }

  recordApiKeyAge(ageInDays: number): void {
    this.apiKeyAge.observe(ageInDays);
  }

  recordRateLimitExceeded(endpoint: string): void {
    this.rateLimitExceeded.inc({ endpoint });
  }

  recordAnomalyDetection(accountId: string, type: string): void {
    this.anomalyDetections.inc({ account_id: accountId, type });
  }

  recordDbQueryDuration(operation: string, durationSeconds: number): void {
    this.dbQueryDuration.observe({ operation }, durationSeconds);
  }

  getMetrics(): Promise<string> {
    return register.metrics();
  }

  getContentType(): string {
    return register.contentType;
  }
}

export const metricsCollector = new MetricsCollector();