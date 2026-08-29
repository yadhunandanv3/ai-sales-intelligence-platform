import env from '../../config/env.js';
import { prisma } from '../../database/client.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { logger } from '../../middleware/logger.js';

export class AIService {
  /**
   * Intelligently score a lead using OpenAI GPT or a mock analytical fallback.
   */
  async scoreLead(leadId, organizationId, userId) {
    // 1. Fetch lead details with contextual notes and activities
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId,
        deletedAt: null
      },
      include: {
        notes: { take: 5, orderBy: { createdAt: 'desc' } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!lead) {
      throw new NotFoundError('Lead not found in this organization');
    }

    // 2. Format details into a text context for the prompt
    const notesContext = lead.notes.map(n => `- Note: ${n.content}`).join('\n');
    const activitiesContext = lead.activities
      .map(a => `- Activity: ${a.type} | Content: ${JSON.stringify(a.content)}`)
      .join('\n');

    const leadContext = `
LEAD PROFILE:
- Name: ${lead.name}
- Company: ${lead.company || 'Unknown'}
- Job Title: ${lead.jobTitle || 'Unknown'}
- Value: $${lead.value ? lead.value.toString() : '0.00'}
- Source: ${lead.source || 'Unknown'}
- Status: ${lead.status}
- Tags: ${lead.tags.join(', ') || 'None'}

RECENT NOTES:
${notesContext || 'No notes logged.'}

RECENT TOUCHPOINTS & ACTIVITIES:
${activitiesContext || 'No activities logged.'}
    `;

    const systemPrompt = `You are an expert sales intelligence assistant. Analyze the provided lead details, including interaction history and notes. Evaluate their likelihood to purchase and return a structured JSON response.

The JSON MUST contain:
1. "score" (integer between 1 and 100, where 100 represents a definite deal conversion and 0 represents zero interest).
2. "reasoning" (a string summarizing your key assessment, maximum 150 characters).

Return ONLY the raw JSON object, no Markdown wrappers.`;

    let score = 0;
    let reasoning = '';
    let tokensUsed = 0;

    // 3. Dispatch to OpenAI or evaluate the intelligent mock engine
    const isMock = env.OPENAI_API_KEY === 'mock-openai-key-for-development';

    if (isMock) {
      // --- INTELLIGENT MOCK AI ENGINE ---
      logger.info({ leadId }, 'AI lead scoring operating in mock development mode');
      
      let mockScore = 50; // Neutral baseline

      // Check monetary value
      const val = lead.value ? parseFloat(lead.value.toString()) : 0;
      if (val > 10000) mockScore += 20;
      else if (val > 5000) mockScore += 10;

      // Check job title seniority
      const title = (lead.jobTitle || '').toUpperCase();
      if (title.includes('VP') || title.includes('DIRECTOR') || title.includes('CHIEF') || title.includes('CEO') || title.includes('CTO')) {
        mockScore += 20;
      } else if (title.includes('MANAGER') || title.includes('HEAD')) {
        mockScore += 10;
      }

      // Check lead source conversion probability
      const source = (lead.source || '').toUpperCase();
      if (source === 'REFERRAL') mockScore += 15;
      else if (source === 'INBOUND' || source === 'WEBSITE') mockScore += 5;

      // Check status limits
      if (lead.status === 'WON') mockScore = 100;
      if (lead.status === 'LOST') mockScore = 0;

      // Clamp score
      score = Math.min(100, Math.max(0, mockScore));
      reasoning = `Mock AI analysis: ${lead.jobTitle || 'Lead'} at ${lead.company || 'Company'} shows strong indicators with a estimated value of $${val}.`;
      tokensUsed = 120;
    } else {
      // --- ACTUAL OPENAI CLIENT INTEGRATION ---
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: leadContext }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI API returned status ${response.status}: ${errText}`);
        }

        const result = await response.json();
        const content = JSON.parse(result.choices[0].message.content);

        score = parseInt(content.score, 10) || 0;
        reasoning = content.reasoning || '';
        tokensUsed = result.usage?.total_tokens || 0;
      } catch (error) {
        logger.error({ err: error, leadId }, 'OpenAI lead scoring API call failed');
        throw new Error('AI scoring is temporarily unavailable. Please try again later.');
      }
    }

    // 4. Atomically save the score to the Lead and log the AIInteraction
    await prisma.$transaction([
      // Update Lead score
      prisma.lead.update({
        where: { id: leadId },
        data: { score }
      }),
      // Log AI Interaction audit record
      prisma.aIInteraction.create({
        data: {
          organizationId,
          userId,
          leadId,
          prompt: `System: ${systemPrompt}\nUser: ${leadContext}`,
          response: { score, reasoning },
          tokensUsed
        }
      })
    ]);

    return { score, reasoning };
  }

  /**
   * Generate an executive summary and key takeaways for a lead.
   */
  async generateLeadSummary(leadId, organizationId, userId) {
    // 1. Fetch lead details with contextual notes and activities
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId,
        deletedAt: null
      },
      include: {
        notes: { take: 10, orderBy: { createdAt: 'desc' } },
        activities: { take: 15, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!lead) {
      throw new NotFoundError('Lead not found in this organization');
    }

    // 2. Format details into text context
    const notesContext = lead.notes.map(n => `- Note: ${n.content}`).join('\n');
    const activitiesContext = lead.activities
      .map(a => `- Activity: ${a.type} | Content: ${JSON.stringify(a.content)}`)
      .join('\n');

    const leadContext = `
LEAD PROFILE:
- Name: ${lead.name}
- Company: ${lead.company || 'Unknown'}
- Job Title: ${lead.jobTitle || 'Unknown'}
- Value: $${lead.value ? lead.value.toString() : '0.00'}
- Source: ${lead.source || 'Unknown'}
- Status: ${lead.status}
- Tags: ${lead.tags.join(', ') || 'None'}

RECENT NOTES:
${notesContext || 'No notes logged.'}

RECENT TOUCHPOINTS & ACTIVITIES:
${activitiesContext || 'No activities logged.'}
    `;

    const systemPrompt = `You are an expert sales intelligence assistant. Analyze the provided lead details, touchpoint logs, and note history. Synthesize them into an executive summary and key takeaways for the sales representative.

The JSON response MUST contain:
1. "summary" (a concise paragraph explaining who the lead is, their main intent, and current standing, maximum 300 characters).
2. "keyPoints" (an array of 3-5 strings detailing actionable insights, e.g. "Pricing discussed", "CEO is decision maker").

Return ONLY the raw JSON object, no Markdown wrappers.`;

    let summary = '';
    let keyPoints = [];
    let tokensUsed = 0;

    const isMock = env.OPENAI_API_KEY === 'mock-openai-key-for-development';

    if (isMock) {
      logger.info({ leadId }, 'AI lead summarization operating in mock development mode');
      
      summary = `${lead.name} is a prospect at ${lead.company || 'Unknown Company'} working as ${lead.jobTitle || 'Unknown Role'}. The lead was acquired via ${lead.source || 'Unknown Channel'} with an estimated deal value of $${lead.value ? lead.value.toString() : '0.00'}. Currently in ${lead.status} status.`;
      
      keyPoints = [
        `Acquired via: ${lead.source || 'Unknown'}`,
        `Deal Status: ${lead.status}`,
        `Associated value: $${lead.value ? lead.value.toString() : '0.00'}`,
        `Notes count: ${lead.notes.length}`,
        `Activities logged: ${lead.activities.length}`
      ];
      tokensUsed = 150;
    } else {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: leadContext }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI API returned status ${response.status}: ${errText}`);
        }

        const result = await response.json();
        const content = JSON.parse(result.choices[0].message.content);

        summary = content.summary || '';
        keyPoints = content.keyPoints || [];
        tokensUsed = result.usage?.total_tokens || 0;
      } catch (error) {
        logger.error({ err: error, leadId }, 'OpenAI lead summarization API call failed');
        throw new Error('AI summarization is temporarily unavailable. Please try again later.');
      }
    }

    // Save interaction log to AIInteraction
    await prisma.aIInteraction.create({
      data: {
        organizationId,
        userId,
        leadId,
        prompt: `System: ${systemPrompt}\nUser: ${leadContext}`,
        response: { summary, keyPoints },
        tokensUsed
      }
    });

    return { summary, keyPoints };
  }

  /**
   * Generate a follow-up email draft based on lead context and custom tone/instructions.
   */
  async generateFollowUp(leadId, organizationId, userId, { tone = 'PROFESSIONAL', customInstructions }) {
    // 1. Fetch lead details with contextual notes and activities
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        organizationId,
        deletedAt: null
      },
      include: {
        notes: { take: 5, orderBy: { createdAt: 'desc' } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!lead) {
      throw new NotFoundError('Lead not found in this organization');
    }

    // 2. Format details into text context
    const notesContext = lead.notes.map(n => `- Note: ${n.content}`).join('\n');
    const activitiesContext = lead.activities
      .map(a => `- Activity: ${a.type} | Content: ${JSON.stringify(a.content)}`)
      .join('\n');

    const leadContext = `
LEAD PROFILE:
- Name: ${lead.name}
- Company: ${lead.company || 'Unknown'}
- Job Title: ${lead.jobTitle || 'Unknown'}
- Value: $${lead.value ? lead.value.toString() : '0.00'}
- Source: ${lead.source || 'Unknown'}
- Status: ${lead.status}
- Tags: ${lead.tags.join(', ') || 'None'}

RECENT NOTES:
${notesContext || 'No notes logged.'}

RECENT TOUCHPOINTS & ACTIVITIES:
${activitiesContext || 'No activities logged.'}

USER CUSTOMIZATION PARAMETERS:
- Tone Profile: ${tone}
- Special Instructions: ${customInstructions || 'None'}
    `;

    const systemPrompt = `You are an expert sales assistant. Draft a personalized follow-up email to the lead based on their profile, interaction history, and notes.

Adjust your writing according to these parameters:
- Tone: ${tone} (e.g. PROFESSIONAL, CASUAL, URGENT)
- Special Instructions: ${customInstructions || 'None'}

The JSON response MUST contain:
1. "subject" (a compelling, context-aware email subject line).
2. "body" (the complete, polished email body draft, using placeholders like "[My Name]" or "[My Company]" if signing off).

Return ONLY the raw JSON object, no Markdown wrappers.`;

    let subject = '';
    let body = '';
    let tokensUsed = 0;

    const isMock = env.OPENAI_API_KEY === 'mock-openai-key-for-development';

    if (isMock) {
      logger.info({ leadId, tone }, 'AI email follow-up operating in mock development mode');
      
      const promptAddon = customInstructions ? `\n\nNote: Regarding your request: "${customInstructions}".` : '';

      if (tone === 'CASUAL') {
        subject = `Quick follow up - ${lead.name}`;
        body = `Hey ${lead.name},\n\nJust wanted to reach out and see if you had any thoughts on our discussion. Let me know if you want to chat!${promptAddon}\n\nBest,\n[My Name]`;
      } else if (tone === 'URGENT') {
        subject = `Urgent next steps: ${lead.company || 'Our discussion'}`;
        body = `Hi ${lead.name},\n\nI wanted to follow up on this deal as we are finalizing details this week. Please let me know your availability today.${promptAddon}\n\nBest regards,\n[My Name]`;
      } else {
        // PROFESSIONAL
        subject = `Follow up: Sales Intel Platform discussion`;
        body = `Dear ${lead.name},\n\nI trust you are having a productive week. I am following up on our recent meeting regarding the sales intelligence proposal. Please let me know when you would be available for a brief call to discuss our next steps.${promptAddon}\n\nSincerely,\n[My Name]`;
      }
      tokensUsed = 180;
    } else {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: leadContext }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`OpenAI API returned status ${response.status}: ${errText}`);
        }

        const result = await response.json();
        const content = JSON.parse(result.choices[0].message.content);

        subject = content.subject || '';
        body = content.body || '';
        tokensUsed = result.usage?.total_tokens || 0;
      } catch (error) {
        logger.error({ err: error, leadId }, 'OpenAI lead follow-up generation failed');
        throw new Error('AI follow-up draft generation is temporarily unavailable. Please try again later.');
      }
    }

    // Save interaction log to AIInteraction
    await prisma.aIInteraction.create({
      data: {
        organizationId,
        userId,
        leadId,
        prompt: `System: ${systemPrompt}\nUser: ${leadContext}`,
        response: { subject, body },
        tokensUsed
      }
    });

    return { subject, body };
  }
}
