import { prisma } from '../../database/client.js';

export class ReportsRepository {
  /**
   * Aggregate lead counts and monetary values grouped by pipeline stage.
   */
  async getPipelineStageMetrics(organizationId) {
    return prisma.lead.groupBy({
      by: ['pipelineStageId'],
      where: {
        organizationId,
        deletedAt: null
      },
      _count: {
        id: true
      },
      _sum: {
        value: true
      }
    });
  }

  /**
   * Aggregate lead counts grouped by source.
   */
  async getLeadSourceMetrics(organizationId) {
    return prisma.lead.groupBy({
      by: ['source'],
      where: {
        organizationId,
        deletedAt: null
      },
      _count: {
        id: true
      }
    });
  }

  /**
   * Aggregate active and won lead counts grouped by sales representative.
   */
  async getRepLeadMetrics(organizationId) {
    const [allLeadsByRep, wonLeadsByRep] = await Promise.all([
      // Total leads assigned to each representative
      prisma.lead.groupBy({
        by: ['assignedUserId'],
        where: {
          organizationId,
          deletedAt: null,
          assignedUserId: { not: null }
        },
        _count: {
          id: true
        }
      }),
      // Total WON status leads assigned to each representative
      prisma.lead.groupBy({
        by: ['assignedUserId'],
        where: {
          organizationId,
          deletedAt: null,
          status: 'WON',
          assignedUserId: { not: null }
        },
        _count: {
          id: true
        }
      })
    ]);

    return { allLeadsByRep, wonLeadsByRep };
  }

  /**
   * Aggregate completed task counts grouped by representative.
   */
  async getRepTaskMetrics(organizationId) {
    return prisma.task.groupBy({
      by: ['assignedUserId'],
      where: {
        organizationId,
        status: 'COMPLETED',
        deletedAt: null,
        assignedUserId: { not: null }
      },
      _count: {
        id: true
      }
    });
  }
}
