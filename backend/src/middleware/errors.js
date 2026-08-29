import { z } from 'zod';
import { logger } from './logger.js';
import { AppError } from '../common/errors.js';
import env from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  // If headers already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details = null;

  // Handle Zod Validation Errors
  if (err instanceof z.ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
  }
  // Handle Custom App Operational Errors
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }
  // Handle Prisma Database Errors
  else if (err.code && err.code.startsWith('P')) {
    // Prisma client errors starts with P
    logger.warn({ prismaError: err.code, message: err.message }, 'Database constraint violation');
    
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'CONFLICT_ERROR';
      message = `Unique constraint failed on field: ${err.meta?.target || 'unknown'}`;
    } else if (err.code === 'P2003') {
      statusCode = 400;
      code = 'FOREIGN_KEY_VIOLATION';
      message = 'Invalid reference key';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'Record to update/delete was not found';
    } else {
      statusCode = 400;
      code = 'DATABASE_ERROR';
      message = 'A database error occurred';
    }
  }
  // Log standard unhandled Node exceptions
  else {
    logger.error({
      err: {
        message: err.message,
        stack: err.stack,
        ...err
      }
    }, 'Unhandled Exception caught by error boundary');
  }

  const responsePayload = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      ...(env.NODE_ENV === 'development' && { stack: err.stack })
    }
  };

  res.status(statusCode).json(responsePayload);
};
