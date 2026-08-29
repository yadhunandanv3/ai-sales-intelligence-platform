import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';
import { addJob, systemQueue } from '../src/integrations/queue.js';
import { systemWorker } from '../src/workers/system.worker.js';

describe('Background Processing Queue Integration Tests', () => {
  let tokenAdmin;
  let orgId;
  let adminUserId;
  let leadId;
  let taskId;

  const emailAdmin = 'admin-jobs@example.com';
  const subdomain = 'jobs-test-org';

  const cleanup = async () => {
    await prisma.notification.deleteMany({
      where: { organization: { subdomain } }
    });

    await prisma.task.deleteMany({
      where: { organization: { subdomain } }
    });

    await prisma.lead.deleteMany({
      where: { organization: { subdomain } }
    });

    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: emailAdmin }
      }
    });

    await prisma.user.deleteMany({
      where: { email: emailAdmin }
    });

    await prisma.organization.deleteMany({
      where: { subdomain }
    });
  };

  beforeAll(async () => {
    await cleanup();

    // Signup user
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'JobAdmin',
        lastName: 'User',
        orgName: 'Jobs Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;
    adminUserId = signupRes.body.data.user.id;

    // Seed 1 lead and 1 task
    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        name: 'Jane Job',
        status: 'NEW'
      }
    });
    leadId = lead.id;

    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        leadId,
        assignedUserId: adminUserId,
        title: 'Review proposal',
        status: 'TODO'
      }
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await cleanup();
    
    // Cleanly terminate queue connections to prevent hanging worker sockets
    await systemWorker.close();
    await systemQueue.close();
    
    await prisma.$disconnect();
    await redis.quit();
  });

  // Helper helper to await job resolutions deterministically
  const waitJobCompleted = (jobId) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Job timeout')), 10000);
      
      const onCompleted = (job) => {
        if (job.id === jobId) {
          clearTimeout(timeout);
          systemWorker.off('completed', onCompleted);
          resolve(job);
        }
      };

      systemWorker.on('completed', onCompleted);
    });
  };

  describe('SEND_EMAIL background job', () => {
    it('should successfully enqueue and process a simulated email transmission', async () => {
      const emailPayload = {
        to: 'customer@example.com',
        subject: 'Welcome to Sales Intel Platform',
        body: 'Hello! Your account has been provisioned.'
      };

      const job = await addJob('SEND_EMAIL', emailPayload);
      expect(job.id).toBeDefined();

      // Await worker completion
      const completedJob = await waitJobCompleted(job.id);
      expect(completedJob.name).toBe('SEND_EMAIL');
      expect(completedJob.data.to).toBe('customer@example.com');
    });
  });

  describe('TASK_REMINDER background job', () => {
    it('should retrieve task from DB and dispatch an in-app system notification', async () => {
      // Clean notifications first
      await prisma.notification.deleteMany({ where: { userId: adminUserId } });

      const job = await addJob('TASK_REMINDER', { taskId });
      expect(job.id).toBeDefined();

      // Await worker resolution
      const completedJob = await waitJobCompleted(job.id);
      expect(completedJob.name).toBe('TASK_REMINDER');

      // Verify notification was created in DB
      const notifications = await prisma.notification.findMany({
        where: { userId: adminUserId }
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('TASK_DUE');
      expect(notifications[0].title).toContain('Upcoming Task: Review proposal');
    });

    it('should skip generating notifications if the task has already been completed', async () => {
      // Mark task as completed
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'COMPLETED' }
      });

      await prisma.notification.deleteMany({ where: { userId: adminUserId } });

      const job = await addJob('TASK_REMINDER', { taskId });
      await waitJobCompleted(job.id);

      // Verify NO notification was created
      const notifications = await prisma.notification.findMany({
        where: { userId: adminUserId }
      });
      expect(notifications).toHaveLength(0);
    });
  });
});
