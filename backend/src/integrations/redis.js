import Redis from 'ioredis';
import env from '../config/env.js';
import { logger } from '../middleware/logger.js';

let redis;

try {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true // Do not connect instantly during initialization
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });

  redis.on('connect', () => {
    logger.info('🔌 Redis connection established.');
  });
} catch (error) {
  logger.fatal({ err: error }, '❌ Redis initialization failed.');
  process.exit(1);
}

export const verifyRedisConnection = async () => {
  try {
    await redis.connect();
    const result = await redis.ping();
    if (result === 'PONG') {
      logger.info('🔌 Redis ping successful.');
      return true;
    }
    throw new Error('Redis ping did not return PONG');
  } catch (error) {
    logger.fatal({ err: error }, '❌ Redis connectivity check failed.');
    throw error;
  }
};

export default redis;
