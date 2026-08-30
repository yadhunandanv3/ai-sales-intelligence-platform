import app from './app.js';
import env from './config/env.js';
import { verifyDatabaseConnection, prisma } from './database/client.js';
import { verifyRedisConnection } from './integrations/redis.js';
import { logger } from './middleware/logger.js';
import redisClient from './integrations/redis.js';
import './workers/system.worker.js';

const startServer = async () => {
  try {
    logger.info('🚀 Bootstrapping server components...');

    // 1. Verify Database
    await verifyDatabaseConnection();

    // 2. Verify Redis
    await verifyRedisConnection();

    // 3. Start Express server
    const server = app.listen(env.PORT, () => {
      logger.info(`⚡ Server running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
    });

    // Graceful Shutdown logic
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      // Set a timeout to force shutdown if services hang
      const forceShutdownTimeout = setTimeout(() => {
        logger.error('Shutdown forced after timeout. Exiting.');
        process.exit(1);
      }, 10000);

      try {
        server.close(() => {
          logger.info('Express server closed.');
        });

        // Close Prisma connection
        await prisma.$disconnect();
        logger.info('Prisma connection disconnected.');

        // Close Redis connection
        await redisClient.quit();
        logger.info('Redis connection closed.');

        clearTimeout(forceShutdownTimeout);
        logger.info('Graceful shutdown completed successfully.');
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, 'Error occurred during graceful shutdown.');
        clearTimeout(forceShutdownTimeout);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ err: error }, 'Fatal error during server startup. Exiting.');
    process.exit(1);
  }
};

startServer();
