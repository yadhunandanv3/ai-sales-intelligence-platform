import { Router } from 'express';
import { z } from 'zod';
import { ActivitiesService } from './activities.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validation.js';

const router = Router();
const activitiesService = new ActivitiesService();

// --- Zod Validation Schemas ---

const logActivitySchema = z.object({
  type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'STATUS_CHANGE', 'ASSIGNMENT']),
  content: z.record(z.any(), { required_error: 'Activity details content is required' })
});

const leadIdParamSchema = z.object({
  leadId: z.string().uuid('Invalid lead UUID')
});

// Secure all endpoints in this router
router.use(authenticateUser);

/**
 * POST /api/leads/:leadId/activities
 * Log an activity (call, email, meeting, note) for a lead.
 * Requires 'lead:update' permission.
 */
router.post(
  '/:leadId/activities',
  requirePermission('lead:update'),
  validateParams(leadIdParamSchema),
  validateBody(logActivitySchema),
  async (req, res, next) => {
    try {
      const activity = await activitiesService.logActivity({
        organizationId: req.user.organizationId,
        leadId: req.params.leadId,
        userId: req.user.userId,
        type: req.body.type,
        content: req.body.content
      });

      res.status(201).json({
        success: true,
        data: activity
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/leads/:leadId/activities
 * Fetch the chronological timeline of activities.
 * Requires 'lead:read' permission.
 */
router.get(
  '/:leadId/activities',
  requirePermission('lead:read'),
  validateParams(leadIdParamSchema),
  async (req, res, next) => {
    try {
      const timeline = await activitiesService.getLeadTimeline(
        req.params.leadId,
        req.user.organizationId
      );

      res.status(200).json({
        success: true,
        data: timeline
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
