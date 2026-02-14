/**
 * Admin MFA, Session, and Theme Management
 *
 * Manages Keycloak MFA configuration, user session lifecycle,
 * session statistics, and realm theme settings.
 *
 * Extracted from keycloak-admin.service.ts (Phase 4D decomposition).
 *
 * @module admin-mfa-sessions
 */

import type KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';
import { logger } from '../utils/logger';
import type { AdminServiceContext } from './admin-idp-testing';

// ============================================
// MFA CONFIGURATION
// ============================================

/**
 * Get MFA Configuration for Realm.
 * Reads authentication flow configuration.
 */
export async function getMFAConfigCore(ctx: AdminServiceContext, realmName?: string): Promise<Record<string, unknown>> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const token = ctx.client.accessToken;

    // Get authentication flows
    const flowsUrl = `${baseUrl}/admin/realms/${realm}/authentication/flows`;
    const response = await axios.get(flowsUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Find browser flow (contains MFA config)
    const browserFlow = response.data.find((f: { alias?: string }) => f.alias === 'browser');

    logger.info('Retrieved MFA configuration', { realm, flowAlias: browserFlow?.alias });

    return {
      flowId: browserFlow?.id,
      flowAlias: browserFlow?.alias,
      builtIn: browserFlow?.builtIn,
      topLevel: browserFlow?.topLevel
    };
  } catch (error) {
    logger.error('Failed to get MFA config', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to get MFA config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update MFA Configuration for Realm.
 * Modifies authentication flows to require/optional OTP.
 */
export async function updateMFAConfigCore(ctx: AdminServiceContext, config: Record<string, unknown>, realmName?: string): Promise<void> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const token = ctx.client.accessToken;

    // Get realm settings
    const realmUrl = `${baseUrl}/admin/realms/${realm}`;
    const realmResponse = await axios.get(realmUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Update OTP policy
    const otp = config.otp as Record<string, unknown> | undefined;
    const otpPolicyUpdate = {
      ...realmResponse.data,
      otpPolicyType: otp?.type || 'totp',
      otpPolicyAlgorithm: otp?.algorithm || 'HmacSHA256',
      otpPolicyDigits: otp?.digits || 6,
      otpPolicyPeriod: otp?.period || 30,
      otpPolicyInitialCounter: otp?.initialCounter || 0
    };

    await axios.put(realmUrl, otpPolicyUpdate, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    logger.info('Updated MFA configuration', { realm, config });
  } catch (error) {
    logger.error('Failed to update MFA config', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to update MFA config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Test MFA Flow.
 * Returns flow configuration details.
 */
export async function testMFAFlowCore(ctx: AdminServiceContext, realmName?: string): Promise<Record<string, unknown>> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const token = ctx.client.accessToken;

    // Get required actions
    const actionsUrl = `${baseUrl}/admin/realms/${realm}/authentication/required-actions`;
    const response = await axios.get(actionsUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const otpAction = response.data.find((a: { alias?: string; enabled?: boolean }) => a.alias === 'CONFIGURE_TOTP');

    return {
      success: true,
      message: 'MFA flow test successful',
      requiredActions: response.data.map((a: { alias?: string }) => a.alias),
      otpEnabled: otpAction?.enabled || false
    };
  } catch (error) {
    logger.error('Failed to test MFA flow', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return {
      success: false,
      message: `MFA flow test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Get Active Sessions for Realm.
 * Returns list of active user sessions.
 */
export async function getActiveSessionsCore(ctx: AdminServiceContext, realmName?: string, filters?: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

    // Get all users (then get their sessions)
    const users = await ctx.client.users.find({ max: 1000, realm });

    const sessions: Record<string, unknown>[] = [];

    for (const user of users) {
      if (!user.id) continue;

      try {
        const userSessions = await ctx.client.users.listSessions({
          id: user.id,
          realm
        });

        userSessions.forEach((session) => {
          // Apply filters
          if (filters?.username && user.username !== filters.username) return;
          if (filters?.ipAddress && session.ipAddress !== filters.ipAddress) return;

          sessions.push({
            id: session.id,
            username: user.username,
            userId: user.id,
            ipAddress: session.ipAddress,
            start: session.start,
            lastAccess: session.lastAccess,
            clients: session.clients || {}
          });
        });
      } catch (error) {
        // User has no sessions, skip
        continue;
      }
    }

    logger.info('Retrieved active sessions', { realm, count: sessions.length });
    return sessions;
  } catch (error) {
    logger.error('Failed to get active sessions', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to get sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Revoke Specific Session.
 */
export async function revokeSessionCore(ctx: AdminServiceContext, sessionId: string, realmName?: string): Promise<void> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const token = ctx.client.accessToken;

    const sessionUrl = `${baseUrl}/admin/realms/${realm}/sessions/${sessionId}`;

    await axios.delete(sessionUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    logger.info('Revoked session', { realm, sessionId });
  } catch (error) {
    logger.error('Failed to revoke session', {
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to revoke session: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Revoke All User Sessions.
 */
export async function revokeUserSessionsCore(
  ctx: AdminServiceContext,
  username: string,
  realmName?: string
): Promise<number> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

    // Find user by username
    const users = await ctx.client.users.find({ username, exact: true, realm });

    if (users.length === 0) {
      throw new Error(`User ${username} not found`);
    }

    const user = users[0];

    if (!user.id) {
      throw new Error('User ID not found');
    }

    // Logout user (revokes all sessions)
    await ctx.client.users.logout({ id: user.id, realm });

    logger.info('Revoked all user sessions', { realm, username, userId: user.id });

    // Return count (we don't know exact count, return 1 as success indicator)
    return 1;
  } catch (error) {
    logger.error('Failed to revoke user sessions', {
      username,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to revoke user sessions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get Session Statistics.
 */
export async function getSessionStatsCore(ctx: AdminServiceContext, realmName?: string): Promise<Record<string, unknown>> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const sessions = await getActiveSessionsCore(ctx, realm);

    const stats = {
      totalActive: sessions.length,
      peakConcurrent24h: sessions.length, // Simplified: current = peak
      averageDuration: 0,
      byClient: {} as Record<string, number>,
      byUser: {} as Record<string, number>
    };

    let totalDuration = 0;

    sessions.forEach(session => {
      // Calculate duration
      const duration = ((session.lastAccess as number) - (session.start as number)) / 1000; // seconds
      totalDuration += duration;

      // Count by user
      const username = session.username as string;
      stats.byUser[username] = (stats.byUser[username] || 0) + 1;

      // Count by client
      Object.keys((session.clients || {}) as Record<string, unknown>).forEach(clientId => {
        stats.byClient[clientId] = (stats.byClient[clientId] || 0) + 1;
      });
    });

    stats.averageDuration = sessions.length > 0 ? totalDuration / sessions.length : 0;

    logger.info('Retrieved session statistics', { realm, totalActive: stats.totalActive });
    return stats;
  } catch (error) {
    logger.error('Failed to get session stats', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to get session stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// THEME MANAGEMENT
// ============================================

/**
 * Get Realm Theme Settings.
 */
export async function getRealmThemeCore(ctx: AdminServiceContext, realmName?: string): Promise<Record<string, unknown>> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const token = ctx.client.accessToken;

    const realmUrl = `${baseUrl}/admin/realms/${realm}`;
    const response = await axios.get(realmUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    return {
      loginTheme: response.data.loginTheme,
      accountTheme: response.data.accountTheme,
      adminTheme: response.data.adminTheme,
      emailTheme: response.data.emailTheme,
      internationalizationEnabled: response.data.internationalizationEnabled,
      supportedLocales: response.data.supportedLocales || []
    };
  } catch (error) {
    logger.error('Failed to get realm theme', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to get realm theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update Realm Theme Settings.
 */
export async function updateRealmThemeCore(
  ctx: AdminServiceContext,
  themeName: string,
  realmName?: string
): Promise<void> {
  try {
    const realm = realmName || process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
    const baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    const token = ctx.client.accessToken;

    const realmUrl = `${baseUrl}/admin/realms/${realm}`;

    // Get current realm settings
    const currentSettings = await axios.get(realmUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Update login theme
    const updatedSettings = {
      ...currentSettings.data,
      loginTheme: themeName
    };

    await axios.put(realmUrl, updatedSettings, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    logger.info('Updated realm theme', { realm, themeName });
  } catch (error) {
    logger.error('Failed to update realm theme', {
      themeName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw new Error(`Failed to update realm theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
