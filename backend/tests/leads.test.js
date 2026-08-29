import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Leads Management API Integration Tests', () => {
  let tokenAdmin;
  let adminUserId;
  let orgId;
  let secondaryUserId;
  let leadIds = [];

  const emailAdmin = 'admin-leads@example.com';
  const emailSecondary = 'rep-leads@example.com';
  const subdomain = 'leads-test-org';

  const cleanup = async () => {
    // Lead delete cascades are handled by Prisma if relations are correct,
    // but here we manually delete them just in case.
    await prisma.lead.deleteMany({
      where: {
        organization: { subdomain }
      }
    });

    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: { in: [emailAdmin, emailSecondary] } }
      }
    });

    await prisma.user.deleteMany({
      where: { email: { in: [emailAdmin, emailSecondary] } }
    });

    await prisma.organization.deleteMany({
      where: { subdomain }
    });
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Signup admin
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'LeadAdmin',
        lastName: 'User',
        orgName: 'Leads Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    adminUserId = signupRes.body.data.user.id;
    orgId = signupRes.body.data.organization.id;

    // 2. Create secondary user inside organization
    const saltRounds = 10;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('securePassword123', saltRounds);

    const secondaryUser = await prisma.user.create({
      data: {
        email: emailSecondary,
        passwordHash,
        firstName: 'LeadRep',
        lastName: 'User',
        isVerified: true
      }
    });
    secondaryUserId = secondaryUser.id;

    const roleRep = await prisma.role.findUnique({ where: { name: 'SALES_REP' } });
    await prisma.organizationMember.create({
      data: {
        userId: secondaryUserId,
        organizationId: orgId,
        roleId: roleRep.id
      }
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear leads inside the test organization before each test
    await prisma.lead.deleteMany({
      where: { organizationId: orgId }
    });
    leadIds = [];
  });

  describe('POST /api/leads', () => {
    it('should successfully create a new lead', async () => {
      const payload = {
        name: 'John Doe',
        email: 'johndoe@gmail.com',
        phone: '+123456789',
        company: 'Doe Enterprises',
        jobTitle: 'VP of Sales',
        source: 'Web',
        value: 15000.50,
        tags: ['high-intent', 'enterprise']
      };

      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('John Doe');
      expect(res.body.data.value).toBe('15000.5'); // Returned as string/decimal from prisma
      expect(res.body.data.tags).toContain('high-intent');
      expect(res.body.data.status).toBe('NEW');
    });

    it('should reject creation when validation schema is violated', async () => {
      const payload = {
        name: '', // Empty name
        email: 'invalid-email',
        value: -100 // Negative value
      };

      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject creation when assignedUserId belongs to a different organization', async () => {
      // Mock another user not in this org
      const externalUserId = '00000000-0000-0000-0000-000000000000'; // Non-existent user UUID
      
      const payload = {
        name: 'John Doe',
        assignedUserId: externalUserId
      };

      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Assigned user must belong to your organization');
    });
  });

  describe('GET /api/leads (List, Search, Pagination)', () => {
    beforeEach(async () => {
      // Seed some leads for testing query parameters
      const l1 = await prisma.lead.create({
        data: { organizationId: orgId, name: 'Alice Smith', email: 'alice@gmail.com', company: 'ABC Corp', status: 'NEW', value: 1000, tags: ['warm'] }
      });
      const l2 = await prisma.lead.create({
        data: { organizationId: orgId, name: 'Bob Johnson', email: 'bob@example.com', company: 'XYZ Corp', status: 'QUALIFIED', value: 5000, tags: ['warm', 'enterprise'] }
      });
      const l3 = await prisma.lead.create({
        data: { organizationId: orgId, name: 'Charlie Brown', email: 'charlie@gmail.com', company: 'ABC Corp', status: 'LOST', value: 500, tags: ['cold'] }
      });
      leadIds = [l1.id, l2.id, l3.id];
    });

    it('should list all active leads with pagination counts', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.totalPages).toBe(1);
    });

    it('should search leads by text query (name, company, tags)', async () => {
      // Search for ABC Corp
      const res1 = await request(app)
        .get('/api/leads?search=ABC')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res1.body.data).toHaveLength(2); // Alice and Charlie
      
      // Search for tag 'enterprise'
      const res2 = await request(app)
        .get('/api/leads?search=enterprise')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res2.body.data).toHaveLength(1); // Bob
      expect(res2.body.data[0].name).toBe('Bob Johnson');
    });

    it('should filter leads by status and tags', async () => {
      // Filter status=QUALIFIED
      const res1 = await request(app)
        .get('/api/leads?status=QUALIFIED')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res1.body.data).toHaveLength(1);
      expect(res1.body.data[0].name).toBe('Bob Johnson');

      // Filter tags=warm
      const res2 = await request(app)
        .get('/api/leads?tags=warm')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res2.body.data).toHaveLength(2); // Alice and Bob
    });

    it('should sort leads dynamically', async () => {
      // Sort by value ascending
      const res = await request(app)
        .get('/api/leads?sortBy=value&sortOrder=asc')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      const values = res.body.data.map(l => parseFloat(l.value));
      expect(values).toEqual([500, 1000, 5000]); // Charlie, Alice, Bob
    });

    it('should support pagination offsets', async () => {
      const res = await request(app)
        .get('/api/leads?page=2&limit=2')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.body.data).toHaveLength(1); // Only 1 left on page 2
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(2);
    });
  });

  describe('GET/PATCH/DELETE Operations on Single Lead', () => {
    let lead;

    beforeEach(async () => {
      lead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'Target Deal',
          status: 'NEW',
          value: 20000.00
        }
      });
    });

    it('should retrieve a single lead successfully', async () => {
      const res = await request(app)
        .get(`/api/leads/${lead.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Target Deal');
    });

    it('should successfully update lead details and assignee', async () => {
      const res = await request(app)
        .patch(`/api/leads/${lead.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          status: 'CONTACTED',
          assignedUserId: secondaryUserId,
          value: 25000.00
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONTACTED');
      expect(res.body.data.assignedUser.id).toBe(secondaryUserId);
      expect(res.body.data.value).toBe('25000');
    });

    it('should soft delete lead successfully', async () => {
      // Delete request
      const delRes = await request(app)
        .delete(`/api/leads/${lead.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify that further GET requests return 404
      const getRes = await request(app)
        .get(`/api/leads/${lead.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(getRes.status).toBe(404);

      // Verify lead still exists in DB but contains deletedAt timestamp
      const dbLead = await prisma.lead.findUnique({
        where: { id: lead.id }
      });
      expect(dbLead).not.toBeNull();
      expect(dbLead.deletedAt).not.toBeNull();
    });
  });

  describe('POST /api/leads/bulk-assign', () => {
    it('should successfully reassign multiple leads to another user', async () => {
      // Seed 3 leads
      const l1 = await prisma.lead.create({ data: { organizationId: orgId, name: 'Lead 1' } });
      const l2 = await prisma.lead.create({ data: { organizationId: orgId, name: 'Lead 2' } });
      const l3 = await prisma.lead.create({ data: { organizationId: orgId, name: 'Lead 3' } });

      const res = await request(app)
        .post('/api/leads/bulk-assign')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          leadIds: [l1.id, l2.id, l3.id],
          assignedUserId: secondaryUserId
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignedCount).toBe(3);

      // Verify assignments in DB
      const assignedCount = await prisma.lead.count({
        where: {
          id: { in: [l1.id, l2.id, l3.id] },
          assignedUserId: secondaryUserId
        }
      });
      expect(assignedCount).toBe(3);
    });
  });
});
