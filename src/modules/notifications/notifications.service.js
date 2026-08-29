import { NotificationsRepository } from './notifications.repository.js';
import { NotFoundError } from '../../common/errors.js';

const notificationsRepository = new NotificationsRepository();

export class NotificationsService {
  /**
   * Internal utility to create notifications triggered by system events (e.g. Lead Assigned, Task Due).
   */
  async createSystemNotification({ organizationId, userId, title, message, type }) {
    return notificationsRepository.createNotification({
      organizationId,
      userId,
      title,
      message,
      type
    });
  }

  /**
   * List paginated notifications for the logged-in user.
   */
  async listUserNotifications(userId, { page = 1, limit = 10, isRead }) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Convert string query parameter to boolean if provided
    let isReadBool;
    if (isRead === 'true' || isRead === true) {
      isReadBool = true;
    } else if (isRead === 'false' || isRead === false) {
      isReadBool = false;
    }

    const { items, total } = await notificationsRepository.findManyNotifications({
      userId,
      isRead: isReadBool,
      skip,
      take: limitNum
    });

    return {
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Get total number of unread notifications for a user.
   */
  async getUnreadCount(userId) {
    const count = await notificationsRepository.countUnread(userId);
    return { unreadCount: count };
  }

  /**
   * Mark a specific notification as read.
   */
  async markNotificationRead(id, userId) {
    // 1. Verify existence and ownership
    const notification = await notificationsRepository.findNotificationById(id, userId);
    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    // 2. If already read, return early
    if (notification.isRead) {
      return notification;
    }

    // 3. Update
    return notificationsRepository.markAsRead(id);
  }

  /**
   * Mark all notifications as read for the user.
   */
  async markAllNotificationsRead(userId) {
    const result = await notificationsRepository.markAllAsRead(userId);
    return {
      success: true,
      updatedCount: result.count
    };
  }
}
