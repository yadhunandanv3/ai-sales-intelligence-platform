import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Sales Pipelines & Stages Integration Tests', () => {
  let tokenAdmin;
  let tokenRep;
  let orgId;

  const emailAdmin = 'admin-pipelines@example.com';
  const emailRep = 'rep-pipelines@example.com';
  const subdomain = 'pipeline-test-org';

  const cleanup = async () => {
    // Delete stages and pipelines first (cascades are set up in db, but manual delete is safe)
    await prisma.pipelineStage.deleteMany({
      where: {
        pipeline: { organization: { subdomain } }
      }
    });

    await prisma.pipeline.deleteMany({
      where: { organization: { subdomain } }
    });

    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: { in: [emailAdmin, emailRep] } }
      }
    });

    await prisma.user.deleteMany({
      where: { email: { in: [emailAdmin, emailRep] } }
    });

    await prisma.organization.deleteMany({
      where: { subdomain }
    });
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Signup admin
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailAdmin,
        password: 'securePassword123',
        firstName: 'PipelineAdmin',
        lastName: 'User',
        orgName: 'Pipeline Corp',
        subdomain
      });
    tokenAdmin = signupRes.body.data.tokens.accessToken;
    orgId = signupRes.body.data.organization.id;

    // 2. Create Rep user
    const saltRounds = 10;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('securePassword123', saltRounds);

    const repUser = await prisma.user.create({
      data: {
        email: emailRep,
        passwordHash,
        firstName: 'PipelineRep',
        lastName: 'User',
        isVerified: true
      }
    });

    const roleRep = await prisma.role.findUnique({ where: { name: 'SALES_REP' } });
    await prisma.organizationMember.create({
      data: {
        userId: repUser.id,
        organizationId: orgId,
        roleId: roleRep.id
      }
    });

    // Login Rep to get token
    const loginRepRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: emailRep,
        password: 'securePassword123'
      });
    tokenRep = loginRepRes.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    await prisma.pipelineStage.deleteMany({
      where: { pipeline: { organizationId: orgId } }
    });
    await prisma.pipeline.deleteMany({
      where: { organizationId: orgId }
    });
  });

  describe('Pipeline CRUD operations', () => {
    it('should successfully create, fetch, and update a pipeline', async () => {
      // 1. Create
      const createRes = await request(app)
        .post('/api/pipelines')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: 'Enterprise Sales' });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      expect(createRes.body.data.name).toBe('Enterprise Sales');

      const pipelineId = createRes.body.data.id;

      // 2. Fetch Single
      const fetchRes = await request(app)
        .get(`/api/pipelines/${pipelineId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.data.name).toBe('Enterprise Sales');

      // 3. Update
      const updateRes = await request(app)
        .patch(`/api/pipelines/${pipelineId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: 'Enterprise Sales V2' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Enterprise Sales V2');
    });

    it('should forbid pipeline creation/updates for lower-privileged users', async () => {
      const createRes = await request(app)
        .post('/api/pipelines')
        .set('Authorization', `Bearer ${tokenRep}`) // SALES_REP lacks organization:manage
        .send({ name: 'Enterprise Sales' });

      expect(createRes.status).toBe(403);
    });
  });

  describe('Pipeline Stage operations', () => {
    let pipeline;

    beforeEach(async () => {
      pipeline = await prisma.pipeline.create({
        data: {
          organizationId: orgId,
          name: 'Primary Pipeline'
        }
      });
    });

    it('should successfully add multiple stages and sort them sequentially', async () => {
      const s1 = await request(app)
        .post(`/api/pipelines/${pipeline.id}/stages`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: 'Lead Generated' });

      const s2 = await request(app)
        .post(`/api/pipelines/${pipeline.id}/stages`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ name: 'Contacted' });

      expect(s1.status).toBe(201);
      expect(s1.body.data.position).toBe(0);
      expect(s2.body.data.position).toBe(1);

      // Verify db sorting
      const fetchRes = await request(app)
        .get(`/api/pipelines/${pipeline.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(fetchRes.body.data.stages).toHaveLength(2);
      expect(fetchRes.body.data.stages[0].name).toBe('Lead Generated');
      expect(fetchRes.body.data.stages[1].name).toBe('Contacted');
    });

    it('should support reordering stages atomically', async () => {
      // 1. Create stages (0, 1, 2)
      const stageA = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage A', position: 0 } });
      const stageB = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage B', position: 1 } });
      const stageC = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage C', position: 2 } });

      // 2. Send reorder request: C -> B -> A
      const reorderRes = await request(app)
        .patch(`/api/pipelines/${pipeline.id}/stages/reorder`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          stageIds: [stageC.id, stageB.id, stageA.id]
        });

      expect(reorderRes.status).toBe(200);
      
      const stages = reorderRes.body.data.stages;
      expect(stages).toHaveLength(3);
      expect(stages[0].id).toBe(stageC.id);
      expect(stages[0].position).toBe(0);
      expect(stages[1].id).toBe(stageB.id);
      expect(stages[1].position).toBe(1);
      expect(stages[2].id).toBe(stageA.id);
      expect(stages[2].position).toBe(2);
    });

    it('should reject reordering when list has missing or tampered stage IDs', async () => {
      const stageA = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage A', position: 0 } });
      const stageB = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage B', position: 1 } });

      const tamperedRes = await request(app)
        .patch(`/api/pipelines/${pipeline.id}/stages/reorder`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          stageIds: [stageA.id, '00000000-0000-0000-0000-000000000000'] // Fake stage ID
        });

      expect(tamperedRes.status).toBe(400);
      expect(tamperedRes.body.success).toBe(false);
      expect(tamperedRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should close position gaps sequentially when a stage is deleted', async () => {
      // 1. Create stages (0, 1, 2)
      const stageA = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage A', position: 0 } });
      const stageB = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage B', position: 1 } });
      const stageC = await prisma.pipelineStage.create({ data: { pipelineId: pipeline.id, name: 'Stage C', position: 2 } });

      // 2. Delete stage B (at index 1)
      const delRes = await request(app)
        .delete(`/api/pipelines/${pipeline.id}/stages/${stageB.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      expect(delRes.status).toBe(200);

      // 3. Verify positions of remaining stages: A is 0, C shifts from 2 to 1!
      const fetchRes = await request(app)
        .get(`/api/pipelines/${pipeline.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);

      const remaining = fetchRes.body.data.stages;
      expect(remaining).toHaveLength(2);
      expect(remaining[0].id).toBe(stageA.id);
      expect(remaining[0].position).toBe(0);
      expect(remaining[1].id).toBe(stageC.id);
      expect(remaining[1].position).toBe(1); // Shifted!
    });
  });
});
