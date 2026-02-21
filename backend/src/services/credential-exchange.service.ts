/**
 * DIVE V3 - Credential Exchange Service
 *
 * Orchestrates mutual OIDC client credential exchange during federation enrollment.
 * Each side creates an OIDC client on its OWN Keycloak and shares only the public
 * metadata (clientId, clientSecret, issuerUrl, discoveryUrl).
 *
 * This eliminates the V1 requirement for remoteKeycloakAdminPassword to cross the wire.
 *
 * Flow:
 *   1. Hub admin approves enrollment
 *   2. Hub creates OIDC client on Hub's Keycloak → stores approverCredentials
 *   3. Spoke fetches Hub credentials, creates reciprocal client on Spoke's Keycloak
 *   4. Spoke pushes requesterCredentials back to Hub
 *   5. EnrollmentService auto-transitions to credentials_exchanged
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import crypto from 'crypto';
import { logger } from '../utils/logger';
import { keycloakFederationService } from './keycloak-federation.service';
import { enrollmentService } from './enrollment.service';
import type { IEnrollment } from '../models/enrollment.model';

// ============================================
// TYPES
// ============================================

export interface LocalClientCredentials {
  oidcClientId: string;
  oidcClientSecret: string;
  oidcIssuerUrl: string;
  oidcDiscoveryUrl: string;
}

// ============================================
// CREDENTIAL EXCHANGE SERVICE
// ============================================

class CredentialExchangeService {
  /**
   * Generate approver credentials after admin approval.
   *
   * Creates an OIDC client on the local Keycloak for the enrollee,
   * then stores the client metadata in the enrollment record.
   *
   * The client is named dive-v3-broker-{enrolleeInstanceCode} — matching
   * V1 convention where the client name identifies the partner.
   *
   * @param enrollment - The approved enrollment record
   */
  async generateApproverCredentials(enrollment: IEnrollment): Promise<void> {
    const { enrollmentId, requesterInstanceCode, requesterIdpUrl } = enrollment;

    logger.info('Generating approver credentials for enrollment', {
      enrollmentId,
      requesterInstanceCode,
    });

    const clientId = `dive-v3-broker-${requesterInstanceCode.toLowerCase()}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const requesterRealm = `dive-v3-broker-${requesterInstanceCode.toLowerCase()}`;

    // Create OIDC client on local Keycloak using existing federation client setup
    await keycloakFederationService.ensureFederationClient(
      clientId,
      clientSecret,
      requesterIdpUrl,
      requesterRealm,
    );

    // Build credential metadata using public-facing URLs
    const keycloakPublicUrl = process.env.KEYCLOAK_PUBLIC_URL
      || process.env.PUBLIC_IDP_URL
      || process.env.KEYCLOAK_URL
      || 'https://localhost:8443';
    const realm = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';

    const credentials: NonNullable<IEnrollment['approverCredentials']> = {
      oidcClientId: clientId,
      oidcClientSecret: clientSecret,
      oidcIssuerUrl: `${keycloakPublicUrl}/realms/${realm}`,
      oidcDiscoveryUrl: `${keycloakPublicUrl}/realms/${realm}/.well-known/openid-configuration`,
    };

    // Store in enrollment record
    await enrollmentService.storeApproverCredentials(enrollmentId, credentials);

    logger.info('Approver credentials generated and stored', {
      enrollmentId,
      clientId,
      oidcIssuerUrl: credentials.oidcIssuerUrl,
    });
  }

  /**
   * Create a reciprocal OIDC client on the local Keycloak for a federation partner.
   *
   * Called by a spoke to create a client that the partner (hub) will use
   * via their IdP configuration.
   *
   * @param partnerInstanceCode - The partner's instance code (e.g., 'USA')
   * @param partnerIdpUrl - The partner's public Keycloak URL
   * @param partnerRealm - The partner's Keycloak realm
   * @returns The local client metadata to share with the partner
   */
  async generateLocalClient(
    partnerInstanceCode: string,
    partnerIdpUrl: string,
    partnerRealm: string,
  ): Promise<LocalClientCredentials> {
    logger.info('Creating local federation client for partner', {
      partnerInstanceCode,
      partnerIdpUrl,
      partnerRealm,
    });

    const clientId = `dive-v3-broker-${partnerInstanceCode.toLowerCase()}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');

    // Create OIDC client on local Keycloak
    await keycloakFederationService.ensureFederationClient(
      clientId,
      clientSecret,
      partnerIdpUrl,
      partnerRealm,
    );

    // Build credential metadata using public-facing URLs
    const keycloakPublicUrl = process.env.KEYCLOAK_PUBLIC_URL
      || process.env.PUBLIC_IDP_URL
      || process.env.KEYCLOAK_URL
      || 'https://localhost:8443';
    const realm = process.env.KEYCLOAK_REALM
      || `dive-v3-broker-${(process.env.INSTANCE_CODE || 'USA').toLowerCase()}`;

    const credentials: LocalClientCredentials = {
      oidcClientId: clientId,
      oidcClientSecret: clientSecret,
      oidcIssuerUrl: `${keycloakPublicUrl}/realms/${realm}`,
      oidcDiscoveryUrl: `${keycloakPublicUrl}/realms/${realm}/.well-known/openid-configuration`,
    };

    logger.info('Local federation client created', {
      clientId,
      partnerInstanceCode,
      oidcIssuerUrl: credentials.oidcIssuerUrl,
    });

    return credentials;
  }
}

// Singleton
export const credentialExchangeService = new CredentialExchangeService();
