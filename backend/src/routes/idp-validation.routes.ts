/**
 * IdP Validation Routes
 * 
 * Real-time validation endpoints for IdP wizard
 * Allows frontend to validate configuration BEFORE submission
 */

import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';
import {
    validateOIDCDiscoveryHandler,
    validateSAMLMetadataHandler,
    parseOIDCMetadataHandler,
    parseSAMLMetadataFileHandler
} from '../controllers/idp-validation.controller';

const router = Router();

// All validation routes require admin authentication
router.use(adminAuthMiddleware);

/**
 * POST /api/admin/idps/validate/oidc-discovery
 * Test OIDC discovery endpoint (called from frontend)
 * 
 * Body: { issuer: string }
 * Returns: { valid: boolean, discovery: {...}, tls: {...} }
 */
router.post('/validate/oidc-discovery', validateOIDCDiscoveryHandler);

/**
 * POST /api/admin/idps/validate/saml-metadata
 * Validate SAML metadata XML
 * 
 * Body: { metadataXml: string }
 * Returns: { valid: boolean, metadata: {...}, tls: {...} }
 */
router.post('/validate/saml-metadata', validateSAMLMetadataHandler);

/**
 * POST /api/admin/idps/parse/oidc-metadata
 * Upload OIDC discovery JSON file and auto-populate form
 * 
 * Body: { discoveryJson: object | string }
 * Returns: { formData: { issuer, authorizationUrl, tokenUrl, ... } }
 */
router.post('/parse/oidc-metadata', parseOIDCMetadataHandler);

/**
 * POST /api/admin/idps/parse/saml-metadata
 * Upload SAML metadata XML and auto-populate form
 * 
 * Body: { metadataXml: string }
 * Returns: { formData: { entityId, ssoUrl, certificate, ... } }
 */
router.post('/parse/saml-metadata', parseSAMLMetadataFileHandler);

export default router;
