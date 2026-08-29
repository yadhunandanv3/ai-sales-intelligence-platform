import { prisma } from '../../database/client.js';

export class TasksRepository {
  /**
   * Create a new task.
   */
  async createTask(data) {
    return prisma.task.create({
      data,
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        lead: {
          select: { id: true, name: true, company: true }
        }
      }
    });
  }

  /**
   * Find a single task by ID and Organization ID.
   */
  async findTaskById(id, organizationId) {
    return prisma.task.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        lead: {
          select: { id: true, name: true, company: true }
        }
      }
    });
  }

  /**
   * Find tasks associated with a lead.
   */
  async findTasksByLead(leadId, organizationId) {
    return prisma.task.findMany({
      where: {
        leadId,
        organizationId,
        deletedAt: null
      },
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        }
      },
      orderBy: {
        dueDate: 'asc'
      }
    });
  }

  /**
   * List tasks assigned to a specific user across all leads in the organization.
   */
  async findTasksByUser(assignedUserId, organizationId) {
    return prisma.task.findMany({
      where: {
        assignedUserId,
        organizationId,
        deletedAt: null
      },
      include: {
        lead: {
          select: { id: true, name: true, company: true }
        }
      },
      orderBy: [
        { status: 'asc' }, // TODO/IN_PROGRESS before COMPLETED
        { dueDate: 'asc' }
      ]
    });
  }

  /**
   * Update a task.
   */
  async updateTask(id, organizationId, data) {
    return prisma.task.update({
      where: {
        id,
        organizationId
      },
      data,
      include: {
        assignedUser: {
          select: { id: true, email: true, firstName: true, lastName: true }
        },
        lead: {
          select: { id: true, name: true, company: true }
        }
      }
    });
  }

  /**
   * Soft delete a task.
   */
  async softDeleteTask(id, organizationId) {
    return prisma.task.update({
      where: {
        id,
        organizationId
      },
      data: {
        deletedAt: new Date()
      }
    });
  }
}
