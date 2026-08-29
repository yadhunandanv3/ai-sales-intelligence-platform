import { prisma } from '../../database/client.js';

export class ActivitiesRepository {
  /**
   * Log a new activity on a lead.
   */
  async createActivity({ organizationId, leadId, userId, type, content }) {
    return prisma.activity.create({
      data: {
        organizationId,
        leadId,
        userId,
        type,
        content
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      }
    });
  }

  /**
   * Fetch chronological activities for a lead (ensures tenant isolation).
   */
  async findActivitiesByLead(leadId, organizationId) {
    return prisma.activity.findMany({
      where: {
        leadId,
        organizationId
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}
