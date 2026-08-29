import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Activity Event Logs API Integration Tests', () => {
  let tokenAdmin;
  let tokenExternal;
  let orgId;
  let externalOrgId;
  let leadId;
  let externalLeadId;

  const emailAdmin = 'admin-act@example.com';
  const emailExternal = 'external-act@example.com';
  const subdomain = 'act-test-org';
  const subdomainExternal = 'external-act-org';

  const cleanup = async () => {
    await prisma.activity.deleteMany({
      where: {
        organization: { subdomain: { in: [subdomain, subdomainExternal] } }
      }
    });

    await prisma.lead.deleteMany({
      where: {
        organization: { subdomain: { in: [subdomain, subdomainExternal] } }
      }
    });

    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: { in: [emailAdmin, emailExternal] } }
      }
    });

    await prisma.user.deleteMany({
      where: { email: { in: [emailAdmin, emailExternal] } }
    });

    await prisma.organization.deleteMany({
      where: { subdomain: { in: [subdomain, subdomainExternal] } }
    });
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Signup primary Admin
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'ActivityAdmin',
        lastName: 'User',
        orgName: 'Activities Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;

    // 2. Signup external Admin (Org B)
    const signupExtRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailExternal,
        password: 'securePassword123',
        firstName: 'ExternalAdmin',
        lastName: 'User',
        orgName: 'External Corp',
        subdomain: subdomainExternal
      });
    tokenExternal = signupExtRes.body.data.tokens.accessToken;
    externalOrgId = signupExtRes.body.data.organization.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Delete existing leads for test cleanliness
    await prisma.activity.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
    await prisma.lead.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });

    // Seed 1 lead in Org A
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        name: 'Jane Doe',
        status: 'NEW'
      }
    });
    leadId = lead.id;

    // Seed 1 lead in Org B
    const extLead = await prisma.lead.create({
      data: {
        organizationId: externalOrgId,
        name: 'External Deal',
        status: 'NEW'
      }
    });
    externalLeadId = extLead.id;
  });

  describe('POST /api/leads/:leadId/activities', () => {
    it('should successfully log a CALL activity with valid metadata', async () => {
      const payload = {
        type: 'CALL',
        content: {
          durationSeconds: 120,
          outcome: 'Connected, scheduled demo',
          notes: 'Customer is highly interested.'
        }
      };

      const res = await request(app)
        .post(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('CALL');
      expect(res.body.data.content.durationSeconds).toBe(120);

      // Verify DB entry
      const activities = await prisma.activity.findMany({
        where: { leadId }
      });
      expect(activities).toHaveLength(1);
      expect(activities[0].type).toBe('CALL');
    });

    it('should successfully log a STATUS_CHANGE activity', async () => {
      const payload = {
        type: 'STATUS_CHANGE',
        content: {
          oldStatus: 'NEW',
          newStatus: 'CONTACTED'
        }
      };

      const res = await request(app)
        .post(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject logging activity when metadata parameters are invalid', async () => {
      const payload = {
        type: 'CALL',
        content: {
          durationSeconds: -10, // Negative duration (invalid)
          outcome: '' // Missing outcome
        }
      };

      const res = await request(app)
        .post(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject logging activity (IDOR Blocked) when trying to write to another tenant\'s lead', async () => {
      const payload = {
        type: 'NOTE',
        content: { body: 'Unauthorized note attempt.' }
      };

      // Org A user tries to write a note on Org B's lead
      const res = await request(app)
        .post(`/api/leads/${externalLeadId}/activities`)
        .set('Authorization', `Bearer ${tokenAdmin}`) // Signed as Org A
        .send(payload);

      expect(res.status).toBe(404); // Blocked, returns Lead Not Found in organization
    });
  });

  describe('GET /api/leads/:leadId/activities', () => {
    beforeEach(async () => {
      // Seed 2 activities on Org A's lead
      await prisma.activity.create({
        data: { organizationId: orgId, leadId, type: 'NOTE', content: { body: 'First note' } }
      });
      await prisma.activity.create({
        data: { organizationId: orgId, leadId, type: 'NOTE', content: { body: 'Second note' } }
      });
    });

    it('should fetch activities timeline in reverse chronological order', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      // Sorted desc (newest first)
      expect(res.body.data[0].content.body).toBe('Second note');
      expect(res.body.data[1].content.body).toBe('First note');
    });

    it('should block reading timeline (IDOR Blocked) for leads in other organizations', async () => {
      const res = await request(app)
        .get(`/api/leads/${externalLeadId}/activities`)
        .set('Authorization', `Bearer ${tokenAdmin}`); // Org A user queries Org B lead

      expect(res.status).toBe(404);
    });
  });
});
