/**
 * DIVE V3 SCIM Service
 * Handles SCIM 2.0 user provisioning with Keycloak integration
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import { logger } from '../utils/logger';
import { ISCIMUser } from '../types/sp-federation.types';
import crypto from 'crypto';

export class SCIMService {
  private kcAdminClient: KcAdminClient | null = null;
  private readonly REALM_NAME = process.env.KEYCLOAK_REALM || 'dive-v3-broker';

  /**
   * Initialize Keycloak admin client
   */
  private async initializeKeycloak(): Promise<KcAdminClient> {
    if (!this.kcAdminClient) {
      this.kcAdminClient = new KcAdminClient({
        baseUrl: process.env.KEYCLOAK_URL || 'http://keycloak:8080',
        realmName: 'master'
      });

      await this.kcAdminClient.auth({
        username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
        grantType: 'password',
        clientId: 'admin-cli'
      });

      // Switch to target realm
      this.kcAdminClient.setConfig({ realmName: this.REALM_NAME });
    }

    return this.kcAdminClient;
  }

  /**
   * Search users based on SCIM filter
   */
  async searchUsers(params: {
    filter?: string;
    startIndex: number;
    count: number;
    attributes?: string;
    excludedAttributes?: string;
    sortBy?: string;
    sortOrder?: 'ascending' | 'descending';
  }): Promise<{ total: number; items: ISCIMUser[] }> {
    const kcAdmin = await this.initializeKeycloak();

    try {
      // Parse SCIM filter to Keycloak query
      const query = params.filter ? this.parseFilterToKeycloakQuery(params.filter) : {};
      
      // Fetch users from Keycloak
      const users = await kcAdmin.users.find({
        ...query,
        first: params.startIndex - 1,
        max: params.count
      });

      // Get total count
      const totalCount = await kcAdmin.users.count(query);

      // Convert to SCIM format
      const scimUsers = users.map(kcUser => this.keycloakToSCIM(kcUser));

      // Apply attribute filtering
      const filteredUsers = this.applyAttributeFiltering(
        scimUsers, 
        params.attributes, 
        params.excludedAttributes
      );

      return {
        total: totalCount,
        items: filteredUsers
      };

    } catch (error) {
      logger.error('SCIM search error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        filter: params.filter
      });
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<ISCIMUser | null> {
    const kcAdmin = await this.initializeKeycloak();

    try {
      const kcUser = await kcAdmin.users.findOne({ id });
      if (!kcUser) {
        return null;
      }

      return this.keycloakToSCIM(kcUser);
    } catch (error) {
      logger.error('SCIM get user error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: id
      });
      throw error;
    }
  }

  /**
   * Create user
   */
  async createUser(scimUser: ISCIMUser): Promise<ISCIMUser> {
    const kcAdmin = await this.initializeKeycloak();

    try {
      // Validate username uniqueness
      const existingUsers = await kcAdmin.users.find({
        username: scimUser.userName,
        max: 1
      });

      if (existingUsers.length > 0) {
        throw new Error('User already exists');
      }

      // Extract DIVE V3 attributes
      const diveAttrs = scimUser["urn:dive:params:scim:schemas:extension:2.0:User"];

      // Create Keycloak user
      const kcUser = {
        username: scimUser.userName,
        email: scimUser.emails?.[0]?.value,
        emailVerified: false,
        firstName: scimUser.name?.givenName,
        lastName: scimUser.name?.familyName,
        enabled: scimUser.active !== false,
        attributes: {
          uniqueID: scimUser.userName,
          clearance: diveAttrs.clearance,
          countryOfAffiliation: diveAttrs.countryOfAffiliation,
          acpCOI: JSON.stringify(diveAttrs.acpCOI || []),
          dutyOrg: diveAttrs.dutyOrg || '',
          scimId: scimUser.externalId || '',
          scimCreated: new Date().toISOString()
        }
      };

      const response = await kcAdmin.users.create(kcUser);
      
      // Get created user
      const createdUser = await kcAdmin.users.findOne({ id: response.id });
      if (!createdUser) {
        throw new Error('Failed to retrieve created user');
      }

      // Generate initial password
      const tempPassword = this.generateTempPassword();
      await kcAdmin.users.resetPassword({
        id: response.id,
        credential: {
          temporary: true,
          type: 'password',
          value: tempPassword
        }
      });

      logger.info('SCIM user created in Keycloak', {
        userId: response.id,
        username: scimUser.userName,
        clearance: diveAttrs.clearance,
        country: diveAttrs.countryOfAffiliation
      });

      return this.keycloakToSCIM(createdUser);

    } catch (error) {
      logger.error('SCIM create user error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userName: scimUser.userName
      });
      throw error;
    }
  }

  /**
   * Update user (full replacement)
   */
  async updateUser(id: string, scimUser: ISCIMUser): Promise<ISCIMUser | null> {
    const kcAdmin = await this.initializeKeycloak();

    try {
      // Check if user exists
      const existingUser = await kcAdmin.users.findOne({ id });
      if (!existingUser) {
        return null;
      }

      // Extract DIVE V3 attributes
      const diveAttrs = scimUser["urn:dive:params:scim:schemas:extension:2.0:User"];

      // Update Keycloak user
      await kcAdmin.users.update(
        { id },
        {
          username: scimUser.userName,
          email: scimUser.emails?.[0]?.value,
          firstName: scimUser.name?.givenName,
          lastName: scimUser.name?.familyName,
          enabled: scimUser.active !== false,
          attributes: {
            ...existingUser.attributes,
            uniqueID: scimUser.userName,
            clearance: diveAttrs.clearance,
            countryOfAffiliation: diveAttrs.countryOfAffiliation,
            acpCOI: JSON.stringify(diveAttrs.acpCOI || []),
            dutyOrg: diveAttrs.dutyOrg || '',
            scimModified: new Date().toISOString()
          }
        }
      );

      // Get updated user
      const updatedUser = await kcAdmin.users.findOne({ id });
      if (!updatedUser) {
        throw new Error('Failed to retrieve updated user');
      }

      return this.keycloakToSCIM(updatedUser);

    } catch (error) {
      logger.error('SCIM update user error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: id
      });
      throw error;
    }
  }

  /**
   * Patch user (partial update)
   */
  async patchUser(id: string, patchOp: any): Promise<ISCIMUser | null> {
    const kcAdmin = await this.initializeKeycloak();

    try {
      // Check if user exists
      const existingUser = await kcAdmin.users.findOne({ id });
      if (!existingUser) {
        return null;
      }

      // Apply patch operations
      const updatedUser = await this.applyPatchOperations(existingUser, patchOp);

      // Update in Keycloak
      await kcAdmin.users.update({ id }, updatedUser);

      // Get updated user
      const refreshedUser = await kcAdmin.users.findOne({ id });
      if (!refreshedUser) {
        throw new Error('Failed to retrieve patched user');
      }

      return this.keycloakToSCIM(refreshedUser);

    } catch (error) {
      logger.error('SCIM patch user error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: id
      });
      throw error;
    }
  }

  /**
   * Delete user
   */
  async deleteUser(id: string): Promise<boolean> {
    const kcAdmin = await this.initializeKeycloak();

    try {
      // Check if user exists
      const existingUser = await kcAdmin.users.findOne({ id });
      if (!existingUser) {
        return false;
      }

      // Delete from Keycloak
      await kcAdmin.users.del({ id });

      logger.info('SCIM user deleted from Keycloak', {
        userId: id,
        username: existingUser.username
      });

      return true;

    } catch (error) {
      logger.error('SCIM delete user error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: id
      });
      throw error;
    }
  }

  /**
   * Convert Keycloak user to SCIM format
   */
  private keycloakToSCIM(kcUser: any): ISCIMUser {
    const attrs = kcUser.attributes || {};
    
    // Parse acpCOI from JSON string
    let acpCOI: string[] = [];
    try {
      if (attrs.acpCOI) {
        acpCOI = JSON.parse(attrs.acpCOI);
      }
    } catch (e) {
      // If not JSON, treat as single value
      if (attrs.acpCOI) {
        acpCOI = [attrs.acpCOI];
      }
    }

    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      id: kcUser.id,
      externalId: attrs.scimId,
      userName: kcUser.username,
      name: {
        formatted: `${kcUser.firstName || ''} ${kcUser.lastName || ''}`.trim(),
        familyName: kcUser.lastName,
        givenName: kcUser.firstName
      },
      emails: kcUser.email ? [{
        value: kcUser.email,
        type: 'work',
        primary: true
      }] : [],
      active: kcUser.enabled,
      "urn:dive:params:scim:schemas:extension:2.0:User": {
        clearance: attrs.clearance || 'UNCLASSIFIED',
        countryOfAffiliation: attrs.countryOfAffiliation || 'USA',
        acpCOI: acpCOI,
        dutyOrg: attrs.dutyOrg
      },
      meta: {
        resourceType: "User",
        created: attrs.scimCreated || kcUser.createdTimestamp?.toString() || new Date().toISOString(),
        lastModified: attrs.scimModified || new Date().toISOString(),
        version: "1"
      }
    };
  }

  /**
   * Parse SCIM filter to Keycloak query
   */
  private parseFilterToKeycloakQuery(filter: string): any {
    // Simple filter parsing - production would need full SCIM filter parser
    const query: any = {};

    // Handle userName filter
    if (filter.includes('userName')) {
      const match = filter.match(/userName\s+eq\s+"([^"]+)"/);
      if (match) {
        query.username = match[1];
      }
    }

    // Handle email filter
    if (filter.includes('emails')) {
      const match = filter.match(/emails\[.*\]\.value\s+eq\s+"([^"]+)"/);
      if (match) {
        query.email = match[1];
      }
    }

    return query;
  }

  /**
   * Apply SCIM patch operations
   */
  private async applyPatchOperations(kcUser: any, patchOp: any): Promise<any> {
    const operations = patchOp.Operations || [];
    const updatedUser = { ...kcUser };

    for (const op of operations) {
      switch (op.op) {
        case 'replace':
        case 'add':
          this.applyPatchValue(updatedUser, op.path, op.value);
          break;
        case 'remove':
          this.removePatchValue(updatedUser, op.path);
          break;
      }
    }

    return updatedUser;
  }

  /**
   * Apply patch value to user object
   */
  private applyPatchValue(user: any, path: string, value: any): void {
    // Handle different paths
    if (path === 'userName') {
      user.username = value;
    } else if (path.startsWith('name.')) {
      const field = path.split('.')[1];
      if (field === 'givenName') user.firstName = value;
      if (field === 'familyName') user.lastName = value;
    } else if (path.startsWith('emails')) {
      if (Array.isArray(value) && value.length > 0) {
        user.email = value[0].value;
      }
    } else if (path.startsWith('urn:dive:params:scim:schemas:extension:2.0:User:')) {
      const field = path.split(':').pop();
      if (!user.attributes) user.attributes = {};
      
      switch (field) {
        case 'clearance':
          user.attributes.clearance = value;
          break;
        case 'countryOfAffiliation':
          user.attributes.countryOfAffiliation = value;
          break;
        case 'acpCOI':
          user.attributes.acpCOI = JSON.stringify(value);
          break;
        case 'dutyOrg':
          user.attributes.dutyOrg = value;
          break;
      }
    }
  }

  /**
   * Remove patch value from user object
   */
  private removePatchValue(user: any, path: string): void {
    if (path === 'emails') {
      delete user.email;
    }
    // Add more remove operations as needed
  }

  /**
   * Apply attribute filtering
   */
  private applyAttributeFiltering(
    users: ISCIMUser[], 
    attributes?: string, 
    excludedAttributes?: string
  ): ISCIMUser[] {
    // Simple implementation - production would need full attribute path parsing
    if (!attributes && !excludedAttributes) {
      return users;
    }

    // For now, return users as-is
    // Full implementation would filter based on attribute paths
    return users;
  }

  /**
   * Generate temporary password
   */
  private generateTempPassword(): string {
    return crypto.randomBytes(12).toString('base64');
  }
}
