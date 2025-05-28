import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { Logger } from '@hashgraphonline/standards-sdk';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  handler?: (req: Request, res: Response) => void;
}

export interface RateLimitRule {
  endpoint: string;
  method?: string;
  windowMs: number;
  maxRequests: number;
}

/**
 * Creates a rate limiting middleware using Redis for distributed rate limiting
 * Implements sliding window algorithm for accurate request counting
 */
export class RateLimiter {
  private redis: Redis;
  private logger: Logger;
  private rules: Map<string, RateLimitOptions>;

  constructor(redisUrl: string, logger: Logger) {
    this.redis = new Redis(redisUrl);
    this.logger = logger;
    this.rules = new Map();
    
    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', { error: err });
    });
  }

  /**
   * Configure rate limit rules for different endpoints
   */
  configureRules(rules: RateLimitRule[]): void {
    for (const rule of rules) {
      const key = `${rule.method || '*'}:${rule.endpoint}`;
      this.rules.set(key, {
        windowMs: rule.windowMs,
        maxRequests: rule.maxRequests,
        keyPrefix: `rate_limit:${key}`,
      });
    }
  }

  /**
   * Creates middleware for a specific rate limit configuration
   */
  middleware(options: RateLimitOptions) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = this.generateKey(req, options);
        const windowMs = options.windowMs;
        const maxRequests = options.maxRequests;
        const now = Date.now();
        const windowStart = now - windowMs;

        const multi = this.redis.multi();
        
        multi.zremrangebyscore(key, '-inf', windowStart);
        multi.zadd(key, now, `${now}-${Math.random()}`);
        multi.zcard(key);
        multi.expire(key, Math.ceil(windowMs / 1000));
        
        const results = await multi.exec();
        if (!results) {
          this.logger.error('Rate limit check failed - no results from Redis');
          return next();
        }

        const requestCount = results[2]?.[1] as number || 0;

        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestCount).toString());
        res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

        if (requestCount > maxRequests) {
          res.setHeader('Retry-After', Math.ceil(windowMs / 1000).toString());
          
          if (options.handler) {
            options.handler(req, res);
          } else {
            res.status(429).json({
              error: 'Too many requests',
              message: 'Rate limit exceeded. Please try again later.',
              retryAfter: Math.ceil(windowMs / 1000),
            });
          }
          return;
        }

        next();
      } catch (error) {
        this.logger.error('Rate limit middleware error', { error });
        next();
      }
    };
  }

  /**
   * Get middleware for a specific endpoint based on configured rules
   */
  getEndpointLimiter(endpoint: string, method: string = '*') {
    const specificKey = `${method}:${endpoint}`;
    const genericKey = `*:${endpoint}`;
    
    const options = this.rules.get(specificKey) || this.rules.get(genericKey);
    
    if (!options) {
      return (_req: Request, _res: Response, next: NextFunction) => next();
    }

    return this.middleware(options);
  }

  /**
   * Generate rate limit key for a request
   */
  private generateKey(req: Request, options: RateLimitOptions): string {
    const prefix = options.keyPrefix || 'rate_limit';
    
    if (options.keyGenerator) {
      return `${prefix}:${options.keyGenerator(req)}`;
    }

    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const accountId = (req as any).user?.hederaAccountId;
    
    if (accountId) {
      return `${prefix}:account:${accountId}`;
    }
    
    return `${prefix}:ip:${ip}`;
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Get current request count for a key
   */
  async getRequestCount(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const count = await this.redis.zcount(key, windowStart, now);
    return count;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Create default rate limiters for auth endpoints
 */
export function createAuthRateLimiters(redisUrl: string, logger: Logger): {
  challengeLimiter: RateLimiter;
  verifyLimiter: RateLimiter;
  apiLimiter: RateLimiter;
} {
  const challengeLimiter = new RateLimiter(redisUrl, logger);
  challengeLimiter.configureRules([
    {
      endpoint: '/api/auth/challenge',
      method: 'POST',
      windowMs: 60 * 1000,
      maxRequests: 10,
    },
  ]);

  const verifyLimiter = new RateLimiter(redisUrl, logger);
  verifyLimiter.configureRules([
    {
      endpoint: '/api/auth/authenticate',
      method: 'POST',
      windowMs: 60 * 1000,
      maxRequests: 5,
    },
  ]);

  const apiLimiter = new RateLimiter(redisUrl, logger);
  apiLimiter.configureRules([
    {
      endpoint: '/api/*',
      windowMs: 60 * 1000,
      maxRequests: 100,
    },
  ]);

  return {
    challengeLimiter,
    verifyLimiter,
    apiLimiter,
  };
}