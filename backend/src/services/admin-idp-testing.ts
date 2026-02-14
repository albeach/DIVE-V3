/**
 * Admin IdP Testing
 *
 * Tests Identity Provider connectivity for OIDC and SAML protocols.
 * Validates configuration completeness and endpoint reachability.
 *
 * Extracted from keycloak-admin.service.ts (Phase 4D decomposition).
 *
 * @module admin-idp-testing
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';
import { logger } from '../utils/logger';
import type {
  IIdentityProviderRepresentation,
  IIdPTestResult,
  IdPProtocol,
} from '../types/keycloak.types';

// ============================================
// TYPES
// ============================================

/**
 * Context for admin service extracted functions.
 * Provides the initialized legacy Keycloak admin client.
 */
export interface AdminServiceContext {
  client: KcAdminClient;
}

// ============================================
// IDP CONNECTIVITY TESTING
// ============================================

/**
 * Test Identity Provider connectivity.
 * Routes to OIDC or SAML-specific test based on protocol.
 */
export async function testIdentityProviderCore(
  ctx: AdminServiceContext,
  alias: string
): Promise<IIdPTestResult> {
  try {
    const idp = await ctx.client.identityProviders.findOne({ alias });

    if (!idp) {
      return {
        success: false,
        message: `Identity provider ${alias} not found`
      };
    }

    const protocol = idp.providerId as IdPProtocol;

    if (protocol === 'oidc') {
      return await testOIDCIdP(idp as IIdentityProviderRepresentation);
    } else if (protocol === 'saml') {
      return await testSAMLIdP(idp as IIdentityProviderRepresentation);
    } else {
      return {
        success: false,
        message: `Unknown protocol: ${protocol}`
      };
    }
  } catch (error) {
    logger.error('Failed to test identity provider', {
      alias,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Test failed'
    };
  }
}

/**
 * Test OIDC IdP connectivity.
 * Checks configuration completeness and discovery endpoint reachability.
 */
async function testOIDCIdP(idp: IIdentityProviderRepresentation): Promise<IIdPTestResult> {
  try {
    // Check if IdP configuration has required fields
    const config = idp.config || {};
    const issuer = config.issuer || config.authorizationUrl;

    logger.debug('Testing OIDC IdP', {
      alias: idp.alias,
      hasIssuer: !!issuer,
      hasAuthUrl: !!config.authorizationUrl,
      hasTokenUrl: !!config.tokenUrl,
      configKeys: Object.keys(config)
    });

    // For local/mock IdPs, just verify configuration exists
    if (!issuer && !config.authorizationUrl) {
      return {
        success: false,
        message: 'IdP configuration incomplete - missing issuer or authorization URL',
        details: {
          reachable: false,
          configKeys: Object.keys(config)
        }
      };
    }

    // For mock/local IdPs (localhost URLs), skip external connectivity test
    const isLocalIdP = issuer?.includes('localhost') || config.authorizationUrl?.includes('localhost');

    if (isLocalIdP) {
      return {
        success: true,
        message: 'Local IdP configuration valid (connectivity test skipped for localhost)',
        details: {
          reachable: true,
          isLocal: true,
          hasIssuer: !!issuer,
          hasAuthUrl: !!config.authorizationUrl,
          hasTokenUrl: !!config.tokenUrl
        }
      };
    }

    // For external IdPs, test OIDC discovery endpoint
    if (issuer) {
      try {
        const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
        const response = await axios.get(discoveryUrl, { timeout: 5000 });

        if (response.status === 200) {
          return {
            success: true,
            message: 'OIDC IdP reachable via discovery endpoint',
            details: {
              reachable: true,
              jwksValid: !!response.data.jwks_uri
            }
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `OIDC discovery endpoint unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }

    // Fallback: Configuration exists, assume it's valid
    return {
      success: true,
      message: 'IdP configuration exists (external connectivity not tested)',
      details: {
        reachable: false,
        configPresent: true
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Test SAML IdP connectivity.
 * Checks SSO URL configuration and endpoint reachability.
 */
async function testSAMLIdP(idp: IIdentityProviderRepresentation): Promise<IIdPTestResult> {
  try {
    const config = idp.config || {};
    const ssoUrl = config.singleSignOnServiceUrl;

    logger.debug('Testing SAML IdP', {
      alias: idp.alias,
      hasSsoUrl: !!ssoUrl,
      hasCertificate: !!config.signingCertificate,
      configKeys: Object.keys(config)
    });

    if (!ssoUrl) {
      return {
        success: false,
        message: 'SAML configuration incomplete - missing SSO URL',
        details: {
          reachable: false,
          configKeys: Object.keys(config)
        }
      };
    }

    // For mock/local IdPs (localhost URLs), skip external connectivity test
    const isLocalIdP = ssoUrl.includes('localhost');

    if (isLocalIdP) {
      return {
        success: true,
        message: 'Local SAML IdP configuration valid (connectivity test skipped for localhost)',
        details: {
          reachable: true,
          isLocal: true,
          hasSsoUrl: !!ssoUrl,
          hasCertificate: !!config.signingCertificate
        }
      };
    }

    // For external IdPs, test SAML endpoint reachability
    try {
      const response = await axios.get(ssoUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept 4xx as reachable
      });

      if (response.status < 500) {
        return {
          success: true,
          message: 'SAML IdP endpoint reachable',
          details: {
            reachable: true,
            certificateValid: !!config.signingCertificate
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `SAML endpoint unreachable: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    return {
      success: true,
      message: 'SAML configuration exists (external connectivity not tested)',
      details: {
        reachable: false,
        configPresent: true
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
