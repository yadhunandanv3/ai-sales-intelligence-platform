import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import { authenticateUser } from '../src/middleware/auth.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';
import { errorHandler } from '../src/middleware/errors.js';
import app from '../src/app.js';

describe('Multi-Tenancy Isolation Integration Tests', () => {
  let tokenOrgA;
  let tokenOrgB;
  let orgAId;
  let orgBId;
  let testLeadOrgA;
  let testApp;

  const emailOrgA = 'admin@orga.com';
  const emailOrgB = 'admin@orgb.com';
  const subdomainOrgA = 'org-a-corp';
  const subdomainOrgB = 'org-b-corp';

  beforeAll(async () => {
    // 1. Clean up potential old test data
    await prisma.organizationMember.deleteMany({
      where: { user: { email: { in: [emailOrgA, emailOrgB] } } }
    });
    await prisma.user.deleteMany({
      where: { email: { in: [emailOrgA, emailOrgB] } }
    });
    await prisma.organization.deleteMany({
      where: { subdomain: { in: [subdomainOrgA, subdomainOrgB] } }
    });

    // 2. Register Tenant A
    const signupA = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailOrgA,
        password: 'password123',
        firstName: 'Alice',
        lastName: 'A',
        orgName: 'Organization A',
        subdomain: subdomainOrgA
      });
    tokenOrgA = signupA.body.data.tokens.accessToken;
    orgAId = signupA.body.data.organization.id;

    // 3. Register Tenant B
    const signupB = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailOrgB,
        password: 'password123',
        firstName: 'Bob',
        lastName: 'B',
        orgName: 'Organization B',
        subdomain: subdomainOrgB
      });
    tokenOrgB = signupB.body.data.tokens.accessToken;
    orgBId = signupB.body.data.organization.id;

    // 4. Create a dummy Lead in Tenant A's database space directly
    testLeadOrgA = await prisma.lead.create({
      data: {
        organizationId: orgAId,
        name: 'High Value Deal Org A',
        status: 'NEW',
        value: 50000.00
      }
    });

    // 5. Create a dedicated test express app for middleware verification
    // This guarantees the custom errorHandler runs AFTER the test endpoint.
    testApp = express();
    testApp.use(express.json());
    
    testApp.get('/api/test-leads/:id', authenticateUser, async (req, res, next) => {
      try {
        const leadId = req.params.id;
        const tenantId = req.user.organizationId; // Sourced securely from JWT

        // Scoped query: verifies that the lead belongs to this organization
        const lead = await prisma.lead.findFirst({
          where: {
            id: leadId,
            organizationId: tenantId // Tenant Isolation enforced!
          }
        });

        if (!lead) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Lead not found in this organization' }
          });
        }

        res.status(200).json({ success: true, data: lead });
      } catch (error) {
        next(error);
      }
    });

    testApp.use(errorHandler);
  });

  afterAll(async () => {
    // Cleanup database records
    await prisma.lead.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } }
    });
    await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: [orgAId, orgBId] } }
    });
    await prisma.user.deleteMany({
      where: { email: { in: [emailOrgA, emailOrgB] } }
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgAId, orgBId] } }
    });

    await prisma.$disconnect();
    await redis.quit();
  });

  it('should successfully retrieve Lead when Org A user requests Org A Lead', async () => {
    const res = await request(testApp)
      .get(`/api/test-leads/${testLeadOrgA.id}`)
      .set('Authorization', `Bearer ${tokenOrgA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('High Value Deal Org A');
  });

  it('should return 404 Not Found (IDOR Blocked) when Org B user requests Org A Lead', async () => {
    const res = await request(testApp)
      .get(`/api/test-leads/${testLeadOrgA.id}`)
      .set('Authorization', `Bearer ${tokenOrgB}`); // Authenticated as Org B

    // Org B user must not be able to fetch Org A's lead, even if they know the UUID.
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Lead not found in this organization');
  });

  it('should reject request with 401 when no token is provided', async () => {
    const res = await request(testApp)
      .get(`/api/test-leads/${testLeadOrgA.id}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('should reject request with 401 when an invalid/tampered token is provided', async () => {
    const tamperedToken = tokenOrgA + 'tamper';
    const res = await request(testApp)
      .get(`/api/test-leads/${testLeadOrgA.id}`)
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });
});
