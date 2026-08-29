import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Sales Dashboards & Reports API Integration Tests', () => {
  let tokenAdmin;
  let tokenRep;
  let orgId;
  let adminUserId;
  let repUserId;
  let stageId;

  const emailAdmin = 'admin-reports@example.com';
  const emailRep = 'rep-reports@example.com';
  const subdomain = 'reports-test-org';

  const cleanup = async () => {
    // Delete tasks, leads, stages
    await prisma.task.deleteMany({ where: { organization: { subdomain } } });
    await prisma.lead.deleteMany({ where: { organization: { subdomain } } });
    await prisma.pipelineStage.deleteMany({ where: { pipeline: { organization: { subdomain } } } });
    await prisma.pipeline.deleteMany({ where: { organization: { subdomain } } });

    await prisma.organizationMember.deleteMany({
      where: { user: { email: { in: [emailAdmin, emailRep] } } }
    });

    await prisma.user.deleteMany({
      where: { email: { in: [emailAdmin, emailRep] } }
    });

    await prisma.organization.deleteMany({
      where: { subdomain }
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
        firstName: 'ReportAdmin',
        lastName: 'User',
        orgName: 'Reports Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;
    adminUserId = signupRes.body.data.user.id;

    // 2. Create Rep User directly
    const saltRounds = 10;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('securePassword123', saltRounds);

    const repUser = await prisma.user.create({
      data: {
        email: emailRep,
        passwordHash,
        firstName: 'ReportRep',
        lastName: 'User',
        isVerified: true
      }
    });
    repUserId = repUser.id;

    const roleRep = await prisma.role.findUnique({ where: { name: 'SALES_REP' } });
    await prisma.organizationMember.create({
      data: {
        userId: repUserId,
        organizationId: orgId,
        roleId: roleRep.id
      }
    });

    // Authenticate Rep User
    const loginRepRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: emailRep,
        password: 'securePassword123'
      });
    tokenRep = loginRepRes.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Delete data for clean test context
    await prisma.task.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.pipelineStage.deleteMany({ where: { pipeline: { organizationId: orgId } } });
    await prisma.pipeline.deleteMany({ where: { organizationId: orgId } });

    // Seed 1 pipeline & stage
    const pipeline = await prisma.pipeline.create({
      data: { organizationId: orgId, name: 'Default Sales Flow' }
    });

    const stage = await prisma.pipelineStage.create({
      data: { pipelineId: pipeline.id, name: 'Contract Signed', position: 0 }
    });
    stageId = stage.id;
  });

  describe('GET /api/reports/pipeline-stages', () => {
    it('should aggregate lead count and total values grouped by stage', async () => {
      // Seed 2 leads in the seeded stage
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead A', status: 'QUALIFIED', value: 5000.00, pipelineStageId: stageId }
      });
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead B', status: 'WON', value: 12000.00, pipelineStageId: stageId }
      });

      const res = await request(app)
        .get('/api/reports/pipeline-stages')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      const metrics = res.body.data;
      expect(metrics).toHaveLength(1);
      expect(metrics[0].stageName).toBe('Contract Signed');
      expect(metrics[0].count).toBe(2);
      expect(parseFloat(metrics[0].totalValue)).toBe(17000.00);
    });
  });

  describe('GET /api/reports/lead-sources', () => {
    it('should aggregate lead counts grouped by acquisition source', async () => {
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead A', source: 'REFERRAL' }
      });
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead B', source: 'REFERRAL' }
      });
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead C', source: 'WEBSITE' }
      });

      const res = await request(app)
        .get('/api/reports/lead-sources')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const sources = res.body.data;
      expect(sources).toHaveLength(2);

      const refSource = sources.find(s => s.source === 'REFERRAL');
      const webSource = sources.find(s => s.source === 'WEBSITE');
      expect(refSource.count).toBe(2);
      expect(webSource.count).toBe(1);
    });
  });

  describe('GET /api/reports/rep-performance', () => {
    it('should consolidate assigned leads, won leads, completed tasks, and conversion rates', async () => {
      // 1. Assign leads to Rep: Lead A (Won), Lead B (Qualified)
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead A', status: 'WON', assignedUserId: repUserId }
      });
      await prisma.lead.create({
        data: { organizationId: orgId, name: 'Lead B', status: 'QUALIFIED', assignedUserId: repUserId }
      });

      // 2. Rep completes 2 tasks, Admin completes 1 task
      const leadForTasks = await prisma.lead.create({ data: { organizationId: orgId, name: 'Lead C' } });
      await prisma.task.create({
        data: { organizationId: orgId, leadId: leadForTasks.id, assignedUserId: repUserId, title: 'Task 1', status: 'COMPLETED' }
      });
      await prisma.task.create({
        data: { organizationId: orgId, leadId: leadForTasks.id, assignedUserId: repUserId, title: 'Task 2', status: 'COMPLETED' }
      });
      await prisma.task.create({
        data: { organizationId: orgId, leadId: leadForTasks.id, assignedUserId: adminUserId, title: 'Task 3', status: 'COMPLETED' }
      });

      const res = await request(app)
        .get('/api/reports/rep-performance')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      
      const reps = res.body.data;
      const repProfile = reps.find(r => r.userId === repUserId);
      const adminProfile = reps.find(r => r.userId === adminUserId);

      expect(repProfile.assignedLeads).toBe(2);
      expect(repProfile.wonLeads).toBe(1);
      expect(repProfile.completedTasks).toBe(2);
      expect(repProfile.winRatePercent).toBe(50); // 1 won / 2 assigned * 100

      expect(adminProfile.completedTasks).toBe(1);
    });
  });

  describe('Role & Permissions Gates', () => {
    it('should prevent SALES_REP from fetching analytical dashboard metrics', async () => {
      // SALES_REP lacks report:view permission
      const res = await request(app)
        .get('/api/reports/rep-performance')
        .set('Authorization', `Bearer ${tokenRep}`);

      expect(res.status).toBe(403);
    });
  });
});
