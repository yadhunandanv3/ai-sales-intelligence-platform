import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('AI Lead Scoring API Integration Tests', () => {
  let tokenAdmin;
  let tokenExternal;
  let orgId;
  let externalOrgId;
  let adminUserId;

  const emailAdmin = 'admin-ai@example.com';
  const emailExternal = 'external-ai@example.com';
  const subdomain = 'ai-test-org';
  const subdomainExternal = 'external-ai-org';

  const cleanup = async () => {
    // Delete AI interactions first (contains foreign keys to lead, user, org)
    await prisma.aIInteraction.deleteMany({
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

    // 1. Signup primary Admin (creates org & member role ORG_ADMIN)
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'AIAdmin',
        lastName: 'User',
        orgName: 'AI Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;
    adminUserId = signupRes.body.data.user.id;

    // 2. Signup external Admin
    const signupExtRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailExternal,
        password: 'securePassword123',
        firstName: 'AIExternal',
        lastName: 'User',
        orgName: 'External AI Corp',
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
    await prisma.aIInteraction.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
    await prisma.lead.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
  });

  describe('POST /api/leads/:id/score', () => {
    it('should successfully score a lead and log the AI interaction', async () => {
      // 1. Create a lead
      const lead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'CEO Deal',
          company: 'Acme Corp',
          jobTitle: 'Chief Executive Officer',
          value: 50000.00, // High value
          source: 'REFERRAL'
        }
      });

      // 2. Call lead scoring endpoint
      const res = await request(app)
        .post(`/api/leads/${lead.id}/score`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBeGreaterThan(80); // Base 50 + Value 20 + Job 20 + Source 15 = 100
      expect(res.body.data.reasoning).toContain('Acme Corp');

      // 3. Verify lead was updated in database
      const dbLead = await prisma.lead.findUnique({
        where: { id: lead.id }
      });
      expect(dbLead.score).toBe(res.body.data.score);

      // 4. Verify AI interaction log was created
      const interactions = await prisma.aIInteraction.findMany({
        where: { leadId: lead.id }
      });
      expect(interactions).toHaveLength(1);
      expect(interactions[0].userId).toBe(adminUserId);
      expect(interactions[0].tokensUsed).toBe(120);
    });

    it('should return different scores based on lead priority details (intelligent mock validation)', async () => {
      // Low value lead
      const coldLead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'Junior Lead',
          company: 'Small Shop',
          jobTitle: 'Junior Sales Rep',
          value: 100.00,
          source: 'Cold Outreach'
        }
      });

      const res = await request(app)
        .post(`/api/leads/${coldLead.id}/score`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(50); // Baseline, no add-ons
    });

    it('should reject lead scoring (IDOR Blocked) for leads in other organizations', async () => {
      // Create a lead in external organization
      const extLead = await prisma.lead.create({
        data: {
          organizationId: externalOrgId,
          name: 'Jane Doe',
          status: 'NEW'
        }
      });

      // Primary Admin tries to score Org B's lead
      const res = await request(app)
        .post(`/api/leads/${extLead.id}/score`)
        .set('Authorization', `Bearer ${tokenAdmin}`); // Authenticated as Org A

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/leads/:id/summary', () => {
    it('should successfully generate an AI executive summary and log the interaction', async () => {
      const lead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'Summary Deal',
          company: 'Acme Corp',
          jobTitle: 'CFO',
          value: 12000.00,
          source: 'REFERRAL'
        }
      });

      // Generate summary
      const res = await request(app)
        .post(`/api/leads/${lead.id}/summary`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toContain('Summary Deal');
      expect(res.body.data.keyPoints).toBeDefined();
      expect(res.body.data.keyPoints.length).toBeGreaterThan(0);

      // Verify AI Interaction log
      const interactions = await prisma.aIInteraction.findMany({
        where: { leadId: lead.id }
      });
      expect(interactions).toHaveLength(1);
      expect(interactions[0].tokensUsed).toBe(150);
    });

    it('should reject lead summary generation (IDOR Blocked) for other organizations', async () => {
      const extLead = await prisma.lead.create({
        data: {
          organizationId: externalOrgId,
          name: 'Jane Doe',
          status: 'NEW'
        }
      });

      const res = await request(app)
        .post(`/api/leads/${extLead.id}/summary`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/leads/:id/follow-up', () => {
    it('should generate a follow-up draft using CASUAL tone and log the interaction', async () => {
      const lead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'Dave Draft',
          company: 'Acme Corp',
          status: 'QUALIFIED'
        }
      });

      const res = await request(app)
        .post(`/api/leads/${lead.id}/follow-up`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          tone: 'CASUAL'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subject).toContain('Quick follow up');
      expect(res.body.data.body).toContain('Hey Dave Draft');

      // Verify AI Interaction log
      const interactions = await prisma.aIInteraction.findMany({
        where: { leadId: lead.id }
      });
      expect(interactions).toHaveLength(1);
      expect(interactions[0].tokensUsed).toBe(180);
    });

    it('should generate a follow-up draft with URGENT tone and custom instructions', async () => {
      const lead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'Alex Alert',
          company: 'Acme Corp',
          status: 'QUALIFIED'
        }
      });

      const res = await request(app)
        .post(`/api/leads/${lead.id}/follow-up`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          tone: 'URGENT',
          customInstructions: 'Mention that slots are closing on Friday'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subject).toContain('Urgent next steps');
      expect(res.body.data.body).toContain('Alex Alert');
      expect(res.body.data.body).toContain('slots are closing on Friday');
    });

    it('should reject follow-up draft generation (IDOR Blocked) for other organizations', async () => {
      const extLead = await prisma.lead.create({
        data: {
          organizationId: externalOrgId,
          name: 'Jane Doe',
          status: 'NEW'
        }
      });

      const res = await request(app)
        .post(`/api/leads/${extLead.id}/follow-up`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ tone: 'PROFESSIONAL' });

      expect(res.status).toBe(404);
    });
  });
});
