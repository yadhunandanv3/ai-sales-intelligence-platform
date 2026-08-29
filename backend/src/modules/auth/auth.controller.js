import { Router } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { validateBody } from '../../middleware/validation.js';
import { auditService } from '../audit/audit.service.js';

const router = Router();
const authService = new AuthService();

// --- Zod Validation Schemas ---

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  orgName: z.string().min(1, 'Organization name is required'),
  subdomain: z.string()
    .min(2, 'Subdomain must be at least 2 characters')
    .max(30, 'Subdomain cannot exceed 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Subdomain must contain only lowercase letters, numbers, and dashes')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const tokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// --- Route Handlers ---

router.post('/signup', validateBody(signupSchema), async (req, res, next) => {
  try {
    const result = await authService.signup(req.body);

    await auditService.logEvent({
      organizationId: result.organization.id,
      userId: result.user.id,
      action: 'USER_SIGNUP',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { email: result.user.email }
    });

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);

    await auditService.logEvent({
      organizationId: result.organization.id,
      userId: result.user.id,
      action: 'USER_LOGIN_SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { email: result.user.email }
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    await auditService.logEvent({
      action: 'USER_LOGIN_FAILED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { email: req.body.email, reason: error.message }
    });

    next(error);
  }
});

router.post('/refresh', validateBody(tokenSchema), async (req, res, next) => {
  try {
    const tokens = await authService.refresh(req.body.refreshToken);
    res.status(200).json({
      success: true,
      data: tokens
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', validateBody(tokenSchema), async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken);
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
