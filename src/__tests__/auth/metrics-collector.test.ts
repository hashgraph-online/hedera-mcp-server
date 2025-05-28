import { describe, it, expect, beforeEach } from '@jest/globals';
import { MetricsCollector } from '../../auth/metrics-collector';
import { register } from 'prom-client';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;

  beforeEach(() => {
    register.clear();
    metricsCollector = new MetricsCollector();
  });

  describe('Authentication Metrics', () => {
    it('should record authentication requests', async () => {
      metricsCollector.recordAuthRequest('api_key');
      metricsCollector.recordAuthRequest('api_key');
      metricsCollector.recordAuthRequest('mcp');
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('auth_requests_total{method="api_key"} 2');
      expect(metrics).toContain('auth_requests_total{method="mcp"} 1');
    });

    it('should record authentication successes', async () => {
      metricsCollector.recordAuthSuccess('api_key');
      metricsCollector.recordAuthSuccess('mcp');
      metricsCollector.recordAuthSuccess('mcp');
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('auth_success_total{method="api_key"} 1');
      expect(metrics).toContain('auth_success_total{method="mcp"} 2');
    });

    it('should record authentication failures with reasons', async () => {
      metricsCollector.recordAuthFailure('api_key', 'invalid');
      metricsCollector.recordAuthFailure('api_key', 'expired');
      metricsCollector.recordAuthFailure('mcp', 'missing');
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('auth_failures_total{method="api_key",reason="invalid"} 1');
      expect(metrics).toContain('auth_failures_total{method="api_key",reason="expired"} 1');
      expect(metrics).toContain('auth_failures_total{method="mcp",reason="missing"} 1');
    });
  });

  describe('API Key Metrics', () => {
    it('should track active API keys count', async () => {
      metricsCollector.setActiveApiKeys(42);
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('api_keys_active_total 42');
    });

    it('should update active API keys count', async () => {
      metricsCollector.setActiveApiKeys(10);
      metricsCollector.setActiveApiKeys(15);
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('api_keys_active_total 15');
    });

    it('should record API key age distribution', async () => {
      metricsCollector.recordApiKeyAge(5);
      metricsCollector.recordApiKeyAge(15);
      metricsCollector.recordApiKeyAge(45);
      metricsCollector.recordApiKeyAge(100);
      metricsCollector.recordApiKeyAge(200);
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toMatch(/api_key_age_days_bucket\{le="7"\} 1/);
      expect(metrics).toMatch(/api_key_age_days_bucket\{le="30"\} 2/);
      expect(metrics).toMatch(/api_key_age_days_bucket\{le="60"\} 3/);
      expect(metrics).toMatch(/api_key_age_days_bucket\{le="90"\} 3/);
      expect(metrics).toMatch(/api_key_age_days_bucket\{le="180"\} 4/);
      expect(metrics).toMatch(/api_key_age_days_bucket\{le="365"\} 5/);
    });
  });

  describe('Rate Limiting Metrics', () => {
    it('should record rate limit violations by endpoint', async () => {
      metricsCollector.recordRateLimitExceeded('get_balance');
      metricsCollector.recordRateLimitExceeded('get_balance');
      metricsCollector.recordRateLimitExceeded('send_transaction');
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('rate_limit_exceeded_total{endpoint="get_balance"} 2');
      expect(metrics).toContain('rate_limit_exceeded_total{endpoint="send_transaction"} 1');
    });
  });

  describe('Anomaly Detection Metrics', () => {
    it('should record anomaly detections by type', async () => {
      metricsCollector.recordAnomalyDetection('0.0.12345', 'rapid_requests');
      metricsCollector.recordAnomalyDetection('0.0.12345', 'endpoint_scanning');
      metricsCollector.recordAnomalyDetection('0.0.67890', 'rapid_requests');
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('anomaly_detections_total{account_id="0.0.12345",type="rapid_requests"} 1');
      expect(metrics).toContain('anomaly_detections_total{account_id="0.0.12345",type="endpoint_scanning"} 1');
      expect(metrics).toContain('anomaly_detections_total{account_id="0.0.67890",type="rapid_requests"} 1');
    });
  });

  describe('Performance Metrics', () => {
    it('should record database query durations', async () => {
      metricsCollector.recordDbQueryDuration('select', 0.002);
      metricsCollector.recordDbQueryDuration('select', 0.008);
      metricsCollector.recordDbQueryDuration('insert', 0.015);
      metricsCollector.recordDbQueryDuration('update', 0.150);
      metricsCollector.recordDbQueryDuration('complex_query', 1.5);
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toMatch(/db_query_duration_seconds_bucket\{le="0.005",operation="select"\} 1/);
      expect(metrics).toMatch(/db_query_duration_seconds_bucket\{le="0.01",operation="select"\} 2/);
      expect(metrics).toMatch(/db_query_duration_seconds_bucket\{le="0.05",operation="insert"\} 1/);
      expect(metrics).toMatch(/db_query_duration_seconds_bucket\{le="0.5",operation="update"\} 1/);
      expect(metrics).toMatch(/db_query_duration_seconds_bucket\{le="5",operation="complex_query"\} 1/);
    });
  });

  describe('Metrics Format', () => {
    it('should return metrics in Prometheus format', async () => {
      metricsCollector.recordAuthRequest('api_key');
      metricsCollector.setActiveApiKeys(10);
      
      const metrics = await metricsCollector.getMetrics();
      const contentType = metricsCollector.getContentType();
      
      expect(contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should include all metric types', async () => {
      metricsCollector.recordAuthRequest('api_key');
      metricsCollector.recordAuthSuccess('api_key');
      metricsCollector.recordAuthFailure('mcp', 'invalid');
      metricsCollector.setActiveApiKeys(5);
      metricsCollector.recordApiKeyAge(30);
      metricsCollector.recordRateLimitExceeded('test_endpoint');
      metricsCollector.recordAnomalyDetection('0.0.12345', 'test_anomaly');
      metricsCollector.recordDbQueryDuration('select', 0.005);
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('auth_requests_total');
      expect(metrics).toContain('auth_success_total');
      expect(metrics).toContain('auth_failures_total');
      expect(metrics).toContain('api_keys_active_total');
      expect(metrics).toContain('api_key_age_days');
      expect(metrics).toContain('rate_limit_exceeded_total');
      expect(metrics).toContain('anomaly_detections_total');
      expect(metrics).toContain('db_query_duration_seconds');
    });
  });

  describe('Concurrent Updates', () => {
    it('should handle concurrent metric updates', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(metricsCollector.recordAuthRequest('api_key'));
        promises.push(metricsCollector.recordAuthSuccess('api_key'));
        if (i % 10 === 0) {
          promises.push(metricsCollector.recordAuthFailure('api_key', 'invalid'));
        }
      }
      
      await Promise.all(promises);
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(metrics).toContain('auth_requests_total{method="api_key"} 100');
      expect(metrics).toContain('auth_success_total{method="api_key"} 100');
      expect(metrics).toContain('auth_failures_total{method="api_key",reason="invalid"} 10');
    });
  });
});