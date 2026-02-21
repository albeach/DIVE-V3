/**
 * DIVE V3 - Federation Cascade Operations
 *
 * Standalone functions for federation side-effects triggered during spoke
 * approval/suspension/revocation: IdP creation, KAS management, COI updates,
 * certificate validation, Terraform generation, and URL/port helpers.
 *
 * Extracted from hub-spoke-registry.service.ts for modularity.
 *
 * @version 1.0.0
 * @date 2026-02-14
 */

import crypto from 'crypto';
import { X509Certificate } from 'crypto';
import { logger } from '../utils/logger';
import { opalClient } from './opal-client';
import type { ISpokeRegistration, ICertificateValidation, ISpokeStore } from './registry-types';

// ============================================
// CERTIFICATE VALIDATION
// ============================================

/**
 * Validate an X.509 certificate
 */
export async function validateCertificate(certificatePEM: string): Promise<ICertificateValidation> {
  const result: ICertificateValidation = {
    valid: false,
    fingerprint: '',
    algorithm: '',
    warnings: [],
    errors: [],
    validatedAt: new Date()
  };

  try {
    // Parse the certificate
    const cert = new X509Certificate(certificatePEM);

    // Calculate fingerprint
    result.fingerprint = crypto
      .createHash('sha256')
      .update(Buffer.from(certificatePEM))
      .digest('hex')
      .toUpperCase();

    // Get public key algorithm
    const pubKey = cert.publicKey;
    result.algorithm = pubKey.asymmetricKeyType || 'unknown';

    // Check validity dates
    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);

    if (now < validFrom) {
      result.errors.push(`Certificate not yet valid (valid from: ${validFrom.toISOString()})`);
    }

    if (now > validTo) {
      result.errors.push(`Certificate has expired (expired: ${validTo.toISOString()})`);
    }

    // Warn if expiring soon (30 days)
    const daysUntilExpiry = (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry > 0 && daysUntilExpiry < 30) {
      result.warnings.push(`Certificate expires in ${Math.floor(daysUntilExpiry)} days`);
    }

    // Check key size
    if (result.algorithm === 'rsa') {
      const keyDetails = pubKey.export({ type: 'spki', format: 'der' });
      // RSA key size approximation from DER length
      if (keyDetails.length < 270) {
        result.warnings.push('RSA key size may be less than 2048 bits');
      }
    }

    // Check for self-signed
    if (cert.issuer === cert.subject) {
      result.warnings.push('Certificate is self-signed');
    }

    result.valid = result.errors.length === 0;

  } catch (error) {
    result.errors.push(`Certificate parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    result.valid = false;
  }

  return result;
}

/**
 * Extract details from X.509 certificate
 */
export function extractCertificateDetails(certificatePEM: string): {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
} {
  const cert = new X509Certificate(certificatePEM);

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: new Date(cert.validFrom),
    validTo: new Date(cert.validTo)
  };
}

// ============================================
// PORT / URL HELPERS
// ============================================

/**
 * Get port offset for a country based on NATO convention
 * SSOT: Must match scripts/nato-countries.sh NATO_PORT_OFFSETS
 */
export function getPortOffsetForCountry(countryCode: string): number {
  // First check environment variable (set by deployment pipeline)
  const envOffset = process.env.SPOKE_PORT_OFFSET;
  if (envOffset) {
    return parseInt(envOffset, 10);
  }

  // NATO port offset convention - MUST match scripts/nato-countries.sh
  const portOffsets: Record<string, number> = {
    // Hub
    'USA': 0,    // 8443

    // NATO countries (alphabetical, offsets 1-31)
    'ALB': 1, 'BEL': 2, 'BGR': 3, 'CAN': 4, 'HRV': 5,
    'CZE': 6, 'DNK': 7, 'EST': 8, 'FIN': 9, 'FRA': 10,
    'DEU': 11, 'GRC': 12, 'HUN': 13, 'ISL': 14, 'ITA': 15,
    'LVA': 16, 'LTU': 17, 'LUX': 18, 'MNE': 19, 'NLD': 20,
    'MKD': 21, 'NOR': 22, 'POL': 23, 'PRT': 24, 'ROU': 25,
    'SVK': 26, 'SVN': 27, 'ESP': 28, 'SWE': 29, 'TUR': 30,
    'GBR': 31,  // 8474

    // Partner nations (offsets 32-39)
    'AUS': 32, 'NZL': 33, 'JPN': 34, 'KOR': 35, 'ISR': 36, 'UKR': 37,
  };
  return portOffsets[countryCode.toUpperCase()] || 0;
}

/**
 * Get hub IdP URL for reverse federation
 */
export function getHubIdpUrl(): string {
  // Try explicit environment variable
  if (process.env.HUB_IDP_URL) {
    return process.env.HUB_IDP_URL;
  }

  // Fallback to KEYCLOAK_URL with localhost mapping
  const keycloakUrl = process.env.KEYCLOAK_URL || 'https://localhost:8443';

  // Map container names to localhost for inter-spoke communication
  if (keycloakUrl.includes('keycloak:')) {
    return 'https://localhost:8443';  // USA Hub default (FIXED: was 8081)
  }

  return keycloakUrl;
}

/**
 * Get instance display name
 */
export function getInstanceName(instanceCode: string): string {
  const names: Record<string, string> = {
    'USA': 'United States',
    'FRA': 'France',
    'GBR': 'United Kingdom',
    'DEU': 'Germany',
    'CAN': 'Canada',
  };
  return names[instanceCode.toUpperCase()] || instanceCode;
}

/**
 * Get spoke's public IdP URL (browser-accessible)
 *
 * This is different from the internal Docker network URL.
 * Used for federation redirects where user's browser needs access.
 */
export function getSpokePublicIdpUrl(spokeInstanceCode: string): string {
  const code = spokeInstanceCode.toUpperCase();

  // Check environment variable first
  const envVar = `${code}_KEYCLOAK_PUBLIC_URL`;
  if (process.env[envVar]) {
    return process.env[envVar];
  }

  // For local development, use localhost port mapping
  if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    const portMap: Record<string, string> = {
      'USA': '8443',  // Hub Keycloak
      'FRA': '8444',
      'GBR': '8446',
      'DEU': '8447',
      'CAN': '8448',
    };
    const port = portMap[code] || '8443';
    return `https://localhost:${port}`;
  }

  // Production: Use instance's public domain
  const domainMap: Record<string, string> = {
    'USA': 'usa-idp.dive25.com',
    'FRA': 'fra-idp.dive25.com',
    'GBR': 'gbr-idp.dive25.com',
    'DEU': 'deu-idp.dive25.com',
    'CAN': 'can-idp.dive25.com',
  };
  const domain = domainMap[code] || `${code.toLowerCase()}-idp.dive25.com`;
  return `https://${domain}`;
}

/**
 * Get spoke's Keycloak admin password
 *
 * SECURITY BEST PRACTICE: Only retrieves password from spoke registration (MongoDB).
 * Spokes provide their admin password during registration for bidirectional federation.
 */
export async function getSpokeKeycloakPassword(store: ISpokeStore, spokeInstanceCode: string): Promise<string> {
  const code = spokeInstanceCode.toUpperCase();

  // ONLY SOURCE: Spoke registration in MongoDB
  const spoke = await store.findByInstanceCode(code);
  if (spoke?.keycloakAdminPassword) {
    logger.info('Using Keycloak password from spoke registration', {
      spokeInstanceCode: code,
      source: 'spoke_registration',
      passwordLength: spoke.keycloakAdminPassword.length
    });
    return spoke.keycloakAdminPassword;
  }

  // No password available - spoke must provide during registration
  throw new Error(
    `No Keycloak admin password available for spoke ${code}. ` +
    `Spoke must provide 'keycloakAdminPassword' field during registration. ` +
    `Security: Hub does NOT store spoke passwords in environment or GCP.`
  );
}

// ============================================
// FEDERATION IDP CREATION
// ============================================

/**
 * Create Keycloak Identity Provider configuration for approved spoke
 *
 * This is called automatically during spoke approval.
 * Creates bidirectional OIDC trust: Hub ↔ Spoke
 */
export async function createFederationIdP(spoke: ISpokeRegistration, store: ISpokeStore): Promise<void> {
  const { keycloakFederationService } = await import('./keycloak-federation.service');

  const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
  const spokeInstanceCode = spoke.instanceCode;

  logger.info('Auto-linking IdP for approved spoke', {
    spokeId: spoke.spokeId,
    hubInstance: hubInstanceCode,
    spokeInstance: spokeInstanceCode,
    spokeName: spoke.name,
    spokeIdpUrl: spoke.idpUrl
  });

  // Determine spoke realm name
  const spokeRealm = `dive-v3-broker-${spokeInstanceCode.toLowerCase()}`;

  // Determine hub (local) details for reverse IdP creation
  const hubRealmName = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
  const hubIdpUrl = getHubIdpUrl();
  const hubName = getInstanceName(hubInstanceCode);

  // Get spoke's Keycloak admin password for remote IdP creation
  const spokeKeycloakPassword = await getSpokeKeycloakPassword(store, spokeInstanceCode);

  // Determine URLs for different use cases
  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

  let spokeIdpUrlForValidation: string;
  let spokeIdpUrlForBrowser: string;
  let spokeKeycloakAdminUrl: string;

  if (isDevelopment) {
    spokeIdpUrlForValidation = spoke.idpUrl;
    spokeIdpUrlForBrowser = spoke.idpPublicUrl || getSpokePublicIdpUrl(spokeInstanceCode);
    spokeKeycloakAdminUrl = spoke.idpUrl;
  } else {
    spokeIdpUrlForValidation = spoke.idpPublicUrl || spoke.idpUrl;
    spokeIdpUrlForBrowser = spoke.idpPublicUrl || spoke.idpUrl;
    spokeKeycloakAdminUrl = spoke.idpPublicUrl || spoke.idpUrl;
  }

  logger.info('Federation URL strategy', {
    environment: isDevelopment ? 'development' : 'production',
    validationUrl: spokeIdpUrlForValidation,
    browserUrl: spokeIdpUrlForBrowser,
    adminUrl: spokeKeycloakAdminUrl,
    spokeInstance: spokeInstanceCode,
  });

  // Create TRUE BIDIRECTIONAL IdP (both directions)
  const result = await keycloakFederationService.createBidirectionalFederation({
    localInstanceCode: hubInstanceCode,
    remoteInstanceCode: spokeInstanceCode,
    remoteName: spoke.name,
    remoteIdpUrl: spokeIdpUrlForBrowser,
    remoteKeycloakAdminUrl: spokeKeycloakAdminUrl,
    remoteRealm: spokeRealm,
    localName: hubName,
    localIdpUrl: hubIdpUrl,
    localRealm: hubRealmName,
    remoteKeycloakAdminPassword: spokeKeycloakPassword,
    federationClientId: 'dive-v3-broker-usa'
  });

  logger.info('IdP federation auto-linked successfully (BIDIRECTIONAL)', {
    spokeId: spoke.spokeId,
    spokeInstance: spokeInstanceCode,
    direction1: `${result.local.alias} in ${hubInstanceCode}`,
    direction2: `${result.remote.alias} in ${spokeInstanceCode}`,
    bidirectional: true
  });

  // Store IdP alias in spoke metadata for future reference
  spoke.federationIdPAlias = result.local.alias;
  await store.save(spoke);
}

// ============================================
// HUB FEDERATION REGENERATION (Terraform)
// ============================================

/**
 * Regenerate Hub federation configuration and apply Terraform
 */
export async function regenerateHubFederation(
  spoke: ISpokeRegistration,
  listActiveSpokes: () => Promise<ISpokeRegistration[]>
): Promise<void> {
  logger.info('Regenerating Hub federation configuration', {
    spokeId: spoke.spokeId,
    instanceCode: spoke.instanceCode
  });

  const approvedSpokes = await listActiveSpokes();

  logger.info('Generating hub.auto.tfvars from MongoDB', {
    approvedSpokesCount: approvedSpokes.length,
    spokeCodes: approvedSpokes.map(s => s.instanceCode)
  });

  const autoTfvarsContent = generateHubAutoTfvars(approvedSpokes);

  const { terraformExecutor } = await import('../utils/terraform-executor');

  const tfAvailable = await terraformExecutor.checkAvailable();
  if (!tfAvailable) {
    throw new Error('Terraform not available - cannot regenerate Hub federation');
  }

  await terraformExecutor.writeAutoVars('hub', 'hub.auto.tfvars', autoTfvarsContent);

  logger.info('hub.auto.tfvars written, applying Terraform configuration...');

  const startTime = Date.now();
  const result = await terraformExecutor.apply('hub', {
    autoApprove: true,
    parallelism: 20,
    timeout: 600000,
  });

  const duration = Date.now() - startTime;

  if (result.success) {
    logger.info('Hub Terraform re-applied successfully', {
      duration,
      spokesCount: approvedSpokes.length,
      newIdP: `${spoke.instanceCode.toLowerCase()}-idp`,
      terraformExitCode: result.exitCode
    });
  } else {
    throw new Error(`Terraform apply failed: ${result.stderr}`);
  }
}

/**
 * Generate hub.auto.tfvars content from MongoDB approved spokes
 */
export function generateHubAutoTfvars(approvedSpokes: ISpokeRegistration[]): string {
  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

  let content = `# =============================================================================
# DIVE V3 Hub - Auto-Generated Federation Partners
# =============================================================================
# Auto-generated by Hub-Spoke Registry Service on ${new Date().toISOString()}
# Source: MongoDB federation_spokes collection (approved spokes only)
#
# DO NOT EDIT MANUALLY - This file is automatically regenerated when:
#   1. A spoke is approved
#   2. A spoke is suspended/revoked
#   3. Hub deployment runs
#
# MongoDB SSOT: ${approvedSpokes.length} approved spoke(s)
# =============================================================================

federation_partners = {
`;

  for (const spoke of approvedSpokes) {
    const code = spoke.instanceCode.toUpperCase();
    const codeLower = spoke.instanceCode.toLowerCase();

    let idpUrl: string;
    let idpInternalUrl: string;
    let frontendUrl: string;

    if (isDevelopment) {
      const portOffset = getPortOffsetForCountry(code);
      const keycloakHttpsPort = 8443 + portOffset;
      const frontendHttpPort = 3000 + portOffset;

      idpUrl = spoke.idpPublicUrl || `https://localhost:${keycloakHttpsPort}`;
      idpInternalUrl = spoke.idpUrl || `https://dive-spoke-${codeLower}-keycloak:8443`;
      frontendUrl = spoke.baseUrl || `https://localhost:${frontendHttpPort}`;
    } else {
      idpUrl = spoke.idpPublicUrl || spoke.idpUrl;
      idpInternalUrl = spoke.idpUrl;
      frontendUrl = spoke.baseUrl;
    }

    content += `  ${codeLower} = {
    instance_code         = "${code}"
    instance_name         = "${spoke.name}"
    idp_url               = "${idpUrl}"
    idp_internal_url      = "${idpInternalUrl}"
    frontend_url          = "${frontendUrl}"
    enabled               = true
    client_secret         = ""  # Loaded from GCP: dive-v3-federation-${codeLower}-usa
    disable_trust_manager = true
  }
`;
  }

  content += `}
`;

  return content;
}

// ============================================
// KAS REGISTRATION
// ============================================

/**
 * Auto-register spoke's KAS instance during approval
 */
export async function registerSpokeKAS(spoke: ISpokeRegistration): Promise<void> {
  const { mongoKasRegistryStore } = await import('../models/kas-registry.model');

  const instanceCode = spoke.instanceCode.toUpperCase();
  const kasId = `${instanceCode.toLowerCase()}-kas`;

  // Check if KAS already registered (idempotent)
  const existing = await mongoKasRegistryStore.findById(kasId);
  if (existing) {
    logger.info('KAS already registered for spoke', {
      kasId,
      instanceCode,
      status: existing.status
    });

    if (existing.status === 'suspended') {
      await mongoKasRegistryStore.approve(kasId);
      logger.info('Reactivated suspended KAS', { kasId, instanceCode });
    }

    return;
  }

  const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  const portOffset = getPortOffsetForCountry(instanceCode);

  const internalKasUrl = `https://dive-spoke-${instanceCode.toLowerCase()}-kas:8080`;
  const publicKasUrl = isDevelopment
    ? `https://localhost:${10000 + portOffset}`
    : `https://${instanceCode.toLowerCase()}-kas.dive25.com`;

  const spokeKeycloakHttpsPort = isDevelopment ? (8443 + portOffset) : 443;
  const spokeKeycloakIssuer = isDevelopment
    ? `https://localhost:${spokeKeycloakHttpsPort}/realms/dive-v3-broker-${instanceCode.toLowerCase()}`
    : `https://${instanceCode.toLowerCase()}-idp.dive25.com/realms/dive-v3-broker-${instanceCode.toLowerCase()}`;

  logger.info('Registering spoke KAS instance', {
    kasId,
    instanceCode,
    internalUrl: internalKasUrl,
    publicUrl: publicKasUrl,
    jwtIssuer: spokeKeycloakIssuer
  });

  await mongoKasRegistryStore.register({
    kasId,
    organization: spoke.name,
    countryCode: instanceCode,
    kasUrl: publicKasUrl,
    internalKasUrl,
    authMethod: 'jwt',
    authConfig: {
      jwtIssuer: spokeKeycloakIssuer
    },
    trustLevel: mapKASTrustLevel(spoke.trustLevel),
    supportedCountries: [instanceCode],
    supportedCOIs: spoke.allowedPolicyScopes.filter(s => s.startsWith('coi:')).map(s => s.replace('coi:', '')),
    metadata: {
      version: spoke.version || '1.0.0',
      capabilities: ['encrypt', 'decrypt', 'rewrap', 'policy-evaluation'],
      contact: `admin@${instanceCode.toLowerCase()}.dive25.com`,
      registeredAt: new Date(),
      lastHeartbeat: new Date()
    },
    enabled: true
  });

  // AUTO-APPROVE KAS
  await mongoKasRegistryStore.approve(kasId);

  // Set up KAS federation trust (bidirectional)
  const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
  const hubKasId = `${hubInstanceCode.toLowerCase()}-kas`;

  const hubAgreement = await mongoKasRegistryStore.getFederationAgreement(hubInstanceCode);
  const hubTrustedKAS = hubAgreement?.trustedKAS || [];
  if (!hubTrustedKAS.includes(kasId)) {
    hubTrustedKAS.push(kasId);
    await mongoKasRegistryStore.setFederationAgreement(
      hubInstanceCode,
      hubTrustedKAS,
      spoke.maxClassificationAllowed,
      spoke.allowedPolicyScopes.filter(s => s.startsWith('coi:')).map(s => s.replace('coi:', ''))
    );
  }

  await mongoKasRegistryStore.setFederationAgreement(
    instanceCode,
    [hubKasId],
    spoke.maxClassificationAllowed,
    spoke.allowedPolicyScopes.filter(s => s.startsWith('coi:')).map(s => s.replace('coi:', ''))
  );

  logger.info('KAS instance registered and approved automatically', {
    kasId,
    instanceCode,
    status: 'active',
    federationTrust: `${hubKasId} ↔ ${kasId}`,
    autoApproved: true
  });

  // PUBLISH KAS REGISTRY TO OPAL
  try {
    const { opalDataService } = await import('./opal-data.service');
    const publishResult = await opalDataService.publishKasRegistry();

    if (publishResult.success) {
      logger.info('KAS registry published to OPAL - all instances updated', {
        kasId,
        instanceCode,
        transactionId: publishResult.transactionId,
      });
    } else {
      logger.warn('Failed to publish KAS registry to OPAL', {
        kasId,
        instanceCode,
        error: publishResult.error,
        impact: 'Spokes may not discover this KAS until next OPAL sync'
      });
    }
  } catch (opalError) {
    logger.warn('Failed to publish KAS registry to OPAL (non-blocking)', {
      kasId,
      instanceCode,
      error: opalError instanceof Error ? opalError.message : 'Unknown error',
      impact: 'KAS registered in Hub MongoDB but not yet distributed to spokes'
    });
  }
}

/**
 * Map spoke trust level to KAS trust level
 */
export function mapKASTrustLevel(spokeTrustLevel: ISpokeRegistration['trustLevel']): 'high' | 'medium' | 'low' {
  switch (spokeTrustLevel) {
    case 'national':
    case 'bilateral':
      return 'high';
    case 'partner':
      return 'medium';
    case 'development':
    default:
      return 'low';
  }
}

/**
 * Suspend spoke's KAS instance
 */
export async function suspendSpokeKAS(spoke: ISpokeRegistration, reason: string): Promise<void> {
  const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
  const kasId = `${spoke.instanceCode.toLowerCase()}-kas`;

  await mongoKasRegistryStore.suspend(kasId, reason);
  logger.info('KAS suspended for spoke', { kasId, instanceCode: spoke.instanceCode, reason });
}

/**
 * Reactivate spoke's KAS instance
 */
export async function reactivateSpokeKAS(spoke: ISpokeRegistration): Promise<void> {
  const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
  const kasId = `${spoke.instanceCode.toLowerCase()}-kas`;

  const existing = await mongoKasRegistryStore.findById(kasId);
  if (existing && existing.status === 'suspended') {
    await mongoKasRegistryStore.approve(kasId);
    logger.info('KAS reactivated for spoke', { kasId, instanceCode: spoke.instanceCode });
  } else if (!existing) {
    await registerSpokeKAS(spoke);
  }
}

/**
 * Remove spoke's KAS instance (permanent)
 */
export async function removeSpokeKAS(spoke: ISpokeRegistration): Promise<void> {
  const { mongoKasRegistryStore } = await import('../models/kas-registry.model');
  const kasId = `${spoke.instanceCode.toLowerCase()}-kas`;

  const removed = await mongoKasRegistryStore.remove(kasId);
  if (removed) {
    logger.info('KAS removed for revoked spoke', { kasId, instanceCode: spoke.instanceCode });
  }

  // Remove from Hub's trusted KAS list
  const hubInstanceCode = process.env.INSTANCE_CODE || 'USA';
  const hubAgreement = await mongoKasRegistryStore.getFederationAgreement(hubInstanceCode);
  if (hubAgreement) {
    const updatedTrustedKAS = hubAgreement.trustedKAS.filter(k => k !== kasId);
    await mongoKasRegistryStore.setFederationAgreement(
      hubInstanceCode,
      updatedTrustedKAS,
      hubAgreement.maxClassification,
      hubAgreement.allowedCOIs
    );
  }
}

// ============================================
// COI MEMBERSHIP UPDATES
// ============================================

/**
 * Update COI memberships based on active federation
 */
export async function updateCoiMembershipsForFederation(store: ISpokeStore): Promise<void> {
  const { mongoCoiDefinitionStore } = await import('../models/coi-definition.model');

  const activeSpokes = await store.findByStatus('approved');
  const activeSpokeCountryCodes = activeSpokes.map(s => s.instanceCode.toUpperCase());

  const hubInstanceCode = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
  if (!activeSpokeCountryCodes.includes(hubInstanceCode)) {
    activeSpokeCountryCodes.push(hubInstanceCode);
  }

  await mongoCoiDefinitionStore.updateNATOFromFederation(activeSpokeCountryCodes);

  const coiMap = await mongoCoiDefinitionStore.getCoiMembershipMapForOpa();
  await opalClient.publishInlineData(
    'coi_definitions',
    coiMap,
    `Auto-update from federation (${activeSpokeCountryCodes.length} active instances)`
  );

  logger.info('COI memberships auto-updated and distributed via OPAL', {
    activeInstances: activeSpokeCountryCodes.length,
    instances: activeSpokeCountryCodes
  });
}
