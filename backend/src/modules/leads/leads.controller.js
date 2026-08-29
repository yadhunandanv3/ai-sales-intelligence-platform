import { Router } from 'express';
import { z } from 'zod';
import { LeadsService } from './leads.service.js';
import { authenticateUser, requirePermission } from '../../middleware/auth.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validation.js';
import { auditService } from '../audit/audit.service.js';

const router = Router();
const leadsService = new LeadsService();

// --- Zod Validation Schemas ---

const createLeadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address').optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'WON']).default('NEW'),
  pipelineStageId: z.string().uuid('Invalid pipeline stage UUID').optional().nullable(),
  assignedUserId: z.string().uuid('Invalid assigned user UUID').optional().nullable(),
  value: z.number().nonnegative('Value cannot be negative').optional().nullable(),
  tags: z.array(z.string()).optional().default([])
});

const updateLeadSchema = createLeadSchema.partial();

const idParamSchema = z.object({
  id: z.string().uuid('Invalid lead UUID')
});

const bulkAssignSchema = z.object({
  leadIds: z.array(z.string().uuid('Invalid lead UUID in collection')).min(1, 'At least one lead ID is required'),
  assignedUserId: z.string().uuid('Invalid assignee user UUID')
});

const listLeadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  search: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  assignedUserId: z.string().uuid('Invalid assigned user UUID').optional(),
  pipelineStageId: z.string().uuid('Invalid pipeline stage UUID').optional(),
  tags: z.string().optional(), // Expected as comma-separated values (e.g. 'enterprise,high-value')
  sortBy: z.string().optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc', 'ASC', 'DESC']).optional().default('desc')
});

// --- Controller Routes ---

// Secure all lead endpoints
router.use(authenticateUser);

/**
 * POST /api/leads
 * Create a new lead.
 * Requires 'lead:create' permission.
 */
router.post(
  '/',
  requirePermission('lead:create'),
  validateBody(createLeadSchema),
  async (req, res, next) => {
    try {
      const lead = await leadsService.createLead(req.body, req.user.organizationId);

      // Async audit log
      await auditService.logEvent({
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        action: 'LEAD_CREATED',
        targetTable: 'Lead',
        targetId: lead.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { name: lead.name }
      });

      res.status(201).json({
        success: true,
        data: lead
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/leads
 * Query leads with search, filters, sorting, and pagination.
 * Requires 'lead:read' permission.
 */
router.get(
  '/',
  requirePermission('lead:read'),
  validateQuery(listLeadsQuerySchema),
  async (req, res, next) => {
    try {
      const result = await leadsService.listLeads({
        ...req.query,
        organizationId: req.user.organizationId
      });
      res.status(200).json({
        success: true,
        data: result.items,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/leads/:id
 * Retrieve details for a single lead.
 * Requires 'lead:read' permission.
 */
router.get(
  '/:id',
  requirePermission('lead:read'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const lead = await leadsService.getLeadById(req.params.id, req.user.organizationId);
      res.status(200).json({
        success: true,
        data: lead
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/leads/:id
 * Update lead details.
 * Requires 'lead:update' permission.
 */
router.patch(
  '/:id',
  requirePermission('lead:update'),
  validateParams(idParamSchema),
  validateBody(updateLeadSchema),
  async (req, res, next) => {
    try {
      const lead = await leadsService.updateLead(req.params.id, req.user.organizationId, req.body);

      // Async audit log
      await auditService.logEvent({
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        action: 'LEAD_UPDATED',
        targetTable: 'Lead',
        targetId: lead.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { updatedFields: Object.keys(req.body) }
      });

      res.status(200).json({
        success: true,
        data: lead
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/leads/:id
 * Soft delete/archive a lead.
 * Requires 'lead:delete' permission.
 */
router.delete(
  '/:id',
  requirePermission('lead:delete'),
  validateParams(idParamSchema),
  async (req, res, next) => {
    try {
      const result = await leadsService.deleteLead(req.params.id, req.user.organizationId);

      // Async audit log
      await auditService.logEvent({
        organizationId: req.user.organizationId,
        userId: req.user.userId,
        action: 'LEAD_DELETED',
        targetTable: 'Lead',
        targetId: req.params.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { archiveResult: result.message }
      });

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
 * POST /api/leads/bulk-assign
 * Reassign multiple leads to a colleague.
 * Requires 'lead:assign' permission.
 */
router.post(
  '/bulk-assign',
  requirePermission('lead:assign'),
  validateBody(bulkAssignSchema),
  async (req, res, next) => {
    try {
      const result = await leadsService.bulkAssign(
        req.body.leadIds,
        req.body.assignedUserId,
        req.user.organizationId
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
