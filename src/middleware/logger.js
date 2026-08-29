import pino from 'pino';
import env from '../config/env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});

// Express request logging middleware
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request start
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }, `Incoming ${req.method} ${req.url}`);

  // Hook res.end to log response details and duration
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs: duration
    }, `Completed ${req.method} ${req.url} with ${res.statusCode} in ${duration}ms`);
  });

  next();
};
