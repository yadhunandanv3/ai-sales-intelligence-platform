import { prisma } from '../../database/client.js';
import { logger } from '../../middleware/logger.js';

export class AuditService {
  /**
   * Write a permanent security audit record.
   * Runs asynchronously and catches failures to prevent core route interruptions.
   */
  async logEvent({
    organizationId,
    userId,
    action,
    targetTable,
    targetId,
    ipAddress,
    userAgent,
    metadata
  }) {
    try {
      const record = await prisma.auditLog.create({
        data: {
          organizationId: organizationId || null,
          userId: userId || null,
          action,
          targetTable: targetTable || null,
          targetId: targetId || null,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
          metadata: metadata || {}
        }
      });
      return record;
    } catch (error) {
      logger.error({ err: error, action }, 'Failed to record security audit log');
    }
  }
}

// Export single instance for global application reuse
export const auditService = new AuditService();
