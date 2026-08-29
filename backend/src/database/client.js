import { PrismaClient } from '@prisma/client';
import env from '../config/env.js';
import { logger } from '../middleware/logger.js';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL
    }
  },
  // In development, log SQL queries to Pino
  log: env.NODE_ENV === 'development' ? [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' }
  ] : []
});

if (env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug({ query: e.query, params: e.params, duration: `${e.duration}ms` }, 'Prisma Query');
  });
}

// Function to test the connection at startup
export const verifyDatabaseConnection = async () => {
  try {
    await prisma.$executeRawUnsafe('SELECT 1');
    logger.info('🔌 Database connection verified successfully.');
    return true;
  } catch (error) {
    logger.fatal({ err: error }, '❌ Database connection failed.');
    throw error;
  }
};
