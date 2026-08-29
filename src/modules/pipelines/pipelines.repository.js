import { prisma } from '../../database/client.js';

export class PipelinesRepository {
  /**
   * Create a new Sales Pipeline.
   */
  async createPipeline(organizationId, name, isDefault = false) {
    return prisma.pipeline.create({
      data: {
        organizationId,
        name,
        isDefault
      },
      include: {
        stages: true
      }
    });
  }

  /**
   * Find a pipeline by ID and Organization ID.
   */
  async findPipelineById(id, organizationId) {
    return prisma.pipeline.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null
      },
      include: {
        stages: {
          orderBy: { position: 'asc' }
        }
      }
    });
  }

  /**
   * List all pipelines with their stages.
   */
  async findPipelinesByOrg(organizationId) {
    return prisma.pipeline.findMany({
      where: {
        organizationId,
        deletedAt: null
      },
      include: {
        stages: {
          orderBy: { position: 'asc' }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  /**
   * Update a pipeline.
   */
  async updatePipeline(id, organizationId, updateData) {
    return prisma.pipeline.update({
      where: {
        id,
        organizationId
      },
      data: updateData,
      include: {
        stages: {
          orderBy: { position: 'asc' }
        }
      }
    });
  }

  /**
   * Delete a pipeline (soft delete or hard delete depending on config).
   * Since stages are Cascade Deleted, a hard delete of the pipeline automatically cleans up stages.
   */
  async deletePipeline(id, organizationId) {
    return prisma.pipeline.delete({
      where: {
        id,
        organizationId
      }
    });
  }

  /**
   * Add a stage to a pipeline.
   */
  async addStage(pipelineId, name) {
    // 1. Get the current maximum position of stages in this pipeline
    const maxPositionStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { position: 'desc' }
    });

    const nextPosition = maxPositionStage ? maxPositionStage.position + 1 : 0;

    // 2. Create stage
    return prisma.pipelineStage.create({
      data: {
        pipelineId,
        name,
        position: nextPosition
      }
    });
  }

  /**
   * Atomically reorder stages using sequential indexes in a transaction.
   * @param {string[]} stageIdsOrdered - Array of stage IDs in the desired order
   */
  async reorderStages(stageIdsOrdered) {
    return prisma.$transaction(
      stageIdsOrdered.map((stageId, index) =>
        prisma.pipelineStage.update({
          where: { id: stageId },
          data: { position: index }
        })
      )
    );
  }

  /**
   * Delete a specific pipeline stage.
   */
  async deleteStage(stageId) {
    return prisma.pipelineStage.delete({
      where: { id: stageId }
    });
  }

  /**
   * Verify if a stage belongs to a pipeline.
   */
  async findStageById(stageId) {
    return prisma.pipelineStage.findUnique({
      where: { id: stageId },
      include: {
        pipeline: true
      }
    });
  }
}
