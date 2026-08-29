import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

// Mock DB and Redis clients
vi.mock('../src/database/client.js', () => ({
  prisma: {
    $executeRawUnsafe: vi.fn()
  }
}));

vi.mock('../src/integrations/redis.js', () => ({
  default: {
    ping: vi.fn(),
    connect: vi.fn()
  }
}));

describe('Health & Setup Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET / should return welcome JSON message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Welcome to the AI-Powered Lead Management & Sales Intelligence API Platform'
    });
  });

  it('GET /health should return 200 and status healthy if all services are online', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    redis.ping.mockResolvedValueOnce('PONG');

    const res = await request(app).get('/health');
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.services).toEqual({
      database: 'connected',
      redis: 'connected'
    });
  });

  it('GET /health should pass error to middleware if database fails', async () => {
    prisma.$executeRawUnsafe.mockRejectedValueOnce(new Error('DB Connection Refused'));

    const res = await request(app).get('/health');
    
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('GET /health should show degraded if redis is offline', async () => {
    prisma.$executeRawUnsafe.mockResolvedValueOnce(1);
    redis.ping.mockResolvedValueOnce('FAIL');

    const res = await request(app).get('/health');
    
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.services.redis).toBe('disconnected');
  });
});
