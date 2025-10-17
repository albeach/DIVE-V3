/**
 * IdP Validation Controller
 * 
 * Real-time validation endpoints for IdP configuration
 * Called by frontend BEFORE submission to validate endpoints
 */

import { Request, Response } from 'express';
import { oidcDiscoveryService } from '../services/oidc-discovery.service';
import { samlMetadataParserService } from '../services/saml-metadata-parser.service';
import { idpValidationService } from '../services/idp-validation.service';
import { logger } from '../utils/logger';

/**
 * POST /api/admin/idps/validate/oidc-discovery
 * Test OIDC discovery endpoint
 */
export const validateOIDCDiscoveryHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { issuer } = req.body;
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        if (!issuer) {
            res.status(400).json({
                success: false,
                error: 'Missing issuer URL'
            });
            return;
        }

        // Validate URL format
        try {
            const url = new URL(issuer);
            if (url.protocol !== 'https:') {
                res.status(400).json({
                    success: false,
                    valid: false,
                    error: 'Issuer must use HTTPS protocol'
                });
                return;
            }
        } catch (e) {
            res.status(400).json({
                success: false,
                valid: false,
                error: 'Invalid URL format'
            });
            return;
        }

        // Test OIDC discovery
        const discoveryResult = await oidcDiscoveryService.validateOIDCDiscovery(issuer);

        // Test TLS
        const tlsResult = await idpValidationService.validateTLS(issuer);

        res.status(200).json({
            success: true,
            valid: discoveryResult.valid,
            discovery: {
                issuer: discoveryResult.issuer,
                endpoints: discoveryResult.endpoints,
                jwks: discoveryResult.jwks,
                errors: discoveryResult.errors,
                warnings: discoveryResult.warnings
            },
            tls: {
                pass: tlsResult.pass,
                version: tlsResult.version,
                cipher: tlsResult.cipher,
                certificateValid: tlsResult.certificateValid
            }
        });

    } catch (error) {
        logger.error('OIDC discovery validation failed', {
            requestId,
            issuer,
            error: error instanceof Error ? error.message : 'Unknown'
        });

        res.status(200).json({
            success: true,
            valid: false,
            error: error instanceof Error ? error.message : 'Validation failed'
        });
    }
};

/**
 * POST /api/admin/idps/validate/saml-metadata
 * Parse and validate SAML metadata XML
 */
export const validateSAMLMetadataHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { metadataXml } = req.body;
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        if (!metadataXml) {
            res.status(400).json({
                success: false,
                error: 'Missing SAML metadata XML'
            });
            return;
        }

        // Parse metadata
        const metadataResult = await samlMetadataParserService.parseSAMLMetadata(metadataXml);

        // Test SSO URL TLS if available
        let tlsResult = null;
        if (metadataResult.valid && metadataResult.ssoUrl) {
            tlsResult = await idpValidationService.validateTLS(metadataResult.ssoUrl);
        }

        res.status(200).json({
            success: true,
            valid: metadataResult.valid,
            metadata: {
                entityId: metadataResult.entityId,
                ssoUrl: metadataResult.ssoUrl,
                sloUrl: metadataResult.sloUrl,
                certificate: metadataResult.certificate,
                signatureAlgorithm: metadataResult.signatureAlgorithm,
                errors: metadataResult.errors,
                warnings: metadataResult.warnings
            },
            tls: tlsResult
        });

    } catch (error) {
        logger.error('SAML metadata validation failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown'
        });

        res.status(200).json({
            success: true,
            valid: false,
            error: error instanceof Error ? error.message : 'Validation failed'
        });
    }
};

/**
 * POST /api/admin/idps/parse/oidc-metadata
 * Upload OIDC discovery JSON and auto-populate form
 */
export const parseOIDCMetadataHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { discoveryJson } = req.body;

    try {
        if (!discoveryJson) {
            res.status(400).json({
                success: false,
                error: 'Missing OIDC discovery JSON'
            });
            return;
        }

        // Parse JSON
        const discovery = typeof discoveryJson === 'string' 
            ? JSON.parse(discoveryJson) 
            : discoveryJson;

        // Extract and return form data
        res.status(200).json({
            success: true,
            formData: {
                issuer: discovery.issuer,
                authorizationUrl: discovery.authorization_endpoint,
                tokenUrl: discovery.token_endpoint,
                userInfoUrl: discovery.userinfo_endpoint,
                jwksUrl: discovery.jwks_uri,
                defaultScopes: 'openid profile email'
            }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Invalid JSON'
        });
    }
};

/**
 * POST /api/admin/idps/parse/saml-metadata
 * Upload SAML metadata XML and auto-populate form
 */
export const parseSAMLMetadataFileHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const { metadataXml } = req.body;

    try {
        if (!metadataXml) {
            res.status(400).json({
                success: false,
                error: 'Missing SAML metadata XML'
            });
            return;
        }

        // Parse metadata
        const metadata = await samlMetadataParserService.parseSAMLMetadata(metadataXml);

        if (!metadata.valid) {
            res.status(400).json({
                success: false,
                error: 'Invalid SAML metadata',
                errors: metadata.errors
            });
            return;
        }

        // Extract and return form data
        res.status(200).json({
            success: true,
            formData: {
                entityId: metadata.entityId,
                singleSignOnServiceUrl: metadata.ssoUrl,
                singleLogoutServiceUrl: metadata.sloUrl,
                certificate: metadata.certificate,
                signatureAlgorithm: metadata.signatureAlgorithm
            }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Parse failed'
        });
    }
};

