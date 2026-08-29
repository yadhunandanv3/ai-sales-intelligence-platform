import { Worker } from 'bullmq';
import Redis from 'ioredis';
import env from '../config/env.js';
import { logger } from '../middleware/logger.js';
import { prisma } from '../database/client.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const notificationsService = new NotificationsService();

export const systemWorker = new Worker(
  'system-queue',
  async (job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Processing background job');

    switch (job.name) {
      case 'SEND_EMAIL': {
        const { to, subject, body } = job.data;
        if (!to || !subject) {
          throw new Error('Invalid email job payload: missing recipient or subject');
        }

        // Simulate SMTP delivery latency
        await new Promise((resolve) => setTimeout(resolve, 500));

        logger.info(
          { to, subject, bodySnippet: body?.substring(0, 50) },
          '📧 [SMTP SIMULATION] Email sent successfully.'
        );
        return { success: true, email: to };
      }

      case 'TASK_REMINDER': {
        const { taskId } = job.data;
        if (!taskId) {
          throw new Error('Invalid task reminder payload: missing taskId');
        }

        // Fetch task details from database
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { lead: true }
        });

        // Skip reminder if task was deleted or marked completed
        if (!task || task.deletedAt || task.status === 'COMPLETED') {
          logger.info({ taskId }, 'Task reminder skipped (task completed or deleted)');
          return { skipped: true };
        }

        // Create in-app system notification
        await notificationsService.createSystemNotification({
          organizationId: task.organizationId,
          userId: task.assignedUserId,
          title: `Upcoming Task: ${task.title}`,
          message: `Task "${task.title}" associated with lead "${task.lead.name}" is due soon.`,
          type: 'TASK_DUE'
        });

        logger.info({ taskId, userId: task.assignedUserId }, 'Task reminder notification dispatched');
        return { success: true };
      }

      default:
        logger.warn({ jobName: job.name }, 'Unsupported job type. Skipping.');
        throw new Error(`Unsupported job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5 // Process up to 5 jobs concurrently
  }
);

systemWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Background job completed successfully');
});

systemWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Background job failed');
});
