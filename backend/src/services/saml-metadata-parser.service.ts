/**
 * @file saml-metadata-parser.service.ts
 * @description SAML 2.0 metadata XML parser and validator
 * 
 * Phase 1: Automated SAML metadata validation
 * 
 * Parses and validates:
 * - SAML 2.0 metadata XML structure
 * - Entity ID and SSO/SLO endpoints
 * - X.509 certificates (expiry, validity)
 * - Signature algorithms
 * 
 * Pilot-appropriate: Allows self-signed certificates with warning
 */

import { parseStringPromise } from 'xml2js';
import forge from 'node-forge';
import { logger } from '../utils/logger';
import { ISAMLMetadataResult, ICertificateInfo } from '../types/validation.types';

/**
 * SAML Metadata Parser Service
 * 
 * Validates SAML 2.0 metadata XML and extracts configuration details
 */
class SAMLMetadataParserService {
  /**
   * Parse and validate SAML metadata XML
   * 
   * @param metadataXML - The SAML metadata XML string
   * @returns Parsed metadata with validation results
   */
  async parseSAMLMetadata(metadataXML: string): Promise<ISAMLMetadataResult> {
    const startTime = Date.now();
    logger.debug('Parsing SAML metadata', { xmlLength: metadataXML.length });

    const result: ISAMLMetadataResult = {
      valid: false,
      entityId: '',
      ssoUrl: '',
      sloUrl: undefined,
      certificate: {
        valid: false,
        notBefore: '',
        notAfter: '',
        daysUntilExpiry: 0,
        issuer: '',
        warnings: [],
      },
      signatureAlgorithm: '',
      errors: [],
      warnings: [],
    };

    try {
      // Parse XML
      const parsedXML = await parseStringPromise(metadataXML, {
        trim: true,
        explicitArray: true,
        tagNameProcessors: [this.stripNamespace],
      });

      // Validate root element
      if (!parsedXML.EntityDescriptor && !parsedXML.EntitiesDescriptor) {
        result.errors.push('Invalid SAML metadata: Missing EntityDescriptor root element');
        return result;
      }

      // Handle EntitiesDescriptor (contains multiple EntityDescriptors)
      let entityDescriptor = parsedXML.EntityDescriptor;
      if (!entityDescriptor && parsedXML.EntitiesDescriptor) {
        const entitiesDescriptor = parsedXML.EntitiesDescriptor;
        if (entitiesDescriptor.EntityDescriptor && entitiesDescriptor.EntityDescriptor.length > 0) {
          entityDescriptor = entitiesDescriptor.EntityDescriptor[0];
        }
      }

      if (!entityDescriptor) {
        result.errors.push('No EntityDescriptor found in metadata');
        return result;
      }

      // Extract Entity ID
      const entityIdAttr = entityDescriptor.$ && entityDescriptor.$.entityID;
      if (!entityIdAttr) {
        result.errors.push('Missing required attribute: entityID');
        return result;
      }
      result.entityId = entityIdAttr;

      // Find IDPSSODescriptor
      const idpSSODescriptor = entityDescriptor.IDPSSODescriptor?.[0];
      if (!idpSSODescriptor) {
        result.errors.push('Missing IDPSSODescriptor element');
        return result;
      }

      // Extract SingleSignOnService
      const ssoServices = idpSSODescriptor.SingleSignOnService;
      if (!ssoServices || ssoServices.length === 0) {
        result.errors.push('Missing SingleSignOnService element');
        return result;
      }

      // Find HTTP-Redirect or HTTP-POST binding
      const ssoService = ssoServices.find(
        (service: any) =>
          service.$.Binding &&
          (service.$.Binding.includes('HTTP-Redirect') || service.$.Binding.includes('HTTP-POST'))
      );

      if (!ssoService || !ssoService.$.Location) {
        result.errors.push('No valid SingleSignOnService endpoint found');
        return result;
      }
      result.ssoUrl = ssoService.$.Location;

      // Extract SingleLogoutService (optional)
      const sloServices = idpSSODescriptor.SingleLogoutService;
      if (sloServices && sloServices.length > 0) {
        const sloService = sloServices.find(
          (service: any) =>
            service.$.Binding &&
            (service.$.Binding.includes('HTTP-Redirect') || service.$.Binding.includes('HTTP-POST'))
        );

        if (sloService && sloService.$.Location) {
          result.sloUrl = sloService.$.Location;
        }
      }

      // Extract certificate
      const keyDescriptors = idpSSODescriptor.KeyDescriptor;
      if (keyDescriptors && keyDescriptors.length > 0) {
        // Find signing key
        const signingKey = keyDescriptors.find(
          (kd: any) => !kd.$.use || kd.$.use === 'signing'
        );

        if (signingKey) {
          const x509Data = signingKey.KeyInfo?.[0]?.X509Data?.[0];
          const x509Cert = x509Data?.X509Certificate?.[0];

          if (x509Cert) {
            result.certificate = this.parseCertificate(x509Cert);
          } else {
            result.warnings.push('No X509Certificate found in KeyDescriptor');
          }
        } else {
          result.warnings.push('No signing KeyDescriptor found');
        }
      } else {
        result.warnings.push('No KeyDescriptor elements found');
      }

      // Extract signature algorithm
      const signature = entityDescriptor.Signature?.[0] || idpSSODescriptor.Signature?.[0];
      if (signature) {
        const signedInfo = signature.SignedInfo?.[0];
        const signatureMethod = signedInfo?.SignatureMethod?.[0];
        const algorithm = signatureMethod?.$.Algorithm;

        if (algorithm) {
          result.signatureAlgorithm = algorithm;
        } else {
          result.warnings.push('No signature algorithm found in Signature element');
        }
      } else {
        // No signature in metadata (common for test IdPs)
        result.warnings.push('Metadata is not signed (acceptable for pilot)');
      }

      // If no signature algorithm extracted, infer from certificate
      if (!result.signatureAlgorithm) {
        result.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'; // Assume SHA-256 as default
        result.warnings.push('Signature algorithm not specified; assuming SHA-256');
      }

      // Validation successful
      result.valid = true;

      const duration = Date.now() - startTime;
      logger.info('SAML metadata parsing complete', {
        entityId: result.entityId,
        ssoUrl: result.ssoUrl,
        certificateValid: result.certificate.valid,
        durationMs: duration,
      });

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('SAML metadata parsing failed', { error: error.message, durationMs: duration });

      result.valid = false;
      if (error.message.includes('XML')) {
        result.errors.push(`Invalid XML: ${error.message}`);
      } else {
        result.errors.push(`Parsing error: ${error.message}`);
      }

      return result;
    }
  }

  /**
   * Parse X.509 certificate and validate
   * 
   * @private
   * @param certPEM - Certificate in PEM format (base64, no headers)
   * @returns Certificate information with validity check
   */
  private parseCertificate(certPEM: string): ICertificateInfo {
    const certInfo: ICertificateInfo = {
      valid: false,
      notBefore: '',
      notAfter: '',
      daysUntilExpiry: 0,
      issuer: '',
      subject: '',
      warnings: [],
    };

    try {
      // Remove whitespace and newlines
      const cleanCert = certPEM.replace(/\s/g, '');

      // Convert to PEM format with headers
      const pemCert = `-----BEGIN CERTIFICATE-----\n${cleanCert}\n-----END CERTIFICATE-----`;

      // Parse certificate using node-forge
      const cert = forge.pki.certificateFromPem(pemCert);

      // Extract dates
      const notBefore = cert.validity.notBefore;
      const notAfter = cert.validity.notAfter;
      const now = new Date();

      certInfo.notBefore = notBefore.toISOString();
      certInfo.notAfter = notAfter.toISOString();

      // Calculate days until expiry
      const msUntilExpiry = notAfter.getTime() - now.getTime();
      certInfo.daysUntilExpiry = Math.floor(msUntilExpiry / (1000 * 60 * 60 * 24));

      // Extract issuer and subject
      certInfo.issuer = this.formatDN(cert.issuer);
      certInfo.subject = this.formatDN(cert.subject);

      // Check validity period
      if (now < notBefore) {
        certInfo.valid = false;
        certInfo.warnings.push('Certificate not yet valid');
      } else if (now > notAfter) {
        certInfo.valid = false;
        certInfo.warnings.push('Certificate has expired');
      } else {
        certInfo.valid = true;

        // Warn if expiring soon
        if (certInfo.daysUntilExpiry < 30) {
          certInfo.warnings.push(`Certificate expires in ${certInfo.daysUntilExpiry} days`);
        }
      }

      // Check if self-signed
      if (certInfo.issuer === certInfo.subject) {
        certInfo.warnings.push('Certificate is self-signed (acceptable for pilot)');
      }

      logger.debug('Certificate parsed successfully', {
        issuer: certInfo.issuer,
        subject: certInfo.subject,
        daysUntilExpiry: certInfo.daysUntilExpiry,
      });

      return certInfo;
    } catch (error: any) {
      logger.error('Certificate parsing failed', { error: error.message });

      certInfo.valid = false;
      certInfo.warnings.push(`Certificate parsing error: ${error.message}`);

      return certInfo;
    }
  }

  /**
   * Format Distinguished Name (DN) for display
   * 
   * @private
   */
  private formatDN(dn: any): string {
    // node-forge returns an object with attributes array
    const attributes = dn.attributes || [];
    return attributes
      .map((attr: any) => `${attr.shortName || attr.name}=${attr.value}`)
      .join(', ');
  }

  /**
   * Strip XML namespace prefixes from tag names
   * 
   * @private
   */
  private stripNamespace(name: string): string {
    return name.replace(/^.*:/, '');
  }
}

// Export singleton instance
export const samlMetadataParserService = new SAMLMetadataParserService();
