import { prisma } from '../../database/client.js';

export class LeadsRepository {
  /**
   * Create a new Lead.
   */
  async createLead(data) {
    return prisma.lead.create({
      data,
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        pipelineStage: true
      }
    });
  }

  /**
   * Find a single Lead by ID and Organization ID (ensures tenant isolation).
   */
  async findLeadById(id, organizationId) {
    return prisma.lead.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        pipelineStage: true
      }
    });
  }

  /**
   * Update a Lead.
   */
  async updateLead(id, organizationId, updateData) {
    return prisma.lead.update({
      where: {
        id,
        organizationId // Ensures IDOR protection
      },
      data: updateData,
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        pipelineStage: true
      }
    });
  }

  /**
   * Soft delete a Lead.
   */
  async softDeleteLead(id, organizationId) {
    return prisma.lead.update({
      where: {
        id,
        organizationId
      },
      data: {
        deletedAt: new Date()
      }
    });
  }

  /**
   * Bulk assign multiple leads to a user.
   */
  async bulkAssignLeads(leadIds, assignedUserId, organizationId) {
    return prisma.lead.updateMany({
      where: {
        id: { in: leadIds },
        organizationId,
        deletedAt: null
      },
      data: {
        assignedUserId
      }
    });
  }

  /**
   * List leads with filters, search, sorting, and offset pagination.
   */
  async findManyLeads({
    organizationId,
    skip = 0,
    take = 10,
    search,
    status,
    source,
    assignedUserId,
    pipelineStageId,
    tags,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  }) {
    // Build dynamic where clause
    const where = {
      organizationId,
      deletedAt: null
    };

    // Filter by status
    if (status) {
      where.status = status;
    }

    // Filter by source
    if (source) {
      where.source = source;
    }

    // Filter by assigned user
    if (assignedUserId) {
      where.assignedUserId = assignedUserId;
    }

    // Filter by pipeline stage
    if (pipelineStageId) {
      where.pipelineStageId = pipelineStageId;
    }

    // Filter by tags (checks if lead has all target tags)
    if (tags && tags.length > 0) {
      where.tags = {
        hasEvery: tags
      };
    }

    // Search query on name, email, company, or tags
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } }
      ];
    }

    // Execute queries in parallel for efficiency
    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take,
        orderBy: {
          [sortBy]: sortOrder
        },
        include: {
          assignedUser: {
            select: { id: true, email: true, firstName: true, lastName: true }
          },
          pipelineStage: true
        }
      }),
      prisma.lead.count({ where })
    ]);

    return { items, total };
  }
}
