import { UsersRepository } from './users.repository.js';
import { 
  NotFoundError, 
  AuthorizationError, 
  ValidationError 
} from '../../common/errors.js';

const usersRepository = new UsersRepository();

export class UsersService {
  /**
   * Get logged-in user profile with active tenant role context.
   * @param {string} userId 
   */
  async getProfile(userId) {
    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const memberships = user.memberships.map((membership) => ({
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        subdomain: membership.organization.subdomain
      },
      role: {
        name: membership.role.name,
        permissions: membership.role.permissions.map((rp) => rp.permission.name)
      }
    }));

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      memberships
    };
  }

  /**
   * List all team members within the active tenant organization.
   * @param {string} organizationId 
   */
  async listOrganizationMembers(organizationId) {
    const members = await usersRepository.findMembersByOrgId(organizationId);
    return members.map(m => ({
      membershipId: m.id,
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.role.name,
      joinedAt: m.createdAt
    }));
  }

  /**
   * Update the role of a user inside the organization.
   * @param {string} adminUserId - The performing user's ID
   * @param {string} targetUserId - The ID of the user to be updated
   * @param {string} organizationId - The active organization ID
   * @param {string} newRoleNameOrId - The target role name (e.g. 'SALES_REP') or ID
   */
  async updateUserRole(adminUserId, targetUserId, organizationId, newRoleNameOrId) {
    // 1. Verify role exists
    const role = await usersRepository.findRoleByIdOrName(newRoleNameOrId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // 2. Prevent self-demotion or self-modification to preserve system integrity
    if (adminUserId === targetUserId) {
      throw new ValidationError('You cannot modify your own role');
    }

    // 3. Find target user's membership
    const targetMembership = await usersRepository.findMembership(targetUserId, organizationId);
    if (!targetMembership) {
      throw new NotFoundError('Target user membership in this organization not found');
    }

    // 4. If target role is identical, exit early
    if (targetMembership.roleId === role.id) {
      return {
        success: true,
        message: 'User already has this role'
      };
    }

    // 5. Enforce safety checks:
    // If target user is an ORG_ADMIN, ensure they are not the ONLY Org Admin
    if (targetMembership.role.name === 'ORG_ADMIN') {
      const orgMembers = await usersRepository.findMembersByOrgId(organizationId);
      const adminCount = orgMembers.filter(m => m.role.name === 'ORG_ADMIN').length;
      if (adminCount <= 1) {
        throw new ValidationError('Cannot change the role of the only ORG_ADMIN in the organization');
      }
    }

    // 6. Execute update
    const updatedMember = await usersRepository.updateMemberRole(targetMembership.id, role.id);
    
    return {
      userId: updatedMember.user.id,
      email: updatedMember.user.email,
      organizationId,
      newRole: updatedMember.role.name
    };
  }
}
