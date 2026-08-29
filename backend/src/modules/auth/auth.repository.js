import { prisma } from '../../database/client.js';

export class AuthRepository {
  /**
   * Find a user by email address, including their memberships and roles.
   * @param {string} email 
   */
  async findUserByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      include: {
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
   * Find a role by its unique name.
   * @param {string} roleName 
   */
  async findRoleByName(roleName) {
    return prisma.role.findUnique({
      where: { name: roleName }
    });
  }

  /**
   * Perform atomic signup transaction: creates Org, User, and links them via OrgMember.
   * @param {object} signupData 
   */
  async createUserWithOrganization({
    email,
    passwordHash,
    firstName,
    lastName,
    orgName,
    subdomain,
    roleId
  }) {
    return prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          subdomain
        }
      });

      // 2. Create User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          isVerified: false // Needs email verification in a future phase
        }
      });

      // 3. Create OrgMember relationship with Admin Role
      const member = await tx.organizationMember.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId
        },
        include: {
          role: true,
          organization: true
        }
      });

      return { user, organization, member };
    });
  }
}
