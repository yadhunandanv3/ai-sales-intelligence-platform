import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Task Management API Integration Tests', () => {
  let tokenAdmin;
  let tokenExternal;
  let orgId;
  let externalOrgId;
  let leadId;
  let externalLeadId;
  let adminUserId;

  const emailAdmin = 'admin-tasks@example.com';
  const emailExternal = 'external-tasks@example.com';
  const subdomain = 'tasks-test-org';
  const subdomainExternal = 'external-tasks-org';

  const cleanup = async () => {
    await prisma.task.deleteMany({
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
        firstName: 'TaskAdmin',
        lastName: 'User',
        orgName: 'Tasks Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;
    adminUserId = signupRes.body.data.user.id;

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
    await prisma.task.deleteMany({ where: { organizationId: { in: [orgId, externalOrgId] } } });
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

  describe('POST /api/leads/:leadId/tasks', () => {
    it('should successfully create a new task', async () => {
      const payload = {
        title: 'Follow up call',
        description: 'Call to review proposal draft.',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        priority: 'HIGH',
        assignedUserId: adminUserId
      };

      const res = await request(app)
        .post(`/api/leads/${leadId}/tasks`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Follow up call');
      expect(res.body.data.assignedUser.id).toBe(adminUserId);
    });

    it('should reject task creation when assignedUserId belongs to a different tenant', async () => {
      const payload = {
        title: 'Follow up call',
        assignedUserId: '00000000-0000-0000-0000-000000000000' // Non-existent user
      };

      const res = await request(app)
        .post(`/api/leads/${leadId}/tasks`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Assigned user must belong to your organization');
    });

    it('should reject task creation (IDOR Blocked) when lead belongs to another tenant', async () => {
      const payload = {
        title: 'Malicious task'
      };

      const res = await request(app)
        .post(`/api/leads/${externalLeadId}/tasks`)
        .set('Authorization', `Bearer ${tokenAdmin}`) // Signed as Org A
        .send(payload);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/tasks (My Tasks) & GET /api/leads/:leadId/tasks', () => {
    beforeEach(async () => {
      // Seed 2 tasks on Lead A
      await prisma.task.create({
        data: { organizationId: orgId, leadId, title: 'Task 1', assignedUserId: adminUserId, dueDate: new Date(Date.now() + 10000) }
      });
      await prisma.task.create({
        data: { organizationId: orgId, leadId, title: 'Task 2', assignedUserId: adminUserId, dueDate: new Date(Date.now() + 50000) }
      });
    });

    it('should list tasks for a specific lead sorted by due date', async () => {
      const res = await request(app)
        .get(`/api/leads/${leadId}/tasks`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].title).toBe('Task 1');
      expect(res.body.data[1].title).toBe('Task 2');
    });

    it('should list user\'s assigned tasks across all organization leads', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].lead.name).toBe('Jane Doe');
    });
  });

  describe('PATCH /api/tasks/:id & DELETE /api/tasks/:id', () => {
    let task;

    beforeEach(async () => {
      task = await prisma.task.create({
        data: {
          organizationId: orgId,
          leadId,
          title: 'Complete Contract Draft',
          status: 'TODO'
        }
      });
    });

    it('should successfully update task status to COMPLETED', async () => {
      const res = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('should successfully soft delete a task', async () => {
      const res = await request(app)
        .delete(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify further updates fail with 404
      const updateRes = await request(app)
        .patch(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'COMPLETED' });

      expect(updateRes.status).toBe(404);

      // Verify task still in DB with deletedAt timestamp
      const dbTask = await prisma.task.findUnique({
        where: { id: task.id }
      });
      expect(dbTask.deletedAt).not.toBeNull();
    });
  });
});
