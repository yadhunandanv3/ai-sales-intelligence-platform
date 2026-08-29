import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Security Audit Logging Integration Tests', () => {
  let tokenAdmin;
  let orgId;
  let adminUserId;

  const emailAdmin = 'admin-audit@example.com';
  const subdomain = 'audit-test-org';

  const cleanup = async () => {
    // Clean all logs and entities
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { organization: { subdomain } },
          { metadata: { path: ['email'], equals: emailAdmin } }
        ]
      }
    });

    await prisma.lead.deleteMany({ where: { organization: { subdomain } } });
    await prisma.organizationMember.deleteMany({ where: { user: { email: emailAdmin } } });
    await prisma.user.deleteMany({ where: { email: emailAdmin } });
    await prisma.organization.deleteMany({ where: { subdomain } });
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await redis.quit();
  });

  describe('Authentication Audit Logging', () => {
    it('should log USER_SIGNUP and USER_LOGIN_SUCCESS audit events', async () => {
      // 1. Trigger Signup
      const signupRes = await request(app)
        .post('/api/auth/signup')
        .set('User-Agent', 'TestSignupAgent')
        .send({
          email: emailAdmin,
          password: 'securePassword123',
          firstName: 'AuditAdmin',
          lastName: 'User',
          orgName: 'Audit Corp',
          subdomain
        });

      expect(signupRes.status).toBe(201);
      tokenAdmin = signupRes.body.data.tokens.accessToken;
      orgId = signupRes.body.data.organization.id;
      adminUserId = signupRes.body.data.user.id;

      // Verify USER_SIGNUP log
      const signupLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          userId: adminUserId,
          action: 'USER_SIGNUP'
        }
      });
      expect(signupLog).toBeDefined();
      expect(signupLog.userAgent).toBe('TestSignupAgent');
      expect(signupLog.metadata).toEqual({ email: emailAdmin });

      // 2. Trigger Login
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'TestLoginAgent')
        .send({
          email: emailAdmin,
          password: 'securePassword123'
        });

      expect(loginRes.status).toBe(200);

      // Verify USER_LOGIN_SUCCESS log
      const loginSuccessLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          userId: adminUserId,
          action: 'USER_LOGIN_SUCCESS'
        }
      });
      expect(loginSuccessLog).toBeDefined();
      expect(loginSuccessLog.userAgent).toBe('TestLoginAgent');
    });

    it('should log USER_LOGIN_FAILED audit events upon wrong credentials', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .set('User-Agent', 'TestFailureAgent')
        .send({
          email: emailAdmin,
          password: 'wrongPassword'
        });

      expect(loginRes.status).toBe(401);

      // Verify USER_LOGIN_FAILED log
      const loginFailedLog = await prisma.auditLog.findFirst({
        where: {
          action: 'USER_LOGIN_FAILED',
          userAgent: 'TestFailureAgent'
        }
      });
      expect(loginFailedLog).toBeDefined();
      expect(loginFailedLog.organizationId).toBeNull(); // not authenticated yet
      expect(loginFailedLog.metadata).toHaveProperty('email', emailAdmin);
      expect(loginFailedLog.metadata).toHaveProperty('reason');
    });
  });

  describe('Lead Mutation Audit Logging', () => {
    let leadId;

    it('should log LEAD_CREATED upon lead creation', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .set('User-Agent', 'LeadCreatorAgent')
        .send({
          name: 'Audit Lead',
          company: 'Audit Corp',
          value: 4000
        });

      expect(res.status).toBe(201);
      leadId = res.body.data.id;

      // Verify DB Audit Log
      const createLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          userId: adminUserId,
          action: 'LEAD_CREATED',
          targetTable: 'Lead',
          targetId: leadId
        }
      });
      expect(createLog).toBeDefined();
      expect(createLog.userAgent).toBe('LeadCreatorAgent');
    });

    it('should log LEAD_UPDATED upon lead patches', async () => {
      const res = await request(app)
        .patch(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          company: 'Updated Audit Corp'
        });

      expect(res.status).toBe(200);

      // Verify DB Audit Log
      const updateLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          userId: adminUserId,
          action: 'LEAD_UPDATED',
          targetTable: 'Lead',
          targetId: leadId
        }
      });
      expect(updateLog).toBeDefined();
      expect(updateLog.metadata).toEqual({ updatedFields: ['company'] });
    });

    it('should log LEAD_DELETED upon lead archiving', async () => {
      const res = await request(app)
        .delete(`/api/leads/${leadId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);

      // Verify DB Audit Log
      const deleteLog = await prisma.auditLog.findFirst({
        where: {
          organizationId: orgId,
          userId: adminUserId,
          action: 'LEAD_DELETED',
          targetTable: 'Lead',
          targetId: leadId
        }
      });
      expect(deleteLog).toBeDefined();
    });
  });
});
