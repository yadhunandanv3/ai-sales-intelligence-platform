import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Authentication API Integration Tests', () => {
  const testUserEmail = 'engineer@example.com';
  const testSubdomain = 'test-monolith-corp';

  // Cleanup helper to run before/after tests
  const cleanup = async () => {
    // Delete memberships first or delete users and orgs (cascades will clean up junctions)
    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: testUserEmail }
      }
    });

    await prisma.user.deleteMany({
      where: { email: testUserEmail }
    });

    await prisma.organization.deleteMany({
      where: { subdomain: testSubdomain }
    });
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    // Disconnect Prisma and Redis connections
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    await cleanup();
  });

  describe('POST /api/auth/signup', () => {
    it('should successfully register a new user, organization, and ORG_ADMIN membership', async () => {
      const payload = {
        email: testUserEmail,
        password: 'securePassword123',
        firstName: 'Jane',
        lastName: 'Doe',
        orgName: 'Monolith Corp',
        subdomain: testSubdomain
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUserEmail);
      expect(res.body.data.organization.subdomain).toBe(testSubdomain);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();

      // Verify db integrity
      const user = await prisma.user.findUnique({
        where: { email: testUserEmail },
        include: { memberships: { include: { organization: true, role: true } } }
      });
      expect(user).not.toBeNull();
      expect(user.memberships).toHaveLength(1);
      expect(user.memberships[0].organization.subdomain).toBe(testSubdomain);
      expect(user.memberships[0].role.name).toBe('ORG_ADMIN');
    });

    it('should fail registration when validation rules are violated', async () => {
      const payload = {
        email: 'invalid-email',
        password: '123', // Too short
        firstName: '',
        lastName: 'Doe',
        orgName: 'Monolith Corp',
        subdomain: 'INVALID_SUBDOMAIN_UPPERCASE'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('should return 409 conflict when user email is already registered', async () => {
      const payload = {
        email: testUserEmail,
        password: 'securePassword123',
        firstName: 'Jane',
        lastName: 'Doe',
        orgName: 'Monolith Corp',
        subdomain: testSubdomain
      };

      // Register first time
      await request(app).post('/api/auth/signup').send(payload);

      // Try registering again with different subdomain but same email
      const payload2 = {
        ...payload,
        subdomain: 'another-subdomain'
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(payload2);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT_ERROR');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Seed user via signup endpoint directly
      await request(app)
        .post('/api/auth/signup')
        .send({
          email: testUserEmail,
          password: 'securePassword123',
          firstName: 'Jane',
          lastName: 'Doe',
          orgName: 'Monolith Corp',
          subdomain: testSubdomain
        });
    });

    it('should successfully authenticate and return token pair on valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'securePassword123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
    });

    it('should reject login on invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUserEmail,
          password: 'wrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('POST /api/auth/refresh & Rotation', () => {
    let refreshToken;

    beforeEach(async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({
          email: testUserEmail,
          password: 'securePassword123',
          firstName: 'Jane',
          lastName: 'Doe',
          orgName: 'Monolith Corp',
          subdomain: testSubdomain
        });
      refreshToken = signupRes.body.data.tokens.refreshToken;
    });

    it('should rotate tokens successfully and invalidate the previous refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      const newRefreshToken = res.body.data.refreshToken;
      expect(newRefreshToken).not.toBe(refreshToken);

      // Verify that old refresh token has been deleted from Redis
      const oldExistsRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken }); // Attempt replay

      expect(oldExistsRes.status).toBe(401);
      expect(oldExistsRes.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    let refreshToken;

    beforeEach(async () => {
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .send({
          email: testUserEmail,
          password: 'securePassword123',
          firstName: 'Jane',
          lastName: 'Doe',
          orgName: 'Monolith Corp',
          subdomain: testSubdomain
        });
      refreshToken = signupRes.body.data.tokens.refreshToken;
    });

    it('should successfully invalidate session on logout', async () => {
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify that token is revoked and cannot be used to refresh
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
    });
  });
});
