import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/database/client.js';
import redis from '../src/integrations/redis.js';

describe('Notifications Hub API Integration Tests', () => {
  let tokenUserA;
  let tokenUserB;
  let userAId;
  let userBId;
  let orgId;

  const emailUserA = 'usera-notif@example.com';
  const emailUserB = 'userb-notif@example.com';
  const subdomain = 'notif-test-org';

  const cleanup = async () => {
    await prisma.notification.deleteMany({
      where: {
        organization: { subdomain }
      }
    });

    await prisma.organizationMember.deleteMany({
      where: {
        user: { email: { in: [emailUserA, emailUserB] } }
      }
    });

    await prisma.user.deleteMany({
      where: { email: { in: [emailUserA, emailUserB] } }
    });

    await prisma.organization.deleteMany({
      where: { subdomain }
    });
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Signup User A (creates org and admin user)
    const signupARes = await request(app)
      .post('/api/auth/signup')
      .send({
        email: emailUserA,
        password: 'securePassword123',
        firstName: 'UserA',
        lastName: 'Notification',
        orgName: 'Notification Test Corp',
        subdomain
      });
    tokenUserA = signupARes.body.data.tokens.accessToken;
    userAId = signupARes.body.data.user.id;
    orgId = signupARes.body.data.organization.id;

    // 2. Create User B directly and link to org
    const saltRounds = 10;
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash('securePassword123', saltRounds);

    const userB = await prisma.user.create({
      data: {
        email: emailUserB,
        passwordHash,
        firstName: 'UserB',
        lastName: 'Notification',
        isVerified: true
      }
    });
    userBId = userB.id;

    const roleRep = await prisma.role.findUnique({ where: { name: 'SALES_REP' } });
    await prisma.organizationMember.create({
      data: {
        userId: userBId,
        organizationId: orgId,
        roleId: roleRep.id
      }
    });

    // Authenticate User B to get token
    const loginBRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: emailUserB,
        password: 'securePassword123'
      });
    tokenUserB = loginBRes.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: { organizationId: orgId }
    });
  });

  describe('GET /api/notifications & GET /api/notifications/unread-count', () => {
    beforeEach(async () => {
      // Seed 2 unread and 1 read notification for User A
      await prisma.notification.create({
        data: { organizationId: orgId, userId: userAId, title: 'Alert 1', message: 'Message 1', type: 'LEAD_ASSIGNED', isRead: false }
      });
      await prisma.notification.create({
        data: { organizationId: orgId, userId: userAId, title: 'Alert 2', message: 'Message 2', type: 'TASK_DUE', isRead: false }
      });
      await prisma.notification.create({
        data: { organizationId: orgId, userId: userAId, title: 'Alert 3', message: 'Message 3', type: 'AI_INSIGHT', isRead: true }
      });
    });

    it('should list all notifications for User A with pagination count', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.pagination.total).toBe(3);
    });

    it('should filter notifications by isRead state', async () => {
      const res = await request(app)
        .get('/api/notifications?isRead=false')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.body.data).toHaveLength(2);
      const titles = res.body.data.map(n => n.title);
      expect(titles).toContain('Alert 1');
      expect(titles).toContain('Alert 2');
      expect(titles).not.toContain('Alert 3');
    });

    it('should return correct unread count for badge indicators', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(2);
    });
  });

  describe('PATCH /api/notifications/:id/read & PATCH /api/notifications/read-all', () => {
    let notif;

    beforeEach(async () => {
      notif = await prisma.notification.create({
        data: {
          organizationId: orgId,
          userId: userAId,
          title: 'Alert 1',
          message: 'Message 1',
          type: 'LEAD_ASSIGNED',
          isRead: false
        }
      });
    });

    it('should mark a single notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);

      // Verify count in DB
      const countRes = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it('should reject marking read (IDOR Blocked) when notif belongs to another user', async () => {
      // User B attempts to mark User A's notification as read
      const res = await request(app)
        .patch(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${tokenUserB}`); // Authenticated as User B

      expect(res.status).toBe(404); // Blocked
    });

    it('should mark all notifications as read for the user', async () => {
      // Seed another unread notif
      await prisma.notification.create({
        data: { organizationId: orgId, userId: userAId, title: 'Alert 2', message: 'Message 2', type: 'TASK_DUE', isRead: false }
      });

      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.updatedCount).toBe(2);

      const countRes = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(countRes.body.data.unreadCount).toBe(0);
    });
  });
});
