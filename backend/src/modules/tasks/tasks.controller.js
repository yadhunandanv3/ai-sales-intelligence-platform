import { Router } from 'express';
import { z } from 'zod';
import { TasksService } from './tasks.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateBody, validateParams } from '../../middleware/validation.js';

const tasksService = new TasksService();

// --- Zod Validation Schemas ---

const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional().nullable(),
  dueDate: z.string().datetime('Due date must be a valid ISO datetime').optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED']).default('TODO'),
  assignedUserId: z.string().uuid('Invalid assignee UUID').optional().nullable()
});

const updateTaskSchema = createTaskSchema.partial();

const idParamSchema = z.object({
  id: z.string().uuid('Invalid task UUID')
});

const leadIdParamSchema = z.object({
  leadId: z.string().uuid('Invalid lead UUID')
});

// --- 1. Router for /api/tasks ---
const tasksRouter = Router();
tasksRouter.use(authenticateUser);

/**
 * GET /api/tasks
 * List all active tasks assigned to the current user.
 * Requires 'lead:read' permission.
 */
tasksRouter.get('/', requirePermission('lead:read'), async (req, res, next) => {
  try {
    const tasks = await tasksService.listMyTasks(req.user.userId, req.user.organizationId);
    res.status(200).json({
      success: true,
      data: tasks
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/tasks/:id
 * Update details or status (e.g. complete) of a task.
 * Requires 'task:update' permission.
 */
tasksRouter.patch(
  '/:id',
  requirePermission('task:update'),
  validateParams(idParamSchema),
  validateBody(updateTaskSchema),
  async (req, res, next) => {
    try {
      const task = await tasksService.updateTask(
        req.params.id,
        req.user.organizationId,
        req.body
      );
      res.status(200).json({
        success: true,
        data: task
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/tasks/:id
 * Soft delete/archive a task.
 * Requires 'task:update' permission (or task:delete).
 */
tasksRouter.delete(
  '/:id',
  requirePermission('task:update'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const result = await tasksService.deleteTask(req.params.id, req.user.organizationId);
      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      next(error);
    }
  }
);

// --- 2. Router for /api/leads/:leadId/tasks ---
const leadsTasksRouter = Router();
leadsTasksRouter.use(authenticateUser);

/**
 * POST /api/leads/:leadId/tasks
 * Create a new task associated with a lead.
 * Requires 'task:create' permission.
 */
leadsTasksRouter.post(
  '/:leadId/tasks',
  requirePermission('task:create'),
  validateParams(leadIdParamSchema),
  validateBody(createTaskSchema),
  async (req, res, next) => {
    try {
      const task = await tasksService.createTask(
        req.user.organizationId,
        req.params.leadId,
        req.body
      );
      res.status(201).json({
        success: true,
        data: task
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/leads/:leadId/tasks
 * List all tasks associated with a lead.
 * Requires 'lead:read' permission.
 */
leadsTasksRouter.get(
  '/:leadId/tasks',
  requirePermission('lead:read'),
  validateParams(leadIdParamSchema),
  async (req, res, next) => {
    try {
      const tasks = await tasksService.listTasksForLead(
        req.params.leadId,
        req.user.organizationId
      );
      res.status(200).json({
        success: true,
        data: tasks
      });
    } catch (error) {
      next(error);
    }
  }
);

export { tasksRouter, leadsTasksRouter };
