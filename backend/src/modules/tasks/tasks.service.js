import { TasksRepository } from './tasks.repository.js';
import { LeadsService } from '../leads/leads.service.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { prisma } from '../../database/client.js';

const tasksRepository = new TasksRepository();
const leadsService = new LeadsService();

export class TasksService {
  /**
   * Create a new task related to a lead.
   */
  async createTask(organizationId, leadId, taskData) {
    // 1. Confirm lead belongs to organization
    await leadsService.getLeadById(leadId, organizationId);

    // 2. Verify assignee (if provided)
    if (taskData.assignedUserId) {
      await this.verifyUserBelongsToOrg(taskData.assignedUserId, organizationId);
    }

    // 3. Save task
    const data = {
      ...taskData,
      leadId,
      organizationId
    };

    return tasksRepository.createTask(data);
  }

  /**
   * List tasks associated with a lead.
   */
  async listTasksForLead(leadId, organizationId) {
    await leadsService.getLeadById(leadId, organizationId);
    return tasksRepository.findTasksByLead(leadId, organizationId);
  }

  /**
   * List all active tasks assigned to the current user in the organization.
   */
  async listMyTasks(userId, organizationId) {
    return tasksRepository.findTasksByUser(userId, organizationId);
  }

  /**
   * Update task details or state.
   */
  async updateTask(id, organizationId, updateData) {
    // 1. Confirm task exists and belongs to tenant
    const task = await tasksRepository.findTaskById(id, organizationId);
    if (!task) {
      throw new NotFoundError('Task not found in this organization');
    }

    // 2. Verify assignee (if setting)
    if (updateData.assignedUserId) {
      await this.verifyUserBelongsToOrg(updateData.assignedUserId, organizationId);
    }

    // 3. Update
    return tasksRepository.updateTask(id, organizationId, updateData);
  }

  /**
   * Soft delete/archive a task.
   */
  async deleteTask(id, organizationId) {
    const task = await tasksRepository.findTaskById(id, organizationId);
    if (!task) {
      throw new NotFoundError('Task not found in this organization');
    }

    await tasksRepository.softDeleteTask(id, organizationId);
    return { success: true, message: 'Task deleted successfully' };
  }

  // --- Helpers ---

  /**
   * Verify that a user belongs to the organization.
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
}
