import redis from '../integrations/redis.js';
import env from '../config/env.js';
import { AppError } from '../common/errors.js';

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Factory to create a Redis-backed Fixed Window Rate Limiter middleware.
 * @param {object} config
 * @param {number} config.windowSeconds - Size of the time window (default 60s)
 * @param {number} config.maxRequests - Max requests allowed in the window (default 100)
 */
export const rateLimiter = ({ windowSeconds = 60, maxRequests = 100 } = {}) => {
  return async (req, res, next) => {
    // Skip rate limiting in tests unless specifically testing it
    // We will override limit in rateLimit.test.js
    const isTest = env.NODE_ENV === 'test';
    const limit = isTest ? (req.headers['x-test-rate-limit'] ? parseInt(req.headers['x-test-rate-limit'], 10) : 10000) : maxRequests;

    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress;
    const windowKey = Math.floor(Date.now() / (windowSeconds * 1000));
    const redisKey = `rate_limit:${ip}:${windowKey}`;

    try {
      // Increment request count atomically
      const currentRequests = await redis.incr(redisKey);

      // If first request in this window, set expiry
      if (currentRequests === 1) {
        await redis.expire(redisKey, windowSeconds);
      }

      // Add headers informing the client about limits
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - currentRequests));

      if (currentRequests > limit) {
        return next(new TooManyRequestsError(`Rate limit exceeded. Maximum allowed is ${limit} requests per ${windowSeconds} seconds.`));
      }

      next();
    } catch (error) {
      // Fail-safe: if Redis goes down, log error and allow request to bypass
      // (We prioritize availability over rate limiting in production)
      req.log?.error({ err: error }, 'Redis rate limiter failure. Bypassing check.');
      next();
    }
  };
};
