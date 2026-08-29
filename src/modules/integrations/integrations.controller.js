import { Router } from 'express';
import { z } from 'zod';
import { integrationsService } from './integrations.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validation.js';

const router = Router();

// --- Zod Validation Schemas ---

const connectSchema = z.object({
  provider: z.enum(['SLACK', 'SMTP', 'SENDGRID']),
  config: z.object({
    webhookUrl: z.string().url('Webhook must be a valid URL').optional(),
    apiKey: z.string().optional(),
    smtpHost: z.string().optional()
  }).refine(data => data.webhookUrl || data.apiKey || data.smtpHost, {
    message: 'At least one configuration parameter is required'
  }),
  isActive: z.boolean().optional().default(true)
});

// Secure all integration endpoints
router.use(authenticateUser);
router.use(requirePermission('organization:manage'));

/**
 * POST /api/integrations
 * Connect or update third-party integration settings.
 */
router.post('/', validateBody(connectSchema), async (req, res, next) => {
  try {
    const integration = await integrationsService.connectIntegration(
      req.user.organizationId,
      req.body
    );

    res.status(200).json({
      success: true,
      data: integration
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/integrations
 * Retrieve configured integrations settings for the organization.
 */
router.get('/', async (req, res, next) => {
  try {
    const data = await integrationsService.getIntegrations(req.user.organizationId);

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
});

export default router;
