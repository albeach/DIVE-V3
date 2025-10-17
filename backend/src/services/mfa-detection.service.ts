/**
 * @file mfa-detection.service.ts
 * @description Multi-Factor Authentication detection service
 * 
 * Phase 1: MFA capability detection
 * 
 * Detects MFA support from:
 * - OIDC discovery (ACR values, AMR claims, scopes)
 * - SAML metadata (AuthnContextClassRef)
 * - Documented security policies (uploaded by partner)
 * 
 * Scoring:
 * - Documented policy = 20 points
 * - Strong evidence (ACR/AMR) = 15 points
 * - Weak evidence (scope hints) = 10 points
 * - No evidence = 0 points
 */

import { logger } from '../utils/logger';
import { IMFACheckResult, IOIDCDiscoveryResult, ISAMLMetadataResult } from '../types/validation.types';

/**
 * MFA Detection Service
 * 
 * Analyzes IdP configuration to detect MFA capabilities
 */
class MFADetectionService {
  /**
   * Detect MFA support for OIDC IdP
   * 
   * @param discoveryData - OIDC discovery results
   * @param hasPolicyDoc - Whether partner uploaded MFA policy document
   * @returns MFA detection results with scoring
   */
  detectOIDCMFA(
    discoveryData: IOIDCDiscoveryResult,
    hasPolicyDoc: boolean = false
  ): IMFACheckResult {
    logger.debug('Detecting OIDC MFA support', {
      issuer: discoveryData.issuer,
      hasPolicyDoc,
    });

    const result: IMFACheckResult = {
      detected: false,
      evidence: [],
      score: 0,
      confidence: 'low',
      recommendations: [],
    };

    // Check for policy documentation (highest score)
    if (hasPolicyDoc) {
      result.detected = true;
      result.evidence.push('Partner provided MFA policy documentation');
      result.score = 20;
      result.confidence = 'high';
      
      logger.info('OIDC MFA detected via policy documentation', { issuer: discoveryData.issuer });
      return result;
    }

    // Check MFA support from discovery
    if (discoveryData.mfaSupport.detected) {
      result.detected = true;

      // Check ACR values (strong evidence)
      if (discoveryData.mfaSupport.acrValues.length > 0) {
        result.evidence.push(
          `ACR values indicate MFA support: ${discoveryData.mfaSupport.acrValues.join(', ')}`
        );
        result.score = 15;
        result.confidence = 'high';
      } else {
        // MFA detected but no specific ACR values (weaker evidence)
        result.evidence.push('Discovery indicates MFA support (via claims or scopes)');
        result.score = 10;
        result.confidence = 'medium';
      }

      logger.info('OIDC MFA detected via discovery', {
        issuer: discoveryData.issuer,
        confidence: result.confidence,
        score: result.score,
      });

      return result;
    }

    // No MFA evidence found
    result.detected = false;
    result.score = 0;
    result.confidence = 'low';
    result.recommendations.push('Upload MFA policy documentation if IdP supports multi-factor authentication');
    result.recommendations.push('Configure ACR values in OIDC discovery document to indicate MFA support');

    logger.info('OIDC MFA not detected', { issuer: discoveryData.issuer });

    return result;
  }

  /**
   * Detect MFA support for SAML IdP
   * 
   * @param metadataResult - SAML metadata parsing results
   * @param hasPolicyDoc - Whether partner uploaded MFA policy document
   * @returns MFA detection results with scoring
   */
  detectSAMLMFA(
    metadataResult: ISAMLMetadataResult,
    hasPolicyDoc: boolean = false
  ): IMFACheckResult {
    logger.debug('Detecting SAML MFA support', {
      entityId: metadataResult.entityId,
      hasPolicyDoc,
    });

    const result: IMFACheckResult = {
      detected: false,
      evidence: [],
      score: 0,
      confidence: 'low',
      recommendations: [],
    };

    // Check for policy documentation (highest score)
    if (hasPolicyDoc) {
      result.detected = true;
      result.evidence.push('Partner provided MFA policy documentation');
      result.score = 20;
      result.confidence = 'high';
      
      logger.info('SAML MFA detected via policy documentation', { entityId: metadataResult.entityId });
      return result;
    }

    // For Phase 1, SAML MFA detection is limited
    // Full AuthnContextClassRef parsing would require more complex metadata analysis
    // This is a pilot-appropriate simplification

    // Check if metadata contains MultiFactor context class (in warnings or other fields)
    const metadataString = JSON.stringify(metadataResult).toLowerCase();
    
    if (metadataString.includes('multifactor') || metadataString.includes('multi-factor')) {
      result.detected = true;
      result.evidence.push('Metadata indicates MultiFactor authentication context');
      result.score = 15;
      result.confidence = 'high';

      logger.info('SAML MFA detected via metadata analysis', { entityId: metadataResult.entityId });

      return result;
    }

    // No MFA evidence found
    result.detected = false;
    result.score = 0;
    result.confidence = 'low';
    result.recommendations.push('Upload MFA policy documentation if IdP supports multi-factor authentication');
    result.recommendations.push(
      'Ensure SAML metadata includes AuthnContextClassRef with MultiFactor context class'
    );

    logger.info('SAML MFA not detected', { entityId: metadataResult.entityId });

    return result;
  }

  /**
   * Generic MFA detection (when metadata/discovery not available)
   * 
   * @param hasPolicyDoc - Whether partner uploaded MFA policy document
   * @returns MFA detection results with scoring
   */
  detectGenericMFA(hasPolicyDoc: boolean = false): IMFACheckResult {
    logger.debug('Generic MFA detection', { hasPolicyDoc });

    const result: IMFACheckResult = {
      detected: hasPolicyDoc,
      evidence: hasPolicyDoc ? ['Partner provided MFA policy documentation'] : [],
      score: hasPolicyDoc ? 20 : 0,
      confidence: hasPolicyDoc ? 'high' : 'low',
      recommendations: [],
    };

    if (!hasPolicyDoc) {
      result.recommendations.push('Upload MFA policy documentation to receive MFA score');
    }

    return result;
  }

  /**
   * Validate MFA policy document
   * 
   * @param policyDocPath - Path to uploaded policy document
   * @returns Whether document appears to describe MFA policy
   * 
   * Note: For pilot, this is a simple check. Production would parse PDF/DOC
   * and validate content.
   */
  async validatePolicyDocument(policyDocPath: string): Promise<boolean> {
    logger.debug('Validating MFA policy document', { policyDocPath });

    // For Phase 1, assume document is valid if provided
    // Phase 2 could add PDF parsing to extract MFA details

    // Check file extension
    const validExtensions = ['.pdf', '.doc', '.docx', '.txt'];
    const hasValidExtension = validExtensions.some(ext => 
      policyDocPath.toLowerCase().endsWith(ext)
    );

    if (!hasValidExtension) {
      logger.warn('Invalid MFA policy document extension', { policyDocPath });
      return false;
    }

    logger.info('MFA policy document validated', { policyDocPath });
    return true;
  }
}

// Export singleton instance
export const mfaDetectionService = new MFADetectionService();

