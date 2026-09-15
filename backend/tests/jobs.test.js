import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';
import { QueueEvents } from 'bullmq';
import { addJob, systemQueue } from '../src/integrations/queue.js';
import { systemWorker } from '../src/workers/system.worker.js';

describe('Background Processing Queue Integration Tests', () => {
  let tokenAdmin;
  let orgId;
  let adminUserId;
  let leadId;
  let taskId;
  let queueEvents;

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

    queueEvents = new QueueEvents('system-queue', { connection: redis.duplicate() });

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
    
    // Cleanly terminate queue connections
    if (queueEvents) await queueEvents.close();
    await systemWorker.close();
    await systemQueue.close();
    
    await prisma.$disconnect();
    await redis.quit();
  });

  // Helper helper to await job resolutions deterministically across any worker
  const waitJobCompleted = (jobId) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Job timeout')), 10000);
      
      const onCompleted = ({ jobId: id, returnvalue }) => {
        if (id === jobId) {
          clearTimeout(timeout);
          queueEvents.off('completed', onCompleted);
          resolve({ id, returnvalue });
        }
      };

      queueEvents.on('completed', onCompleted);
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
      expect(completedJob.id).toBe(job.id);
    }, 15000);
  });

  describe('TASK_REMINDER background job', () => {
    it('should retrieve task from DB and dispatch an in-app system notification', async () => {
      // Clean notifications first
      await prisma.notification.deleteMany({ where: { userId: adminUserId } });

      const job = await addJob('TASK_REMINDER', { taskId });
      expect(job.id).toBeDefined();

      // Await worker resolution
      const completedJob = await waitJobCompleted(job.id);
      expect(completedJob.id).toBe(job.id);

      // Verify notification was created in DB
      const notifications = await prisma.notification.findMany({
        where: { userId: adminUserId }
      });

      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Upcoming Task: Review proposal');
    }, 15000);

    it('should skip generating notifications if the task has already been completed', async () => {
      // Mark task completed
      await prisma.task.update({
        where: { id: taskId },
        data: { status: 'COMPLETED' }
      });

      // Clear notifications
      await prisma.notification.deleteMany({ where: { userId: adminUserId } });

      const job = await addJob('TASK_REMINDER', { taskId });
      expect(job.id).toBeDefined();

      const completedJob = await waitJobCompleted(job.id);
      expect(completedJob.id).toBe(job.id);

      const notifications = await prisma.notification.findMany({
        where: { userId: adminUserId }
      });
      expect(notifications).toHaveLength(0);
    }, 15000);
  });
});
