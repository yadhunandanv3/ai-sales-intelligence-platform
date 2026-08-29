import { LeadsRepository } from './leads.repository.js';
import { prisma } from '../../database/client.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import redis from '../../integrations/redis.js';
import { integrationsService } from '../integrations/integrations.service.js';

const leadsRepository = new LeadsRepository();

export class LeadsService {
  /**
   * Create a new lead.
   */
  async createLead(leadData, organizationId) {
    // 1. Verify assignee belongs to organization (if assigned)
    if (leadData.assignedUserId) {
      await this.verifyUserBelongsToOrg(leadData.assignedUserId, organizationId);
    }

    // 2. Verify pipeline stage matches (if provided)
    if (leadData.pipelineStageId) {
      await this.verifyPipelineStageBelongsToOrg(leadData.pipelineStageId, organizationId);
    }

    // 3. Create lead
    const data = {
      ...leadData,
      organizationId
    };

    return leadsRepository.createLead(data);
  }

  /**
   * Fetch a lead. Implements Cache-Aside pattern.
   */
  async getLeadById(id, organizationId) {
    const cacheKey = `lead:${organizationId}:${id}`;
    
    try {
      const cachedLead = await redis.get(cacheKey);
      if (cachedLead) {
        return JSON.parse(cachedLead);
      }
    } catch (err) {
      // Fail-safe: bypass caching if Redis fails
    }

    const lead = await leadsRepository.findLeadById(id, organizationId);
    if (!lead) {
      throw new NotFoundError('Lead not found in this organization');
    }

    try {
      // Cache the result for 10 minutes (600 seconds)
      await redis.set(cacheKey, JSON.stringify(lead), 'EX', 600);
    } catch (err) {
      // Fail-safe
    }

    return lead;
  }

  /**
   * Update lead details. Invalidates cache.
   */
  async updateLead(id, organizationId, updateData) {
    // 1. Confirm lead exists in tenant scope (checks cache/db)
    const existingLead = await this.getLeadById(id, organizationId);
    const previousStatus = existingLead.status;

    // 2. Verify assignee
    if (updateData.assignedUserId) {
      await this.verifyUserBelongsToOrg(updateData.assignedUserId, organizationId);
    }

    // 3. Verify stage
    if (updateData.pipelineStageId) {
      await this.verifyPipelineStageBelongsToOrg(updateData.pipelineStageId, organizationId);
    }

    // 4. Update
    const updatedLead = await leadsRepository.updateLead(id, organizationId, updateData);

    // Trigger integrations if status changes to WON
    if (updateData.status === 'WON' && previousStatus !== 'WON') {
      // Execute asynchronously in background
      integrationsService.triggerSlackWonDeal(organizationId, updatedLead);
    }

    // 5. Invalidate cache key
    try {
      const cacheKey = `lead:${organizationId}:${id}`;
      await redis.del(cacheKey);
    } catch (err) {
      // Fail-safe
    }

    return updatedLead;
  }

  /**
   * Soft delete a lead. Invalidates cache.
   */
  async deleteLead(id, organizationId) {
    // Confirm lead exists (checks cache/db)
    await this.getLeadById(id, organizationId);
    await leadsRepository.softDeleteLead(id, organizationId);

    // Invalidate cache key
    try {
      const cacheKey = `lead:${organizationId}:${id}`;
      await redis.del(cacheKey);
    } catch (err) {
      // Fail-safe
    }

    return { success: true, message: 'Lead archived successfully' };
  }

  /**
   * Bulk assign multiple leads.
   */
  async bulkAssign(leadIds, assignedUserId, organizationId) {
    // 1. Verify user exists and belongs to the same org
    await this.verifyUserBelongsToOrg(assignedUserId, organizationId);

    // 2. Perform bulk assignment
    const result = await leadsRepository.bulkAssignLeads(leadIds, assignedUserId, organizationId);

    return {
      assignedCount: result.count
    };
  }

  /**
   * List leads with dynamic sorting, filtering, searching, and pagination.
   */
  async listLeads({
    organizationId,
    page = 1,
    limit = 10,
    search,
    status,
    source,
    assignedUserId,
    pipelineStageId,
    tags,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    // Convert string inputs to integers and set pagination bounds
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10))); // Cap page limit at 100
    const skip = (pageNum - 1) * limitNum;

    // Validate sorting parameters
    const allowedSortFields = ['createdAt', 'updatedAt', 'name', 'value', 'score'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const validSortOrder = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';

    // Parse comma-separated tags into array
    const parsedTags = typeof tags === 'string' 
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : Array.isArray(tags) ? tags : [];

    const { items, total } = await leadsRepository.findManyLeads({
      organizationId,
      skip,
      take: limitNum,
      search,
      status,
      source,
      assignedUserId,
      pipelineStageId,
      tags: parsedTags,
      sortBy: validSortBy,
      sortOrder: validSortOrder
    });

    return {
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  // --- Helpers ---

  /**
   * Verify that a user belongs to the tenant organization.
   */
  async verifyUserBelongsToOrg(userId, organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId
        }
      }
    });

    if (!membership) {
      throw new ValidationError('Assigned user must belong to your organization');
    }
  }

  /**
   * Verify that a pipeline stage belongs to the tenant organization.
   */
  async verifyPipelineStageBelongsToOrg(pipelineStageId, organizationId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: {
        id: pipelineStageId,
        pipeline: {
          organizationId
        }
      }
    });

    if (!stage) {
      throw new ValidationError('Invalid pipeline stage selected');
    }
  }
}
