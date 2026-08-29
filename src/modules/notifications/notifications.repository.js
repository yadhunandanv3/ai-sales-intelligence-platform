import { prisma } from '../../database/client.js';

export class NotificationsRepository {
  /**
   * Create a new notification record.
   */
  async createNotification({ organizationId, userId, title, message, type }) {
    return prisma.notification.create({
      data: {
        organizationId,
        userId,
        title,
        message,
        type
      }
    });
  }

  /**
   * Find a notification by ID and User ID (enforces security context).
   */
  async findNotificationById(id, userId) {
    return prisma.notification.findFirst({
      where: {
        id,
        userId
      }
    });
  }

  /**
   * Find many notifications for a user, support pagination and read filters.
   */
  async findManyNotifications({ userId, isRead, skip = 0, take = 10 }) {
    const where = { userId };
    
    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.notification.count({ where })
    ]);

    return { items, total };
  }

  /**
   * Count unread notifications for a user.
   */
  async countUnread(userId) {
    return prisma.notification.count({
      where: {
        userId,
        isRead: false
      }
    });
  }

  /**
   * Mark a specific notification as read.
   */
  async markAsRead(id) {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(userId) {
    return prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });
  }
}
