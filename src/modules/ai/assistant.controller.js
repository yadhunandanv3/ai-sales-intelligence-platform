import { Router } from 'express';
import { z } from 'zod';
import { AIAssistantService } from './assistant.service.js';
import { authenticateUser } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validation.js';

const router = Router();
const assistantService = new AIAssistantService();

// --- Zod Validation Schemas ---

const assistantMessageSchema = z.object({
  message: z.string().min(1, 'Message is required').max(1000, 'Message cannot exceed 1000 characters')
});

// Secure all endpoints in this router
router.use(authenticateUser);

/**
 * POST /api/ai/assistant
 * Interact with the AI Sales Assistant using natural language function calling.
 */
router.post(
  '/',
  validateBody(assistantMessageSchema),
  async (req, res, next) => {
    try {
      const result = await assistantService.processConversation(
        req.body.message,
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

export default router;
