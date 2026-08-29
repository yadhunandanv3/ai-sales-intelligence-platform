import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AuthenticationError, AuthorizationError } from '../common/errors.js';

/**
 * Middleware to authenticate user requests by validating their JWT access token.
 */
export const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Authentication token is missing or malformed'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    
    // Attach user session context to request object
    req.user = {
      userId: payload.userId,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
      permissions: payload.permissions || []
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AuthenticationError('Authentication token has expired'));
    }
    return next(new AuthenticationError('Invalid authentication token'));
  }
};

/**
 * Middleware factory to enforce RBAC permissions.
 * @param {string} requiredPermission - The permission name to verify (e.g. 'lead:create')
 */
export const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('User context not established'));
    }

    const hasPermission = req.user.permissions.includes(requiredPermission);
    if (!hasPermission) {
      return next(new AuthorizationError(`Forbidden: You do not have permission to perform this action (${requiredPermission})`));
    }

    next();
  };
};
