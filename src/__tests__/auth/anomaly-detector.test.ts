import { describe, it, expect, beforeEach } from '@jest/globals';
import { AnomalyDetector } from '../../auth/anomaly-detector';
import { Logger } from '@hashgraphonline/standards-sdk';

describe('AnomalyDetector', () => {
  let anomalyDetector: AnomalyDetector;
  let mockRedis: any;
  let mockDb: any;
  let mockApiKeyService: any;
  let mockLogger: Logger;

  beforeEach(() => {
    mockRedis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      sadd: jest.fn().mockResolvedValue(1),
      scard: jest.fn().mockResolvedValue(1),
      lpush: jest.fn().mockResolvedValue(1),
      ltrim: jest.fn().mockResolvedValue('OK'),
      smembers: jest.fn().mockResolvedValue([]),
      lrange: jest.fn().mockResolvedValue([]),
      setex: jest.fn().mockResolvedValue('OK'),
      set: jest.fn().mockResolvedValue('OK'),
    };

    mockDb = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            all: jest.fn().mockResolvedValue([]),
            get: jest.fn().mockResolvedValue(null),
          }),
        }),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue(undefined),
      }),
    };

    mockApiKeyService = {};

    mockLogger = new Logger({
      level: 'info',
      module: 'AnomalyDetector',
      prettyPrint: false,
    });

    anomalyDetector = new AnomalyDetector({
      redis: mockRedis,
      db: mockDb,
      isPostgres: false,
      logger: mockLogger,
      apiKeyService: mockApiKeyService,
      thresholds: {
        requestsPerMinute: 30,
        requestsPerHour: 100,
        uniqueEndpointsPerHour: 10,
        errorRatePercent: 20,
        newLocationAlertEnabled: false,
      },
    });
  });

  describe('analyzeUsage', () => {
    it('should return empty array for normal usage', async () => {
      const result = await anomalyDetector.analyzeUsage('key-123', '0.0.12345');
      expect(result).toEqual([]);
    });

    it('should detect request spikes', async () => {
      const simpleDetector = new AnomalyDetector({
        redis: mockRedis,
        db: mockDb,
        isPostgres: false,
        logger: mockLogger,
        apiKeyService: mockApiKeyService,
        thresholds: {
          requestsPerMinute: 30,
          requestsPerHour: 100,
          uniqueEndpointsPerHour: 10,
          errorRatePercent: 20,
          newLocationAlertEnabled: false,
        },
      });

      mockRedis.incr
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(250)
        .mockResolvedValueOnce(1);
      
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.scard.mockResolvedValue(5);
      mockRedis.get.mockResolvedValue(null);
      
      mockDb.select = jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([{ total: 100, errors: 10 }])
        })
      });

      const result = await simpleDetector.analyzeUsage('key-123', '0.0.12345');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('spike');
      expect(result[0].severity).toBe('medium');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      const result = await anomalyDetector.analyzeUsage('key-123', '0.0.12345');

      expect(result).toEqual([]);
    });
  });

  describe('handleAnomalies', () => {
    it('should suspend API key for critical anomalies', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      });
      mockDb.update = mockUpdate;

      const criticalAnomaly = {
        type: 'spike',
        severity: 'high' as const,
        details: { count: 1000 },
        timestamp: new Date(),
        apiKeyId: 'key-123',
        accountId: '0.0.12345',
      };

      await anomalyDetector.handleAnomalies([criticalAnomaly]);

      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should not suspend for low severity anomalies', async () => {
      const mockUpdate = jest.fn();
      mockDb.update = mockUpdate;
      
      const lowAnomaly = {
        type: 'spike',
        severity: 'low' as const,
        details: { count: 35 },
        timestamp: new Date(),
        apiKeyId: 'key-123',
        accountId: '0.0.12345',
      };

      await anomalyDetector.handleAnomalies([lowAnomaly]);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('getAnomalyHistory', () => {
    it('should return anomaly history', async () => {
      const mockHistory = JSON.stringify({
        type: 'request_spike',
        timestamp: new Date().toISOString()
      });
      mockRedis.lrange.mockResolvedValue([mockHistory]);

      const history = await anomalyDetector.getAnomalyHistory('key-123');

      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('request_spike');
    });

    it('should handle empty history', async () => {
      mockRedis.lrange.mockResolvedValue([]);

      const history = await anomalyDetector.getAnomalyHistory('key-123');

      expect(history).toEqual([]);
    });
  });
});
