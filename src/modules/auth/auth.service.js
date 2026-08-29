import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../../config/env.js';
import redis from '../../integrations/redis.js';
import { AuthRepository } from './auth.repository.js';
import { 
  AuthenticationError, 
  ConflictError, 
  NotFoundError 
} from '../../common/errors.js';
import { prisma } from '../../database/client.js';

const authRepository = new AuthRepository();

export class AuthService {
  /**
   * Register a new user, their organization, and their ORG_ADMIN membership.
   */
  async signup({ email, password, firstName, lastName, orgName, subdomain }) {
    // 1. Check if user already exists
    const existingUser = await authRepository.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    // 2. Check if subdomain is unique
    const existingOrg = await prisma.organization.findUnique({
      where: { subdomain }
    });
    if (existingOrg) {
      throw new ConflictError('This organization subdomain is already taken');
    }

    // 3. Find ORG_ADMIN role ID
    const orgAdminRole = await authRepository.findRoleByName('ORG_ADMIN');
    if (!orgAdminRole) {
      throw new NotFoundError('Default ORG_ADMIN role configuration not found');
    }

    // 4. Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 5. Execute signup transaction
    const { user, organization, member } = await authRepository.createUserWithOrganization({
      email,
      passwordHash,
      firstName,
      lastName,
      orgName,
      subdomain,
      roleId: orgAdminRole.id
    });

    // 6. Generate session tokens
    const tokens = await this.generateTokenPair({
      userId: user.id,
      email: user.email,
      organizationId: organization.id,
      role: orgAdminRole.name,
      permissions: ['lead:create', 'lead:read', 'lead:update', 'lead:delete', 'lead:assign', 'task:create', 'task:update', 'report:view', 'user:manage', 'organization:manage']
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      organization: {
        id: organization.id,
        name: organization.name,
        subdomain: organization.subdomain
      },
      tokens
    };
  }

  /**
   * Authenticate user credentials and issue session tokens.
   */
  async login({ email, password }) {
    // 1. Fetch user by email
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // 2. Verify password hash
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // 3. Extract primary organization membership details
    const membership = user.memberships[0];
    if (!membership) {
      throw new AuthenticationError('This user does not belong to any organization');
    }

    // Flat permissions array
    const permissions = membership.role.permissions.map(rp => rp.permission.name);

    // 4. Generate token pair
    const tokens = await this.generateTokenPair({
      userId: user.id,
      email: user.email,
      organizationId: membership.organizationId,
      role: membership.role.name,
      permissions
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        subdomain: membership.organization.subdomain
      },
      tokens
    };
  }

  /**
   * Rotate refresh tokens and issue a fresh token pair.
   */
  async refresh(refreshToken) {
    let payload;
    try {
      // 1. Verify token signature
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const { userId, jti, organizationId, role, permissions } = payload;
    const redisKey = `refresh_token:${userId}:${jti}`;

    // 2. Check if token exists in Redis (prevents reuse/revoked tokens)
    const exists = await redis.exists(redisKey);
    if (!exists) {
      // Security Alert: Potential refresh token replay attack!
      // In a strict prod scenario, we could optionally revoke all active sessions for this user ID.
      throw new AuthenticationError('Session expired or hijacked. Please login again.');
    }

    // 3. Remove old refresh token (invalidation)
    await redis.del(redisKey);

    // 4. Generate new token pair (Token Rotation)
    const tokens = await this.generateTokenPair({
      userId,
      email: payload.email,
      organizationId,
      role,
      permissions
    });

    return tokens;
  }

  /**
   * Log out user by deleting their refresh token from Redis.
   */
  async logout(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
      const redisKey = `refresh_token:${payload.userId}:${payload.jti}`;
      await redis.del(redisKey);
    } catch (error) {
      // Ignore token verification errors during logout to allow client cleanup
    }
  }

  /**
   * Helper to sign access and refresh tokens and save refresh token to Redis.
   */
  async generateTokenPair({ userId, email, organizationId, role, permissions }) {
    const jti = crypto.randomUUID();

    const accessToken = jwt.sign(
      { userId, email, organizationId, role, permissions },
      env.JWT_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRATION }
    );

    const refreshToken = jwt.sign(
      { userId, email, organizationId, role, permissions, jti },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRATION }
    );

    // Store in Redis with TTL matching refresh token expiration (7 days default)
    const redisKey = `refresh_token:${userId}:${jti}`;
    
    // Parse TTL string (e.g. '7d' or '24h') to seconds for Redis
    const ttlSeconds = this.parseExpiryToSeconds(env.JWT_REFRESH_EXPIRATION);
    await redis.set(redisKey, 'true', 'EX', ttlSeconds);

    return { accessToken, refreshToken };
  }

  /**
   * Helper to convert standard JWT expiry string format (e.g. '7d', '24h') into seconds.
   */
  parseExpiryToSeconds(expiry) {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1), 10);
    switch (unit) {
      case 'd': return value * 24 * 60 * 60;
      case 'h': return value * 60 * 60;
      case 'm': return value * 60;
      case 's': return value;
      default: return 7 * 24 * 60 * 60; // Default fallback to 7 days
    }
  }
}
