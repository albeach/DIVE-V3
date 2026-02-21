#!/usr/bin/env ts-node
/**
 * Initialize Keycloak User Profile with Multi-Valued COI Attribute
 * 
 * This script ensures that the User Profile for each DIVE instance has
 * the communityOfInterest attribute configured with multivalued=true.
 * 
 * This is required for Keycloak v26+ to accept multi-valued COI arrays.
 * 
 * Usage:
 *   ts-node init-user-profiles.ts <instance-code>
 *   Example: ts-node init-user-profiles.ts GBR
 * 
 * Called by: dive CLI during spoke setup (after Keycloak starts)
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import { getKeycloakPassword } from '../utils/gcp-secrets';
import logger from '../utils/logger';
import { isHubInstance, isHubCode } from '../services/bidirectional-federation';

interface IUserProfileAttribute {
  name: string;
  displayName?: string;
  validations?: Record<string, any>;
  annotations?: Record<string, any>;
  permissions?: {
    view?: string[];
    edit?: string[];
  };
  required?: {
    roles?: string[];
    scopes?: string[];
  };
  multivalued?: boolean;
  group?: string;
}

interface IUserProfileConfig {
  attributes?: IUserProfileAttribute[];
  groups?: Array<{
    name: string;
    displayHeader?: string;
    displayDescription?: string;
    annotations?: Record<string, any>;
  }>;
  unmanagedAttributePolicy?: string;
}

/**
 * Attribute configurations for different nations
 */
const NATION_ATTRIBUTES: Record<string, IUserProfileAttribute[]> = {
  GBR: [
    {
      name: 'communityOfInterest',
      displayName: 'Community of Interest (UK)',
      multivalued: true,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'securityClearance',
      displayName: 'Security Clearance (UK)',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'nationality',
      displayName: 'Nationality (UK)',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'ukPersonnelNumber',
      displayName: 'UK Personnel Number',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'surname',
      displayName: 'Surname (UK)',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'givenName',
      displayName: 'Given Name (UK)',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'organisationUnit',
      displayName: 'Organisation Unit (UK)',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
  ],
  FRA: [
    {
      name: 'communityOfInterest',
      displayName: 'Communauté d\'Intérêt (FR)',
      multivalued: true,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
    {
      name: 'clearance',
      displayName: 'Habilitation de Sécurité (FR)',
      multivalued: false,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
  ],
  DEU: [
    {
      name: 'communityOfInterest',
      displayName: 'Interessengemeinschaft (DE)',
      multivalued: true,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
  ],
  CAN: [
    {
      name: 'communityOfInterest',
      displayName: 'Community of Interest (CA)',
      multivalued: true,
      permissions: { view: ['admin', 'user'], edit: ['admin'] },
      validations: {},
      annotations: {},
    },
  ],
};

async function initUserProfile(instanceCode: string): Promise<void> {
  const code = instanceCode.toUpperCase();
  
  logger.info('Initializing User Profile for instance', { instanceCode: code });

  // Get Keycloak configuration for this instance
  const isHub = isHubCode(code);
  const realm = `dive-v3-broker-${code.toLowerCase()}`;
  
  // Determine Keycloak URL (internal Docker network)
  const keycloakUrl = isHub 
    ? 'http://localhost:8080'  // Hub Keycloak (called from host or backend container)
    : `https://${code.toLowerCase()}-keycloak-${code.toLowerCase()}-1:8443`; // Spoke Keycloak

  // Get admin password from GCP
  const adminPassword = await getKeycloakPassword(code);

  // Initialize Keycloak Admin Client
  const kcAdmin = new KcAdminClient({
    baseUrl: keycloakUrl,
    realmName: 'master',
  });

  try {
    // Authenticate
    await kcAdmin.auth({
      username: 'admin',
      password: adminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });

    logger.info('Authenticated to Keycloak', { instanceCode: code, realm });

    // Get current User Profile
    const userProfile = await kcAdmin.users.getProfile({ realm }) as IUserProfileConfig;

    if (!userProfile) {
      logger.warn('User Profile not found, creating new one', { realm });
    }

    const existingAttributes = userProfile.attributes || [];
    const attributesToAdd = NATION_ATTRIBUTES[code] || [];

    if (attributesToAdd.length === 0) {
      logger.warn('No nation-specific attributes defined for instance', { instanceCode: code });
      return;
    }

    let updated = false;

    for (const attrConfig of attributesToAdd) {
      const existingAttr = existingAttributes.find(a => a.name === attrConfig.name);

      if (existingAttr) {
        // Check if multivalued needs to be updated
        if (attrConfig.multivalued !== undefined && existingAttr.multivalued !== attrConfig.multivalued) {
          logger.info('Updating attribute multivalued setting', {
            realm,
            attribute: attrConfig.name,
            from: existingAttr.multivalued,
            to: attrConfig.multivalued,
          });
          existingAttr.multivalued = attrConfig.multivalued;
          updated = true;
        } else {
          logger.debug('Attribute already configured correctly', {
            realm,
            attribute: attrConfig.name,
            multivalued: existingAttr.multivalued,
          });
        }
      } else {
        // Add new attribute
        logger.info('Adding new attribute to User Profile', {
          realm,
          attribute: attrConfig.name,
          multivalued: attrConfig.multivalued,
        });
        existingAttributes.push(attrConfig);
        updated = true;
      }
    }

    if (updated) {
      // Update User Profile
      await kcAdmin.users.updateProfile({
        realm,
        ...userProfile,
        attributes: existingAttributes,
      });

      logger.info('User Profile updated successfully', {
        realm,
        attributesAdded: attributesToAdd.length,
      });
    } else {
      logger.info('User Profile already configured correctly', { realm });
    }

    logger.info('✅ User Profile initialization complete', {
      instanceCode: code,
      realm,
      multivaluedCOI: true,
    });

  } catch (error) {
    logger.error('Failed to initialize User Profile', {
      instanceCode: code,
      realm,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

// Main execution
if (require.main === module) {
  const instanceCode = process.argv[2];

  if (!instanceCode) {
    console.error('Usage: ts-node init-user-profiles.ts <instance-code>');
    console.error('Example: ts-node init-user-profiles.ts GBR');
    process.exit(1);
  }

  initUserProfile(instanceCode)
    .then(() => {
      console.log('✅ User Profile initialization successful');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ User Profile initialization failed:', error.message);
      process.exit(1);
    });
}

export { initUserProfile };
