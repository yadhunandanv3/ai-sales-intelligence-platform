import { Router } from 'express';
import { z } from 'zod';
import { UsersService } from './users.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validation.js';

const router = Router();
const usersService = new UsersService();

// --- Zod Validation Schemas ---

const updateRoleSchema = z.object({
  role: z.string().min(1, 'Role name or ID is required')
});

const userIdParamSchema = z.object({
  userId: z.string().uuid('Invalid user UUID')
});

// --- Controller Routes ---

// All routes in this controller require authentication
router.use(authenticateUser);

/**
 * GET /api/users/me
 * Retrieve the current logged-in user's profile and active organization context.
 */
router.get('/me', async (req, res, next) => {
  try {
    const profile = await usersService.getProfile(req.user.userId);
    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users
 * List all users/members belonging to the user's organization.
 */
router.get('/', async (req, res, next) => {
  try {
    const members = await usersService.listOrganizationMembers(req.user.organizationId);
    res.status(200).json({
      success: true,
      data: members
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/:userId/role
 * Update a user's role within the organization.
 * Restricted to members with the 'user:manage' permission.
 */
router.patch(
  '/:userId/role',
  requirePermission('user:manage'),
  validateParams(userIdParamSchema),
  validateBody(updateRoleSchema),
  async (req, res, next) => {
    try {
      const result = await usersService.updateUserRole(
        req.user.userId,
        req.params.userId,
        req.user.organizationId,
        req.body.role
      );
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
