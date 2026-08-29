import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';
import { LeadsRepository } from '../src/modules/leads/leads.repository.js';

describe('Cache-Aside Caching and Invalidation Tests', () => {
  let tokenAdmin;
  let lead;
  let orgId;
  const emailAdmin = 'admin-cache@example.com';
  const subdomain = 'cache-test-org';

  const findLeadByIdSpy = vi.spyOn(LeadsRepository.prototype, 'findLeadById');

  const cleanup = async () => {
    if (lead) {
      const cacheKey = `lead:${orgId}:${lead.id}`;
      await redis.del(cacheKey);
    }
    await prisma.lead.deleteMany({ where: { organization: { subdomain } } });
    await prisma.organizationMember.deleteMany({ where: { user: { email: emailAdmin } } });
    await prisma.user.deleteMany({ where: { email: emailAdmin } });
    await prisma.organization.deleteMany({ where: { subdomain } });
  };

  beforeAll(async () => {
    await cleanup();

    // Signup user
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'CacheAdmin',
        lastName: 'User',
        orgName: 'Cache Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;
  });

  afterAll(async () => {
    await cleanup();
    vi.restoreAllMocks();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-create single test lead
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        name: 'Cacheable Deal',
        status: 'NEW',
        value: 1000.00
      }
    });
    // Invalidate potential old cache
    const cacheKey = `lead:${orgId}:${lead.id}`;
    await redis.del(cacheKey);
  });

  it('should implement Cache-Aside pattern (first fetch hits DB, second fetch hits Cache)', async () => {
    const url = `/api/leads/${lead.id}`;

    // 1st request (Cache Miss) - Should hit database
    const res1 = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res1.status).toBe(200);
    expect(res1.body.data.name).toBe('Cacheable Deal');
    expect(findLeadByIdSpy).toHaveBeenCalledTimes(1);

    // Verify cache has been populated in Redis
    const cacheKey = `lead:${orgId}:${lead.id}`;
    const cachedData = await redis.get(cacheKey);
    expect(cachedData).not.toBeNull();

    // 2nd request (Cache Hit) - Should NOT hit database
    const res2 = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.name).toBe('Cacheable Deal');
    // Spy count should STILL be 1 (database bypassed!)
    expect(findLeadByIdSpy).toHaveBeenCalledTimes(1);
  });

  it('should invalidate cache when the lead details are updated', async () => {
    const url = `/api/leads/${lead.id}`;

    // 1. Fetch to populate cache
    await request(app).get(url).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(findLeadByIdSpy).toHaveBeenCalledTimes(1);

    // 2. Perform update
    const updateRes = await request(app)
      .patch(url)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ value: 2500 });
    expect(updateRes.status).toBe(200);

    // Verify cache has been invalidated (key deleted in Redis)
    const cacheKey = `lead:${orgId}:${lead.id}`;
    const cachedData = await redis.get(cacheKey);
    expect(cachedData).toBeNull();

    // 3. Fetch again (Cache Miss) - Should hit database again
    const res3 = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res3.status).toBe(200);
    expect(res3.body.data.value).toBe('2500');
    // findLeadById should have been called 2 times in total now
    expect(findLeadByIdSpy).toHaveBeenCalledTimes(2);
  });
});
