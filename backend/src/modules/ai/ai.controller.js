import { Router } from 'express';
import { z } from 'zod';
import { AIService } from './ai.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateParams, validateBody } from '../../middleware/validation.js';

const router = Router();
const aiService = new AIService();

// --- Zod Validation Schemas ---

const leadIdParamSchema = z.object({
  id: z.string().uuid('Invalid lead UUID')
});

const followUpSchema = z.object({
  tone: z.enum(['PROFESSIONAL', 'CASUAL', 'URGENT']).default('PROFESSIONAL'),
  customInstructions: z.string().max(500, 'Instructions cannot exceed 500 characters').optional().nullable()
});

// Secure all endpoints in this router
router.use(authenticateUser);

/**
 * POST /api/leads/:id/score
 * Trigger manual AI lead scoring analysis.
 * Requires 'lead:update' permission.
 */
router.post(
  '/:id/score',
  requirePermission('lead:update'),
  validateParams(leadIdParamSchema),
  async (req, res, next) => {
    try {
      const result = await aiService.scoreLead(
        req.params.id,
        req.user.organizationId,
        req.user.userId
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

/**
 * POST /api/leads/:id/summary
 * Trigger manual AI lead summary generation.
 * Requires 'lead:update' permission.
 */
router.post(
  '/:id/summary',
  requirePermission('lead:update'),
  validateParams(leadIdParamSchema),
  async (req, res, next) => {
    try {
      const result = await aiService.generateLeadSummary(
        req.params.id,
        req.user.organizationId,
        req.user.userId
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

/**
 * POST /api/leads/:id/follow-up
 * Trigger manual AI email follow-up draft generation.
 * Requires 'lead:update' permission.
 */
router.post(
  '/:id/follow-up',
  requirePermission('lead:update'),
  validateParams(leadIdParamSchema),
  validateBody(followUpSchema),
  async (req, res, next) => {
    try {
      const result = await aiService.generateFollowUp(
        req.params.id,
        req.user.organizationId,
        req.user.userId,
        req.body
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
