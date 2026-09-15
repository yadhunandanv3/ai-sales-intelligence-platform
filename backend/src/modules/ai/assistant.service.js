import env from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { ValidationError, NotFoundError } from '../../common/errors.js';
import { logger } from '../../middleware/logger.js';

export class AIAssistantService {
  /**
   * Helper: Create a lead with tenant boundaries validated.
   */
  async executeCreateLead(orgId, userId, args) {
    // Deduplication check: if lead with same name & company already exists, update and reuse it
    const existing = await prisma.lead.findFirst({
      where: {
        organizationId: orgId,
        deletedAt: null,
        name: { equals: args.name.trim(), mode: 'insensitive' },
        ...(args.company ? { company: { equals: args.company.trim(), mode: 'insensitive' } } : {})
      }
    });

    if (existing) {
      const updated = await prisma.lead.update({
        where: { id: existing.id },
        data: {
          ...(args.value ? { value: parseFloat(args.value) } : {}),
          ...(args.email ? { email: args.email } : {})
        }
      });
      return {
        success: true,
        leadId: updated.id,
        message: `Lead "${updated.name}" already exists in your pipeline. Updated existing lead details (ID: ${updated.id}).`
      };
    }

    const lead = await prisma.lead.create({
      data: {
        organizationId: orgId,
        assignedUserId: userId,
        name: args.name,
        company: args.company || null,
        email: args.email || null,
        value: args.value ? parseFloat(args.value) : null,
        source: args.source || 'AI_ASSISTANT',
        status: 'NEW'
      }
    });
    return { success: true, leadId: lead.id, message: `Successfully created lead "${lead.name}" (ID: ${lead.id}).` };
  }

  /**
   * Helper: Update lead status checking ownership.
   */
  async executeUpdateLeadStatus(orgId, leadId, status) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: orgId, deletedAt: null }
    });
    if (!lead) {
      throw new NotFoundError(`Lead ${leadId} not found in this organization`);
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: { status }
    });
    return { success: true, message: `Successfully updated lead "${updatedLead.name}" status to ${status}.` };
  }

  /**
   * Helper: Create a task associated with a lead.
   */
  async executeCreateTask(orgId, userId, leadId, args) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: orgId, deletedAt: null }
    });
    if (!lead) {
      throw new NotFoundError(`Lead ${leadId} not found in this organization`);
    }

    const task = await prisma.task.create({
      data: {
        organizationId: orgId,
        leadId,
        assignedUserId: userId,
        title: args.title,
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        priority: args.priority || 'MEDIUM',
        status: 'TODO'
      }
    });
    return { success: true, taskId: task.id, message: `Successfully created task "${task.title}" under lead "${lead.name}".` };
  }

  /**
   * Helper: Add note context to a lead.
   */
  async executeAddNote(orgId, userId, leadId, content) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: orgId, deletedAt: null }
    });
    if (!lead) {
      throw new NotFoundError(`Lead ${leadId} not found in this organization`);
    }

    const note = await prisma.note.create({
      data: {
        organizationId: orgId,
        leadId,
        userId,
        content
      }
    });
    return { success: true, noteId: note.id, message: `Successfully added note to lead "${lead.name}".` };
  }

  /**
   * Central processor for conversation assistant.
   */
  async processConversation(message, organizationId, userId) {
    const isMock = env.OPENAI_API_KEY === 'mock-openai-key-for-development';
    const logs = [];

    if (isMock) {
      // --- INTELLIGENT RULE-BASED MOCK AGENT ---
      logger.info({ message }, 'Conversational assistant running in mock development mode');

      let currentLeadId = null;
      const lowerMessage = message.toLowerCase();

      // Scenario 1: User requests Lead Creation
      if (/create\s+(?:a\s+)?lead|add\s+(?:a\s+)?lead|new\s+lead/i.test(message)) {
        // Extract name
        let name = 'New AI Prospect';
        const nameMatch = message.match(/(?:named|for)\s+([A-Za-z\s]+?)(?:\s+from|\s+value|\s+email|\s+and|$)/i);
        if (nameMatch) name = nameMatch[1].trim();

        // Extract company
        let company = 'Acme Corp';
        const companyMatch = message.match(/from\s+([A-Za-z0-9\s]+?)(?:\s+value|\s+email|\s+and|$)/i);
        if (companyMatch) company = companyMatch[1].trim();

        // Extract value
        let value = 5000;
        const valueMatch = message.match(/value\s+[\$]?([0-9\.]+)/i);
        if (valueMatch) value = parseFloat(valueMatch[1]);

        // Execute Lead Creation
        const leadRes = await this.executeCreateLead(organizationId, userId, { name, company, value });
        currentLeadId = leadRes.leadId;
        logs.push(leadRes.message);
      }

      // Scenario 2: User requests Task Creation
      if (/create\s+(?:a\s+)?task|add\s+(?:a\s+)?task|schedule\s+(?:a\s+)?task/i.test(message)) {
        // Determine Lead ID (either the newly created one, or search for a lead UUID in the prompt)
        let targetLeadId = currentLeadId;
        const uuidMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) targetLeadId = uuidMatch[0];

        if (!targetLeadId) {
          // If no lead UUID exists, try to find a lead by name mentioned in prompt
          const nameMatch = message.match(/(?:for|under|to)\s+([A-Za-z\s]+?)(?:\s+and|$)/i);
          if (nameMatch) {
            const matchedLead = await prisma.lead.findFirst({
              where: { organizationId, name: { contains: nameMatch[1].trim(), mode: 'insensitive' }, deletedAt: null }
            });
            if (matchedLead) targetLeadId = matchedLead.id;
          }
        }

        if (!targetLeadId) {
          // Fallback to the latest active lead in this organization
          const fallbackLead = await prisma.lead.findFirst({
            where: { organizationId, deletedAt: null },
            orderBy: { createdAt: 'desc' }
          });
          if (fallbackLead) targetLeadId = fallbackLead.id;
        }

        if (targetLeadId) {
          let title = 'AI Scheduled Follow-up';
          const titleMatch = message.match(/task\s+(?:to\s+)?([A-Za-z\s]+?)(?:\s+for|\s+and|$)/i);
          if (titleMatch) title = titleMatch[1].trim();

          const taskRes = await this.executeCreateTask(organizationId, userId, targetLeadId, {
            title,
            priority: 'HIGH'
          });
          logs.push(taskRes.message);
        } else {
          logs.push('Skip task scheduling: No associated lead found.');
        }
      }

      // Scenario 3: Update Lead Status
      if (/update\s+(?:the\s+)?status|change\s+(?:the\s+)?status|update\s+([A-Za-z\s]+)\s+status/i.test(message)) {
        let status = 'QUALIFIED';
        if (lowerMessage.includes('won')) status = 'WON';
        if (lowerMessage.includes('lost')) status = 'LOST';
        if (lowerMessage.includes('contacted')) status = 'CONTACTED';

        let targetLeadId = currentLeadId;
        const uuidMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
          targetLeadId = uuidMatch[0];
        } else {
          // Try to find by lead name mentioned in prompt (e.g. "Update Bruce Wayne status to WON" or "Update status of Bruce Wayne to WON")
          const nameMatch = message.match(/(?:update\s+status\s+of|update)\s+([A-Za-z\s]+?)(?:\s+status|\s+to|$)/i);
          if (nameMatch && nameMatch[1].trim().toLowerCase() !== 'status') {
            const matchedLead = await prisma.lead.findFirst({
              where: { organizationId, name: { contains: nameMatch[1].trim(), mode: 'insensitive' }, deletedAt: null }
            });
            if (matchedLead) targetLeadId = matchedLead.id;
          }
        }

        if (targetLeadId) {
          const statusRes = await this.executeUpdateLeadStatus(organizationId, targetLeadId, status);
          logs.push(statusRes.message);
        } else {
          logs.push('Skip status update: No matching lead found.');
        }
      }

      // Scenario 4: Add Note
      if (/add\s+(?:a\s+)?note|log\s+(?:a\s+)?note/i.test(message)) {
        let targetLeadId = currentLeadId;
        const uuidMatch = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) targetLeadId = uuidMatch[0];

        let content = 'Default note context added by Assistant';
        const noteMatch = message.match(/note\s+[:"']?([^"']+)["']?/i);
        if (noteMatch) content = noteMatch[1].trim();

        if (targetLeadId) {
          const noteRes = await this.executeAddNote(organizationId, userId, targetLeadId, content);
          logs.push(noteRes.message);
        } else {
          logs.push('Skip note creation: No matching lead found.');
        }
      }

      const finalResponse = logs.length > 0
        ? `Sales Assistant completed operations successfully:\n${logs.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
        : 'I understood your query, but could not identify a valid command parameters. Try commands like: "Create lead named John from Acme Corp", "Update status of [uuid] to WON", "Add note to [uuid]"';

      // Log to AIInteraction
      await prisma.aIInteraction.create({
        data: {
          organizationId,
          userId,
          prompt: `User: ${message}`,
          response: { responseText: finalResponse, logs },
          tokensUsed: 80
        }
      });

      return { responseText: finalResponse, logs };
    } else {
      // --- ACTUAL OPENAI TOOL CALLING IMPLEMENTATION ---
      const tools = [
        {
          type: 'function',
          function: {
            name: 'createLead',
            description: 'Create a new CRM sales lead.',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Name of the contact prospect' },
                company: { type: 'string', description: 'Company name' },
                email: { type: 'string', description: 'Email address' },
                value: { type: 'number', description: 'Monetary deal value estimate' },
                source: { type: 'string', description: 'Acquisition channel source' }
              },
              required: ['name']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'updateLeadStatus',
            description: "Update an existing lead's status.",
            parameters: {
              type: 'object',
              properties: {
                leadId: { type: 'string', description: 'UUID of the target lead' },
                status: { type: 'string', enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'WON'] }
              },
              required: ['leadId', 'status']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'createTask',
            description: 'Schedule a follow-up task/reminder for a lead.',
            parameters: {
              type: 'object',
              properties: {
                leadId: { type: 'string', description: 'UUID of the target lead' },
                title: { type: 'string', description: 'Task title details' },
                dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
                priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }
              },
              required: ['leadId', 'title']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'addNote',
            description: 'Add a rich text note context to a lead.',
            parameters: {
              type: 'object',
              properties: {
                leadId: { type: 'string', description: 'UUID of the target lead' },
                content: { type: 'string', description: 'Text note contents' }
              },
              required: ['leadId', 'content']
            }
          }
        }
      ];

      try {
        // First LLM call: Determine tool calls
        let response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: message }],
            tools,
            tool_choice: 'auto'
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI API returned status ${response.status}: ${errText}`);
        }

        let result = await response.json();
        const responseMessage = result.choices[0].message;
        const toolCalls = responseMessage.tool_calls;

        if (!toolCalls) {
          // LLM didn't choose to execute any tools, return text reply
          const textReply = responseMessage.content;
          return { responseText: textReply, logs: [] };
        }

        const toolMessages = [];
        // Process each tool call sequentially
        for (const toolCall of toolCalls) {
          const name = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          let toolOutcome;

          try {
            if (name === 'createLead') {
              toolOutcome = await this.executeCreateLead(organizationId, userId, args);
            } else if (name === 'updateLeadStatus') {
              toolOutcome = await this.executeUpdateLeadStatus(organizationId, args.leadId, args.status);
            } else if (name === 'createTask') {
              toolOutcome = await this.executeCreateTask(organizationId, userId, args.leadId, args);
            } else if (name === 'addNote') {
              toolOutcome = await this.executeAddNote(organizationId, userId, args.leadId, args.content);
            }
            logs.push(toolOutcome.message);
          } catch (toolError) {
            logs.push(`Error executing ${name}: ${toolError.message}`);
            toolOutcome = { success: false, error: toolError.message };
          }

          toolMessages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name,
            content: JSON.stringify(toolOutcome)
          });
        }

        // Second LLM call: Generate natural conversational summary
        const messages = [
          { role: 'user', content: message },
          responseMessage,
          ...toolMessages
        ];

        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages
          })
        });

        result = await response.json();
        const finalResponse = result.choices[0].message.content;

        // Log AI Interaction audit record
        await prisma.aIInteraction.create({
          data: {
            organizationId,
            userId,
            prompt: `User query: ${message}`,
            response: { responseText: finalResponse, logs },
            tokensUsed: result.usage?.total_tokens || 200
          }
        });

        return { responseText: finalResponse, logs };
      } catch (error) {
        logger.error({ err: error }, 'OpenAI Assistant tool call processing failed');
        throw new Error('AI Assistant is temporarily unavailable. Please try again later.');
      }
    }
  }
}
