import { prisma } from '../../database/client.js';
import { logger } from '../../middleware/logger.js';

export class IntegrationsService {
  /**
   * Connect or update a third-party integration configuration.
   */
  async connectIntegration(organizationId, { provider, config, isActive = true }) {
    return prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: provider.toUpperCase()
        }
      },
      update: {
        config,
        isActive
      },
      create: {
        organizationId,
        provider: provider.toUpperCase(),
        config,
        isActive
      }
    });
  }

  /**
   * Fetch active integrations configurations.
   */
  async getIntegrations(organizationId) {
    return prisma.integration.findMany({
      where: { organizationId }
    });
  }

  /**
   * Trigger a Slack Channel webhook notification when a deal is WON.
   */
  async triggerSlackWonDeal(organizationId, lead) {
    try {
      const integration = await prisma.integration.findUnique({
        where: {
          organizationId_provider: {
            organizationId,
            provider: 'SLACK'
          }
        }
      });

      if (!integration || !integration.isActive) {
        return; // Slack integration is disabled or not set up
      }

      const config = integration.config;
      const webhookUrl = config.webhookUrl;

      if (!webhookUrl) {
        logger.warn({ organizationId }, 'Slack Webhook URL is missing in integration configurations');
        return;
      }

      const formattedVal = lead.value 
        ? parseFloat(lead.value.toString()).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        : '$0.00';

      const alertMessage = `🎉 *Deal Won!* Lead: *${lead.name}* | Company: *${lead.company || 'Unknown'}* | Value: *${formattedVal}*`;

      const isMock = webhookUrl.includes('mock');

      if (isMock) {
        logger.info({ alertMessage, organizationId }, '[SLACK MOCK INTEGRATION] Webhook triggered');
        return { success: true, mock: true, message: alertMessage };
      } else {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text: alertMessage })
        });

        if (!response.ok) {
          const errText = await response.text();
          logger.error({ status: response.status, errText }, 'Slack webhook delivery failed');
          return { success: false, error: errText };
        }

        return { success: true, mock: false };
      }
    } catch (error) {
      logger.error({ err: error, leadId: lead.id }, 'Failed to trigger Slack integrations webhook');
      return { success: false, error: error.message };
    }
  }
}

// Export single instance for global application reuse
export const integrationsService = new IntegrationsService();
