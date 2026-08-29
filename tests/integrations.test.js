import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';
import { integrationsService } from '../src/modules/integrations/integrations.service.js';

describe('Third-Party Webhook & Integrations Integration Tests', () => {
  let tokenAdmin;
  let tokenRep;
  let orgId;
  let adminUserId;

  const emailAdmin = 'admin-integrations@example.com';
  const emailRep = 'rep-integrations@example.com';
  const subdomain = 'integrations-test-org';

  const cleanup = async () => {
    // Delete integrations, leads
    await prisma.integration.deleteMany({ where: { organization: { subdomain } } });
    await prisma.lead.deleteMany({ where: { organization: { subdomain } } });
    await prisma.organizationMember.deleteMany({ where: { user: { email: { in: [emailAdmin, emailRep] } } } });
    await prisma.user.deleteMany({ where: { email: { in: [emailAdmin, emailRep] } } });
    await prisma.organization.deleteMany({ where: { subdomain } });
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Signup primary Admin
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'IntegrationsAdmin',
        lastName: 'User',
        orgName: 'Integrations Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;
    adminUserId = signupRes.body.data.user.id;

    // 2. Create Rep User
    const saltRounds = 10;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('securePassword123', saltRounds);

    const repUser = await prisma.user.create({
      data: {
        email: emailRep,
        passwordHash,
        firstName: 'IntegrationsRep',
        lastName: 'User',
        isVerified: true
      }
    });

    const roleRep = await prisma.role.findUnique({ where: { name: 'SALES_REP' } });
    await prisma.organizationMember.create({
      data: {
        userId: repUser.id,
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
    await prisma.integration.deleteMany({ where: { organizationId: orgId } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  });

  describe('POST /api/integrations', () => {
    it('should successfully store integration settings for active provider', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          provider: 'SLACK',
          config: {
            webhookUrl: 'https://hooks.slack.com/services/mock-webhook-url-for-testing'
          },
          isActive: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBe('SLACK');
      expect(res.body.data.config.webhookUrl).toBe('https://hooks.slack.com/services/mock-webhook-url-for-testing');

      // Verify listing endpoint
      const listRes = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].provider).toBe('SLACK');
    });

    it('should reject integration config updates from standard SALES_REP', async () => {
      const res = await request(app)
        .post('/api/integrations')
        .set('Authorization', `Bearer ${tokenRep}`)
        .send({
          provider: 'SLACK',
          config: {
            webhookUrl: 'https://hooks.slack.com/services/mock-url'
          }
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Webhook Alerts Dispatching', () => {
    it('should format Slack alert correctly and parse deal value upon won trigger', async () => {
      // 1. Save Slack integration
      await integrationsService.connectIntegration(orgId, {
        provider: 'SLACK',
        config: {
          webhookUrl: 'https://hooks.slack.com/services/mock-url-alert-check'
        },
        isActive: true
      });

      // 2. Trigger deal won alert
      const lead = {
        id: 'some-lead-uuid',
        name: 'John Miller',
        company: 'Sales Corp',
        value: 15000.00
      };

      const outcome = await integrationsService.triggerSlackWonDeal(orgId, lead);

      expect(outcome.success).toBe(true);
      expect(outcome.mock).toBe(true);
      expect(outcome.message).toContain('John Miller');
      expect(outcome.message).toContain('Sales Corp');
      expect(outcome.message).toContain('$15,000.00');
    });

    it('should skip Slack alert if integration is configured but set to inactive', async () => {
      // Save deactivated Slack integration
      await integrationsService.connectIntegration(orgId, {
        provider: 'SLACK',
        config: {
          webhookUrl: 'https://hooks.slack.com/services/mock-url'
        },
        isActive: false
      });

      const outcome = await integrationsService.triggerSlackWonDeal(orgId, {
        name: 'Jane Miller',
        value: 5000
      });

      // Returns undefined (skips execution)
      expect(outcome).toBeUndefined();
    });
  });
});
