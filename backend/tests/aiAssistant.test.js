import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('AI Sales Assistant API Integration Tests', () => {
  let tokenAdmin;
  let tokenExternal;
  let orgId;
  let externalOrgId;
  let adminUserId;

  const emailAdmin = 'admin-assistant@example.com';
  const emailExternal = 'external-assistant@example.com';
  const subdomain = 'assistant-test-org';
  const subdomainExternal = 'external-assistant-org';

  const cleanup = async () => {
    // Delete tasks, notes, AI interactions
    await prisma.task.deleteMany({
      where: { organization: { subdomain: { in: [subdomain, subdomainExternal] } } }
    });
    await prisma.note.deleteMany({
      where: { organization: { subdomain: { in: [subdomain, subdomainExternal] } } }
    });
    await prisma.aIInteraction.deleteMany({
      where: { organization: { subdomain: { in: [subdomain, subdomainExternal] } } }
    });
    await prisma.lead.deleteMany({
      where: { organization: { subdomain: { in: [subdomain, subdomainExternal] } } }
    });

    await prisma.organizationMember.deleteMany({
      where: { user: { email: { in: [emailAdmin, emailExternal] } } }
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
        firstName: 'AssistantAdmin',
        lastName: 'User',
        orgName: 'Assistant Corp',
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
        firstName: 'AssistantExternal',
        lastName: 'User',
        orgName: 'External Assistant Corp',
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
    await prisma.task.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
    await prisma.note.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
    await prisma.aIInteraction.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
    await prisma.lead.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
  });

  describe('POST /api/ai/assistant', () => {
    it('should successfully parse "create lead" command and save lead in database', async () => {
      const res = await request(app)
        .post('/api/ai/assistant')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          message: 'Create lead named Alice Allison from Tech Giant value 7500'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.responseText).toContain('Successfully created lead "Alice Allison"');

      // Verify DB Lead exists
      const dbLeads = await prisma.lead.findMany({
        where: { organizationId: orgId }
      });
      expect(dbLeads).toHaveLength(1);
      expect(dbLeads[0].name).toBe('Alice Allison');
      expect(dbLeads[0].company).toBe('Tech Giant');
      expect(parseFloat(dbLeads[0].value.toString())).toBe(7500.00);

      // Verify AI interaction log was populated
      const interactions = await prisma.aIInteraction.findMany({
        where: { organizationId: orgId }
      });
      expect(interactions).toHaveLength(1);
      expect(interactions[0].userId).toBe(adminUserId);
    });

    it('should successfully chain "create lead and schedule task" in a single prompt', async () => {
      const res = await request(app)
        .post('/api/ai/assistant')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          message: 'Create lead named Charlie from Delta Corp value 9000 and create task to schedule introduction call'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.responseText).toContain('Successfully created lead "Charlie"');
      expect(res.body.data.responseText).toContain('Successfully created task "schedule introduction call"');

      // Verify both lead and task exist in database
      const dbLead = await prisma.lead.findFirst({ where: { name: 'Charlie', organizationId: orgId } });
      expect(dbLead).toBeDefined();

      const dbTasks = await prisma.task.findMany({ where: { leadId: dbLead.id, organizationId: orgId } });
      expect(dbTasks).toHaveLength(1);
      expect(dbTasks[0].title).toBe('schedule introduction call');
    });

    it('should successfully execute update status command and write notes', async () => {
      // 1. Create seeded lead
      const lead = await prisma.lead.create({
        data: {
          organizationId: orgId,
          name: 'Target Lead',
          status: 'NEW'
        }
      });

      // 2. Call status update and note creation
      const res = await request(app)
        .post('/api/ai/assistant')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          message: `Update status of ${lead.id} to WON and add note "Pricing reviewed and approved"`
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.responseText).toContain('status to WON');
      expect(res.body.data.responseText).toContain('Successfully added note to lead');

      // 3. Verify changes in DB
      const dbLead = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(dbLead.status).toBe('WON');

      const dbNotes = await prisma.note.findMany({ where: { leadId: lead.id } });
      expect(dbNotes).toHaveLength(1);
      expect(dbNotes[0].content).toBe('Pricing reviewed and approved');
    });

    it('should reject status updates (IDOR boundaries) for leads belonging to other tenants', async () => {
      // Create external lead
      const extLead = await prisma.lead.create({
        data: {
          organizationId: externalOrgId,
          name: 'External Lead',
          status: 'NEW'
        }
      });

      // Call status update from primary admin
      const res = await request(app)
        .post('/api/ai/assistant')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          message: `Update status of ${extLead.id} to WON`
        });

      expect(res.status).toBe(404);
      
      // Confirm external lead status did NOT change
      const dbExtLead = await prisma.lead.findUnique({ where: { id: extLead.id } });
      expect(dbExtLead.status).toBe('NEW');
    });
  });
});
