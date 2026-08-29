import { z } from 'zod';
import { ActivitiesRepository } from './activities.repository.js';
import { LeadsService } from '../leads/leads.service.js';
import { ValidationError } from '../../common/errors.js';

const activitiesRepository = new ActivitiesRepository();
const leadsService = new LeadsService();

// --- Zod Meta Schemas per Activity Type ---

const schemas = {
  CALL: z.object({
    durationSeconds: z.number().int().nonnegative('Duration must be a positive integer'),
    outcome: z.string().min(1, 'Outcome details are required'),
    notes: z.string().optional()
  }),
  EMAIL: z.object({
    subject: z.string().min(1, 'Email subject is required'),
    body: z.string().optional()
  }),
  MEETING: z.object({
    title: z.string().min(1, 'Meeting title is required'),
    scheduledAt: z.string().datetime('Scheduled date must be a valid ISO datetime'),
    notes: z.string().optional()
  }),
  NOTE: z.object({
    body: z.string().min(1, 'Note content cannot be empty')
  }),
  STATUS_CHANGE: z.object({
    oldStatus: z.string().min(1),
    newStatus: z.string().min(1)
  }),
  ASSIGNMENT: z.object({
    oldAssignedUserId: z.string().uuid().optional().nullable(),
    newAssignedUserId: z.string().uuid().optional().nullable()
  })
};

export class ActivitiesService {
  /**
   * Log an activity on a lead.
   */
  async logActivity({ organizationId, leadId, userId, type, content }) {
    // 1. Confirm lead existence and tenant boundary
    await leadsService.getLeadById(leadId, organizationId);

    // 2. Validate activity type is supported
    const schema = schemas[type];
    if (!schema) {
      throw new ValidationError(`Unsupported activity type: ${type}`);
    }

    // 3. Validate content matches the schema requirements of the type
    let validatedContent;
    try {
      validatedContent = schema.parse(content);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid activity metadata properties', error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        })));
      }
      throw error;
    }

    // 4. Create record
    return activitiesRepository.createActivity({
      organizationId,
      leadId,
      userId,
      type,
      content: validatedContent
    });
  }

  /**
   * Fetch timeline of activities for a lead.
   */
  async getLeadTimeline(leadId, organizationId) {
    // Confirm lead ownership
    await leadsService.getLeadById(leadId, organizationId);
    return activitiesRepository.findActivitiesByLead(leadId, organizationId);
  }
}
