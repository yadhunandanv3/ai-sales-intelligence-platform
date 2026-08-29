import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errors.js';
import { prisma } from './database/client.js';
import redis from './integrations/redis.js';
import authRouter from './modules/auth/auth.controller.js';
import usersRouter from './modules/users/users.controller.js';
import leadsRouter from './modules/leads/leads.controller.js';
import pipelinesRouter from './modules/pipelines/pipelines.controller.js';
import activitiesRouter from './modules/activities/activities.controller.js';
import { tasksRouter, leadsTasksRouter } from './modules/tasks/tasks.controller.js';
import notificationsRouter from './modules/notifications/notifications.controller.js';
import reportsRouter from './modules/reports/reports.controller.js';
import aiRouter from './modules/ai/ai.controller.js';
import assistantRouter from './modules/ai/assistant.controller.js';
import integrationsRouter from './modules/integrations/integrations.controller.js';
import { rateLimiter } from './middleware/rateLimiter.js';

const app = express();

// Secure headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: '*', // We can restrict this in production via env
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json());

// Request logger middleware
app.use(requestLogger);

// Global rate limiter (100 reqs/minute per IP)
app.use(rateLimiter({ windowSeconds: 60, maxRequests: 100 }));

// Base route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the AI-Powered Lead Management & Sales Intelligence API Platform'
  });
});

// Auth endpoints
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/leads', activitiesRouter);
app.use('/api/leads', leadsTasksRouter);
app.use('/api/pipelines', pipelinesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/leads', aiRouter);
app.use('/api/ai/assistant', assistantRouter);
app.use('/api/integrations', integrationsRouter);

// Health check endpoint
app.get('/health', async (req, res, next) => {
  try {
    // 1. Check PostgreSQL DB
    await prisma.$executeRawUnsafe('SELECT 1');
    const dbStatus = 'connected';

    // 2. Check Redis DB
    const redisResult = await redis.ping();
    const redisStatus = redisResult === 'PONG' ? 'connected' : 'disconnected';

    res.json({
      success: true,
      data: {
        status: redisStatus === 'connected' ? 'healthy' : 'degraded',
        services: {
          database: dbStatus,
          redis: redisStatus
        }
      }
    });
  } catch (error) {
    // Pass database/redis connectivity errors to centralized handler
    next(error);
  }
});

// Centralized error handling middleware
app.use(errorHandler);

export default app;
