import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis-mock';
import { RateLimiter } from '../../auth/rate-limiter';

describe('RateLimiter Integration Tests', () => {
  let redis: Redis;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    redis = new Redis();
    rateLimiter = new RateLimiter({
      redis,
      windowMs: 60000,
      maxRequests: 10,
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  describe('Rate Limiting Behavior', () => {
    it('should allow requests within limit', async () => {
      const identifier = 'user-123';

      for (let i = 0; i < 10; i++) {
        const allowed = await rateLimiter.checkLimit(identifier);
        expect(allowed).toBe(true);
      }
    });

    it('should block requests exceeding limit', async () => {
      const identifier = 'user-123';

      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(identifier);
      }

      const allowed = await rateLimiter.checkLimit(identifier);
      expect(allowed).toBe(false);
    });

    it('should track different identifiers separately', async () => {
      const user1 = 'user-123';
      const user2 = 'user-456';

      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkLimit(user1);
      }

      expect(await rateLimiter.checkLimit(user1)).toBe(false);

      expect(await rateLimiter.checkLimit(user2)).toBe(true);
    });

    it('should reset after window expires', async () => {
      const identifier = 'user-123';
      const shortWindowLimiter = new RateLimiter({
        redis,
        windowMs: 100,
        maxRequests: 2,
      });

      await shortWindowLimiter.checkLimit(identifier);
      await shortWindowLimiter.checkLimit(identifier);

      expect(await shortWindowLimiter.checkLimit(identifier)).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(await shortWindowLimiter.checkLimit(identifier)).toBe(true);
    });
  });

  describe('Custom Rate Limits', () => {
    it('should apply custom limits per endpoint', async () => {
      const identifier = 'user-123';
      const endpoint = 'expensive-operation';

      const allowed1 = await rateLimiter.checkLimit(identifier, endpoint, 2);
      const allowed2 = await rateLimiter.checkLimit(identifier, endpoint, 2);
      const allowed3 = await rateLimiter.checkLimit(identifier, endpoint, 2);

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true);
      expect(allowed3).toBe(false);

      const regularAllowed = await rateLimiter.checkLimit(
        identifier,
        'regular-operation',
      );
      expect(regularAllowed).toBe(true);
    });
  });

  describe('Rate Limit Info', () => {
    it('should return rate limit info', async () => {
      const identifier = 'user-123';

      await rateLimiter.checkLimit(identifier);
      await rateLimiter.checkLimit(identifier);

      const info = await rateLimiter.getRateLimitInfo(identifier);

      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(8);
      expect(info.resetAt).toBeInstanceOf(Date);
      expect(info.resetAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should show zero remaining when limit exceeded', async () => {
      const identifier = 'user-123';

      for (let i = 0; i < 11; i++) {
        await rateLimiter.checkLimit(identifier);
      }

      const info = await rateLimiter.getRateLimitInfo(identifier);
      expect(info.remaining).toBe(0);
    });
  });

  describe('Sliding Window Algorithm', () => {
    it('should implement sliding window correctly', async () => {
      const identifier = 'user-123';
      const slidingWindowLimiter = new RateLimiter({
        redis,
        windowMs: 1000,
        maxRequests: 5,
        algorithm: 'sliding-window',
      });

      for (let i = 0; i < 3; i++) {
        const allowed = await slidingWindowLimiter.checkLimit(identifier);
        expect(allowed).toBe(true);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      for (let i = 0; i < 2; i++) {
        const allowed = await slidingWindowLimiter.checkLimit(identifier);
        expect(allowed).toBe(true);
      }

      const blocked = await slidingWindowLimiter.checkLimit(identifier);
      expect(blocked).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 510));

      const allowedAfterWait = await slidingWindowLimiter.checkLimit(identifier);
      expect(allowedAfterWait).toBe(true);
    });
  });

  describe('Distributed Rate Limiting', () => {
    it('should work across multiple instances', async () => {
      const identifier = 'user-123';

      const limiter1 = new RateLimiter({
        redis,
        windowMs: 60000,
        maxRequests: 5,
      });
      const limiter2 = new RateLimiter({
        redis,
        windowMs: 60000,
        maxRequests: 5,
      });

      await limiter1.checkLimit(identifier);
      await limiter1.checkLimit(identifier);
      await limiter2.checkLimit(identifier);
      await limiter2.checkLimit(identifier);
      await limiter1.checkLimit(identifier);

      expect(await limiter1.checkLimit(identifier)).toBe(false);
      expect(await limiter2.checkLimit(identifier)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis errors gracefully', async () => {
      const identifier = 'user-123';

      const faultyRedis = {
        incr: async () => {
          throw new Error('Redis error');
        },
        pexpire: async () => {
          throw new Error('Redis error');
        },
        ttl: async () => {
          throw new Error('Redis error');
        },
        pttl: async () => {
          throw new Error('Redis error');
        },
        get: async () => {
          throw new Error('Redis error');
        },
        zremrangebyscore: async () => {
          throw new Error('Redis error');
        },
        zcard: async () => {
          throw new Error('Redis error');
        },
        zadd: async () => {
          throw new Error('Redis error');
        },
      } as any;

      const faultyLimiter = new RateLimiter({
        redis: faultyRedis,
        windowMs: 60000,
        maxRequests: 10,
        skipFailedRequests: true,
      });

      const allowed = await faultyLimiter.checkLimit(identifier);
      expect(allowed).toBe(true);
    });

    it('should block on Redis errors if configured', async () => {
      const identifier = 'user-123';

      const faultyRedis = {
        incr: async () => {
          throw new Error('Redis error');
        },
        pexpire: async () => {
          throw new Error('Redis error');
        },
      } as any;

      const strictLimiter = new RateLimiter({
        redis: faultyRedis,
        windowMs: 60000,
        maxRequests: 10,
        skipFailedRequests: false,
      });

      const allowed = await strictLimiter.checkLimit(identifier);
      expect(allowed).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should clean up expired keys', async () => {
      const identifier = 'user-123';
      const shortWindowLimiter = new RateLimiter({
        redis,
        windowMs: 100,
        maxRequests: 5,
      });

      await shortWindowLimiter.checkLimit(identifier);

      const key = `rate-limit:${identifier}`;
      const exists = await redis.exists(key);
      expect(exists).toBe(1);

      await new Promise(resolve => setTimeout(resolve, 150));

      const stillExists = await redis.exists(key);
      expect(stillExists).toBe(0);
    });
  });
});
