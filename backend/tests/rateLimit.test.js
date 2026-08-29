import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import redis from '../src/integrations/redis.js';

describe('API Rate Limiting Tests', () => {
  const testIp1 = '10.0.0.1';
  const testIp2 = '10.0.0.2';

  const clearRedisKeys = async () => {
    const windowKey = Math.floor(Date.now() / 60000);
    await redis.del(`rate_limit:${testIp1}:${windowKey}`);
    await redis.del(`rate_limit:${testIp2}:${windowKey}`);
  };

  beforeAll(async () => {
    await clearRedisKeys();
  });

  afterAll(async () => {
    await clearRedisKeys();
    await redis.quit();
  });

  beforeEach(async () => {
    await clearRedisKeys();
  });

  it('should allow requests within limit and return headers', async () => {
    // Limit set to 5 requests via x-test-rate-limit header for this test
    const res = await request(app)
      .get('/')
      .set('x-forwarded-for', testIp1)
      .set('x-test-rate-limit', '5');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('should block requests exceeding the rate limit and return 429', async () => {
    const limit = 2;
    const testHeader = 'x-test-rate-limit';

    // 1st request - OK
    let res = await request(app)
      .get('/')
      .set('x-forwarded-for', testIp2)
      .set(testHeader, String(limit));
    expect(res.status).toBe(200);

    // 2nd request - OK
    res = await request(app)
      .get('/')
      .set('x-forwarded-for', testIp2)
      .set(testHeader, String(limit));
    expect(res.status).toBe(200);

    // 3rd request - Blocked
    res = await request(app)
      .get('/')
      .set('x-forwarded-for', testIp2)
      .set(testHeader, String(limit));
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.body.error.message).toContain('Rate limit exceeded');
  });
});
