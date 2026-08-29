import { Router } from 'express';
import { z } from 'zod';
import { PipelinesService } from './pipelines.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validation.js';

const router = Router();
const pipelinesService = new PipelinesService();

// --- Zod Validation Schemas ---

const createPipelineSchema = z.object({
  name: z.string().min(1, 'Pipeline name is required')
});

const updatePipelineSchema = createPipelineSchema;

const addStageSchema = z.object({
  name: z.string().min(1, 'Stage name is required')
});

const reorderStagesSchema = z.object({
  stageIds: z.array(z.string().uuid('Invalid stage UUID')).min(1, 'At least one stage ID is required')
});

const pipelineIdParamSchema = z.object({
  id: z.string().uuid('Invalid pipeline UUID')
});

const stageDeleteParamSchema = z.object({
  pipelineId: z.string().uuid('Invalid pipeline UUID'),
  stageId: z.string().uuid('Invalid stage UUID')
});

// --- Controller Routes ---

// Secure all pipeline routes
router.use(authenticateUser);

/**
 * POST /api/pipelines
 * Create a new sales pipeline.
 * Requires 'organization:manage' permission.
 */
router.post(
  '/',
  requirePermission('organization:manage'),
  validateBody(createPipelineSchema),
  async (req, res, next) => {
    try {
      const pipeline = await pipelinesService.createPipeline(req.user.organizationId, req.body.name);
      res.status(201).json({
        success: true,
        data: pipeline
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/pipelines
 * List all pipelines and their stages.
 * Requires 'lead:read' permission to view workflows.
 */
router.get(
  '/',
  requirePermission('lead:read'),
  async (req, res, next) => {
    try {
      const pipelines = await pipelinesService.listPipelines(req.user.organizationId);
      res.status(200).json({
        success: true,
        data: pipelines
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/pipelines/:id
 * Retrieve details for a single pipeline.
 * Requires 'lead:read' permission.
 */
router.get(
  '/:id',
  requirePermission('lead:read'),
  validateParams(pipelineIdParamSchema),
  async (req, res, next) => {
    try {
      const pipeline = await pipelinesService.getPipeline(req.params.id, req.user.organizationId);
      res.status(200).json({
        success: true,
        data: pipeline
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/pipelines/:id
 * Update pipeline name.
 * Requires 'organization:manage' permission.
 */
router.patch(
  '/:id',
  requirePermission('organization:manage'),
  validateParams(pipelineIdParamSchema),
  validateBody(updatePipelineSchema),
  async (req, res, next) => {
    try {
      const pipeline = await pipelinesService.updatePipeline(req.params.id, req.user.organizationId, req.body);
      res.status(200).json({
        success: true,
        data: pipeline
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/pipelines/:id
 * Delete a sales pipeline (cascades stages and sets leads stage relation to null).
 * Requires 'organization:manage' permission.
 */
router.delete(
  '/:id',
  requirePermission('organization:manage'),
  validateParams(pipelineIdParamSchema),
  async (req, res, next) => {
    try {
      const result = await pipelinesService.deletePipeline(req.params.id, req.user.organizationId);
      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/pipelines/:id/stages
 * Add a new stage to a pipeline.
 * Requires 'organization:manage' permission.
 */
router.post(
  '/:id/stages',
  requirePermission('organization:manage'),
  validateParams(pipelineIdParamSchema),
  validateBody(addStageSchema),
  async (req, res, next) => {
    try {
      const stage = await pipelinesService.addStage(req.params.id, req.user.organizationId, req.body.name);
      res.status(201).json({
        success: true,
        data: stage
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/pipelines/:id/stages/reorder
 * Reorder stages in a pipeline.
 * Requires 'organization:manage' permission.
 */
router.patch(
  '/:id/stages/reorder',
  requirePermission('organization:manage'),
  validateParams(pipelineIdParamSchema),
  validateBody(reorderStagesSchema),
  async (req, res, next) => {
    try {
      const pipeline = await pipelinesService.reorderStages(
        req.params.id,
        req.user.organizationId,
        req.body.stageIds
      );
      res.status(200).json({
        success: true,
        data: pipeline
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/pipelines/:pipelineId/stages/:stageId
 * Remove a specific stage from a pipeline.
 * Requires 'organization:manage' permission.
 */
router.delete(
  '/:pipelineId/stages/:stageId',
  requirePermission('organization:manage'),
  validateParams(stageDeleteParamSchema),
  async (req, res, next) => {
    try {
      const result = await pipelinesService.deleteStage(
        req.params.pipelineId,
        req.params.stageId,
        req.user.organizationId
      );
      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
