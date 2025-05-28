import Redis from 'ioredis';

export interface RateLimiterOptions {
  redis: Redis;
  windowMs: number;
  maxRequests: number;
  algorithm?: 'sliding-window' | 'fixed-window';
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
}

/**
 * Simple rate limiter for testing and auth services
 */
export class RateLimiter {
  private redis: Redis;
  private windowMs: number;
  private maxRequests: number;
  private algorithm: 'sliding-window' | 'fixed-window';
  private skipFailedRequests: boolean;

  constructor(options: RateLimiterOptions) {
    this.redis = options.redis;
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.algorithm = options.algorithm || 'fixed-window';
    this.skipFailedRequests = options.skipFailedRequests || false;
  }

  async checkLimit(identifier: string, endpoint?: string, customLimit?: number): Promise<boolean> {
    const key = endpoint ? `rate-limit:${identifier}:${endpoint}` : `rate-limit:${identifier}`;
    const limit = customLimit || this.maxRequests;
    
    try {
      if (this.algorithm === 'sliding-window') {
        return await this.checkSlidingWindow(key, limit);
      } else {
        return await this.checkFixedWindow(key, limit);
      }
    } catch (error) {
      return this.skipFailedRequests;
    }
  }

  private async checkFixedWindow(key: string, limit: number): Promise<boolean> {
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.pexpire(key, this.windowMs);
    }
    
    return count <= limit;
  }

  private async checkSlidingWindow(key: string, limit: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    
    const count = await this.redis.zcard(key);
    
    if (count >= limit) {
      return false;
    }
    
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.pexpire(key, this.windowMs);
    
    return true;
  }

  async getRateLimitInfo(identifier: string, endpoint?: string): Promise<RateLimitInfo> {
    const key = endpoint ? `rate-limit:${identifier}:${endpoint}` : `rate-limit:${identifier}`;
    
    let remaining = this.maxRequests;
    let resetAt = new Date(Date.now() + this.windowMs);
    
    try {
      if (this.algorithm === 'sliding-window') {
        const count = await this.redis.zcard(key);
        remaining = Math.max(0, this.maxRequests - count);
      } else {
        const count = await this.redis.get(key);
        if (count) {
          remaining = Math.max(0, this.maxRequests - parseInt(count, 10));
          const ttl = await this.redis.pttl(key);
          if (ttl > 0) {
            resetAt = new Date(Date.now() + ttl);
          }
        }
      }
    } catch (error) {
    }
    
    return {
      limit: this.maxRequests,
      remaining,
      resetAt
    };
  }
}