/**
 * Admin User Management
 *
 * Manages Keycloak realm roles and user CRUD operations:
 * role creation, role assignment, user listing/creation/update/deletion,
 * password reset, and user lookup by username.
 *
 * Extracted from keycloak-admin.service.ts (Phase 4D decomposition).
 *
 * @module admin-user-management
 */

import type KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '../utils/logger';
import type { AdminServiceContext } from './admin-idp-testing';

// ============================================
// REALM ROLE MANAGEMENT
// ============================================

/**
 * Create realm role (e.g., super_admin).
 */
export async function createRealmRoleCore(ctx: AdminServiceContext, roleName: string, description: string): Promise<void> {
  try {
    await ctx.client.roles.create({
      name: roleName,
      description
    });

    logger.info('Created realm role', { roleName });
  } catch (error) {
    logger.error('Failed to create realm role', {
      roleName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Assign role to user.
 */
export async function assignRoleToUserCore(ctx: AdminServiceContext, userId: string, roleName: string): Promise<void> {
  try {
    const role = await ctx.client.roles.findOneByName({ name: roleName });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await ctx.client.users.addRealmRoleMappings({
      id: userId,
      roles: [{ id: role.id!, name: role.name! }]
    });

    logger.info('Assigned role to user', { userId, roleName });
  } catch (error) {
    logger.error('Failed to assign role to user', {
      userId,
      roleName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

// ============================================
// USER CRUD
// ============================================

/**
 * List all users in realm.
 */
export async function listUsersCore(
  ctx: AdminServiceContext,
  max: number = 100,
  first: number = 0,
  search: string = ''
): Promise<{ users: any[], total: number }> {
  try {
    const query: any = { max, first };
    if (search) {
      query.search = search;
    }

    const users = await ctx.client.users.find(query);
    const count = await ctx.client.users.count(search ? { search } : {});

    return { users, total: count };
  } catch (error) {
    logger.error('Failed to list users', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Get user by ID.
 */
export async function getUserByIdCore(ctx: AdminServiceContext, userId: string): Promise<any> {
  try {
    const user = await ctx.client.users.findOne({ id: userId });
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    return user;
  } catch (error) {
    logger.error('Failed to get user by ID', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Create User.
 */
export async function createUserCore(ctx: AdminServiceContext, userData: any): Promise<string> {
  try {
    const user = await ctx.client.users.create({
      username: userData.username,
      email: userData.email,
      enabled: userData.enabled !== false,
      emailVerified: userData.emailVerified !== false,
      firstName: userData.firstName,
      lastName: userData.lastName,
      attributes: userData.attributes,
      credentials: userData.password ? [{
        type: 'password',
        value: userData.password,
        temporary: userData.temporaryPassword !== false
      }] : undefined
    });

    logger.info('Created user', { userId: user.id, username: userData.username });
    return user.id;
  } catch (error) {
    logger.error('Failed to create user', {
      username: userData.username,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Update User.
 */
export async function updateUserCore(ctx: AdminServiceContext, userId: string, userData: any): Promise<void> {
  try {
    await ctx.client.users.update({ id: userId }, {
      email: userData.email,
      enabled: userData.enabled,
      firstName: userData.firstName,
      lastName: userData.lastName,
      attributes: userData.attributes,
      emailVerified: userData.emailVerified
    });

    logger.info('Updated user', { userId });
  } catch (error) {
    logger.error('Failed to update user', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Delete User.
 */
export async function deleteUserCore(ctx: AdminServiceContext, userId: string): Promise<void> {
  try {
    await ctx.client.users.del({ id: userId });
    logger.info('Deleted user', { userId });
  } catch (error) {
    logger.error('Failed to delete user', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Reset Password.
 */
export async function resetPasswordCore(
  ctx: AdminServiceContext,
  userId: string,
  password: string,
  temporary: boolean = true
): Promise<void> {
  try {
    await ctx.client.users.resetPassword({
      id: userId,
      credential: {
        type: 'password',
        value: password,
        temporary
      }
    });
    logger.info('Reset password for user', { userId, temporary });
  } catch (error) {
    logger.error('Failed to reset password', {
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Get user by username from specific realm.
 */
export async function getUserByUsernameCore(
  ctx: AdminServiceContext,
  realmName: string,
  username: string
): Promise<any> {
  try {
    // Temporarily switch to target realm
    const originalRealm = ctx.client.realmName;
    ctx.client.setConfig({ realmName });

    const users = await ctx.client.users.find({ username, exact: true });

    // Switch back to original realm
    ctx.client.setConfig({ realmName: originalRealm });

    if (users.length === 0) {
      logger.warn('User not found in realm', { username, realmName });
      return null;
    }

    logger.debug('Found user in realm', { username, realmName, userId: users[0].id });
    return users[0];
  } catch (error) {
    logger.error('Failed to get user by username', {
      username,
      realmName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
