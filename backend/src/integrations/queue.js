import { Queue } from 'bullmq';
import Redis from 'ioredis';
import env from '../config/env.js';
import { logger } from '../middleware/logger.js';

// BullMQ needs its own Redis connection handles with maxRetriesPerRequest: null
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

connection.on('error', (err) => {
  logger.error({ err }, 'BullMQ Redis connection error');
});

export const systemQueue = new Queue('system-queue', {
  connection,
  defaultJobOptions: {
    attempts: 3, // Auto retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 1000 // Retry after 1s, 2s, 4s...
    },
    removeOnComplete: true, // Keep Redis memory footprint low
    removeOnFail: false
  }
});

/**
 * Add a job to the background processing queue.
 * @param {string} name - Name/type of the job
 * @param {object} data - Payload data
 * @param {object} opts - Optional BullMQ configurations
 */
export const addJob = async (name, data, opts = {}) => {
  try {
    const job = await systemQueue.add(name, data, opts);
    logger.info({ jobId: job.id, jobName: name }, 'Job successfully added to queue');
    return job;
  } catch (error) {
    logger.error({ err: error, jobName: name }, 'Failed to add job to queue');
    throw error;
  }
};
