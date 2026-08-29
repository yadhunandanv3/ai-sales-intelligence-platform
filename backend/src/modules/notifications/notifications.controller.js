import { Router } from 'express';
import { z } from 'zod';
import { NotificationsService } from './notifications.service.js';
import { authenticateUser } from '../../middleware/auth.js';
import { validateQuery, validateParams } from '../../middleware/validation.js';

const router = Router();
const notificationsService = new NotificationsService();

// --- Zod Validation Schemas ---

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  isRead: z.enum(['true', 'false']).optional()
});

const idParamSchema = z.object({
  id: z.string().uuid('Invalid notification UUID')
});

// Secure all notification endpoints
router.use(authenticateUser);

/**
 * GET /api/notifications
 * List all notifications for the authenticated user.
 */
router.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const result = await notificationsService.listUserNotifications(req.user.userId, req.query);
    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/notifications/unread-count
 * Fetch total unread notifications count for badge indicators.
 */
router.get('/unread-count', async (req, res, next) => {
  try {
    const countData = await notificationsService.getUnreadCount(req.user.userId);
    res.status(200).json({
      success: true,
      data: countData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for the user.
 */
router.patch('/read-all', async (req, res, next) => {
  try {
    const result = await notificationsService.markAllNotificationsRead(req.user.userId);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
router.patch('/:id/read', validateParams(idParamSchema), async (req, res, next) => {
  try {
    const notification = await notificationsService.markNotificationRead(req.params.id, req.user.userId);
    res.status(200).json({
      success: true,
      data: notification
    });
  } catch (error) {
    next(error);
  }
});

export default router;
