import { prisma } from '../../database/client.js';

export class UsersRepository {
  /**
   * Find a user by their user ID.
   * @param {string} userId 
   */
  async findUserById(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isVerified: true,
        createdAt: true,
        memberships: {
          include: {
            organization: true,
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  /**
   * List all members inside an organization.
   * @param {string} organizationId 
   */
  async findMembersByOrgId(organizationId) {
    return prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            createdAt: true
          }
        },
        role: true
      }
    });
  }

  /**
   * Find a specific organization membership.
   * @param {string} userId 
   * @param {string} organizationId 
   */
  async findMembership(userId, organizationId) {
    return prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId
        }
      },
      include: {
        role: true
      }
    });
  }

  /**
   * Update a member's role inside the organization.
   * @param {string} memberId - The membership ID
   * @param {string} roleId - The new role ID
   */
  async updateMemberRole(memberId, roleId) {
    return prisma.organizationMember.update({
      where: { id: memberId },
      data: { roleId },
      include: {
        role: true,
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
  }

  /**
   * Find role by ID or Name.
   * @param {string} roleIdOrName 
   */
  async findRoleByIdOrName(roleIdOrName) {
    // Check if UUID or name
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(roleIdOrName);
    
    if (isUuid) {
      return prisma.role.findUnique({
        where: { id: roleIdOrName }
      });
    }

    return prisma.role.findUnique({
      where: { name: roleIdOrName }
    });
  }
}
