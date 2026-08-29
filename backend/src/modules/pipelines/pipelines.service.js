import { PipelinesRepository } from './pipelines.repository.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';

const pipelinesRepository = new PipelinesRepository();

export class PipelinesService {
  /**
   * Create a new pipeline.
   */
  async createPipeline(organizationId, name) {
    return pipelinesRepository.createPipeline(organizationId, name);
  }

  /**
   * List all pipelines with stages.
   */
  async listPipelines(organizationId) {
    return pipelinesRepository.findPipelinesByOrg(organizationId);
  }

  /**
   * Fetch a single pipeline by ID and Organization ID.
   */
  async getPipeline(id, organizationId) {
    const pipeline = await pipelinesRepository.findPipelineById(id, organizationId);
    if (!pipeline) {
      throw new NotFoundError('Pipeline not found in this organization');
    }
    return pipeline;
  }

  /**
   * Update a pipeline name.
   */
  async updatePipeline(id, organizationId, updateData) {
    await this.getPipeline(id, organizationId);
    return pipelinesRepository.updatePipeline(id, organizationId, updateData);
  }

  /**
   * Delete a pipeline (and cascade its stages).
   */
  async deletePipeline(id, organizationId) {
    await this.getPipeline(id, organizationId);
    await pipelinesRepository.deletePipeline(id, organizationId);
    return { success: true, message: 'Pipeline deleted successfully' };
  }

  /**
   * Add a stage to a pipeline.
   */
  async addStage(pipelineId, organizationId, name) {
    // Verify pipeline ownership
    await this.getPipeline(pipelineId, organizationId);
    return pipelinesRepository.addStage(pipelineId, name);
  }

  /**
   * Reorder stages within a pipeline.
   */
  async reorderStages(pipelineId, organizationId, stageIdsOrdered) {
    // 1. Fetch pipeline and verify ownership
    const pipeline = await this.getPipeline(pipelineId, organizationId);

    // 2. Validate that the list matches all active stages in this pipeline
    const existingStageIds = pipeline.stages.map(s => s.id);

    if (stageIdsOrdered.length !== existingStageIds.length) {
      throw new ValidationError('Mismatch in number of stages to reorder');
    }

    const allMatch = stageIdsOrdered.every(id => existingStageIds.includes(id));
    if (!allMatch) {
      throw new ValidationError('Invalid stage IDs provided for reordering');
    }

    // 3. Atomically update positions
    await pipelinesRepository.reorderStages(stageIdsOrdered);

    // 4. Return updated pipeline
    return this.getPipeline(pipelineId, organizationId);
  }

  /**
   * Delete a pipeline stage.
   */
  async deleteStage(pipelineId, stageId, organizationId) {
    // 1. Verify pipeline ownership
    const pipeline = await this.getPipeline(pipelineId, organizationId);

    // 2. Verify stage belongs to this pipeline
    const stage = pipeline.stages.find(s => s.id === stageId);
    if (!stage) {
      throw new NotFoundError('Stage not found in this pipeline');
    }

    // 3. Delete stage
    await pipelinesRepository.deleteStage(stageId);

    // 4. Reorder remaining stages sequentially to close the gap
    const remainingStageIds = pipeline.stages
      .filter(s => s.id !== stageId)
      .map(s => s.id);

    if (remainingStageIds.length > 0) {
      await pipelinesRepository.reorderStages(remainingStageIds);
    }

    return { success: true, message: 'Pipeline stage deleted successfully' };
  }
}
