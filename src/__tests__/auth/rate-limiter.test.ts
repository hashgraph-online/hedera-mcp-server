import { describe, it, expect, beforeEach } from '@jest/globals';
import { RateLimiter } from '../../auth/rate-limiter';

describe('RateLimiter', () => {
  let mockRedis: any;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    mockRedis = {
      incr: jest.fn().mockResolvedValue(1),
      pexpire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      pttl: jest.fn().mockResolvedValue(-1),
      zremrangebyscore: jest.fn().mockResolvedValue(0),
      zcard: jest.fn().mockResolvedValue(0),
      zadd: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0)
    };

    rateLimiter = new RateLimiter({
      redis: mockRedis,
      windowMs: 60000,
      maxRequests: 10
    });
  });

  describe('checkLimit', () => {
    it('should allow first request', async () => {
      const allowed = await rateLimiter.checkLimit('user-123');
      expect(allowed).toBe(true);
      expect(mockRedis.incr).toHaveBeenCalledWith('rate-limit:user-123');
    });

    it('should set expiry on first request', async () => {
      await rateLimiter.checkLimit('user-123');
      expect(mockRedis.pexpire).toHaveBeenCalledWith('rate-limit:user-123', 60000);
    });

    it('should block after limit exceeded', async () => {
      mockRedis.incr.mockResolvedValue(11);
      const allowed = await rateLimiter.checkLimit('user-123');
      expect(allowed).toBe(false);
    });

    it('should handle custom limits per endpoint', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const allowed = await rateLimiter.checkLimit('user-123', 'expensive-op', 2);
      expect(allowed).toBe(false);
    });

    it('should handle Redis errors', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis error'));
      
      const allowed = await rateLimiter.checkLimit('user-123');
      expect(allowed).toBe(false);
    });

    it('should allow on Redis error if configured', async () => {
      rateLimiter = new RateLimiter({
        redis: mockRedis,
        windowMs: 60000,
        maxRequests: 10,
        skipFailedRequests: true
      });

      mockRedis.incr.mockRejectedValue(new Error('Redis error'));
      const allowed = await rateLimiter.checkLimit('user-123');
      expect(allowed).toBe(true);
    });
  });

  describe('sliding window algorithm', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter({
        redis: mockRedis,
        windowMs: 60000,
        maxRequests: 10,
        algorithm: 'sliding-window'
      });
    });

    it('should use sorted sets for sliding window', async () => {
      await rateLimiter.checkLimit('user-123');
      
      expect(mockRedis.zremrangebyscore).toHaveBeenCalled();
      expect(mockRedis.zcard).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
    });

    it('should block when limit reached', async () => {
      mockRedis.zcard.mockResolvedValue(10);
      const allowed = await rateLimiter.checkLimit('user-123');
      expect(allowed).toBe(false);
      expect(mockRedis.zadd).not.toHaveBeenCalled();
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return rate limit info', async () => {
      mockRedis.get.mockResolvedValue('5');
      mockRedis.pttl.mockResolvedValue(30000);

      const info = await rateLimiter.getRateLimitInfo('user-123');
      
      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(5);
      expect(info.resetAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should handle no previous requests', async () => {
      const info = await rateLimiter.getRateLimitInfo('user-123');
      
      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(10);
    });

    it('should handle sliding window info', async () => {
      rateLimiter = new RateLimiter({
        redis: mockRedis,
        windowMs: 60000,
        maxRequests: 10,
        algorithm: 'sliding-window'
      });

      mockRedis.zcard.mockResolvedValue(3);

      const info = await rateLimiter.getRateLimitInfo('user-123');
      
      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(7);
    });
  });
});