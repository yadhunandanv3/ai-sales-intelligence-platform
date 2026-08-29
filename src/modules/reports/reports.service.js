import { ReportsRepository } from './reports.repository.js';
import { prisma } from '../../database/client.js';

const reportsRepository = new ReportsRepository();

export class ReportsService {
  /**
   * Summarize lead distributions across pipeline stages with stage names.
   */
  async getPipelineStageSummary(organizationId) {
    const [rawMetrics, stages] = await Promise.all([
      reportsRepository.getPipelineStageMetrics(organizationId),
      prisma.pipelineStage.findMany({
        where: { pipeline: { organizationId } },
        select: { id: true, name: true, position: true }
      })
    ]);

    // Create lookup table for stage details
    const stageMap = new Map(stages.map(s => [s.id, s]));

    // Map metrics to friendly names
    const distribution = rawMetrics.map(item => {
      const stageInfo = item.pipelineStageId ? stageMap.get(item.pipelineStageId) : null;
      return {
        stageId: item.pipelineStageId || 'UNASSIGNED',
        stageName: stageInfo ? stageInfo.name : 'Unassigned',
        position: stageInfo ? stageInfo.position : -1,
        count: item._count.id,
        totalValue: item._sum.value || 0
      };
    });

    // Sort logically by pipeline stage position
    return distribution.sort((a, b) => a.position - b.position);
  }

  /**
   * Summarize lead distributions across acquisition channels.
   */
  async getLeadSourceSummary(organizationId) {
    const rawMetrics = await reportsRepository.getLeadSourceMetrics(organizationId);
    return rawMetrics.map(item => ({
      source: item.source || 'UNKNOWN',
      count: item._count.id
    }));
  }

  /**
   * Consolidate sales rep leaderboard (assigned leads, won deals, completed tasks).
   */
  async getRepPerformanceSummary(organizationId) {
    const [
      { allLeadsByRep, wonLeadsByRep },
      rawTaskMetrics,
      teammates
    ] = await Promise.all([
      reportsRepository.getRepLeadMetrics(organizationId),
      reportsRepository.getRepTaskMetrics(organizationId),
      prisma.user.findMany({
        where: {
          memberships: {
            some: { organizationId }
          }
        },
        select: { id: true, email: true, firstName: true, lastName: true }
      })
    ]);

    // Create lookup maps
    const allLeadsMap = new Map(allLeadsByRep.map(item => [item.assignedUserId, item._count.id]));
    const wonLeadsMap = new Map(wonLeadsByRep.map(item => [item.assignedUserId, item._count.id]));
    const tasksMap = new Map(rawTaskMetrics.map(item => [item.assignedUserId, item._count.id]));

    // Consolidate performance profile for each teammate
    return teammates.map(user => {
      const assignedLeads = allLeadsMap.get(user.id) || 0;
      const wonLeads = wonLeadsMap.get(user.id) || 0;
      const completedTasks = tasksMap.get(user.id) || 0;

      // Calculate conversion rate (deals won / total assigned)
      const winRatePercent = assignedLeads > 0 
        ? Math.round((wonLeads / assignedLeads) * 100) 
        : 0;

      return {
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        assignedLeads,
        wonLeads,
        completedTasks,
        winRatePercent
      };
    });
  }
}
