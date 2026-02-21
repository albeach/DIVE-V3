/**
 * Admin Certificate Management Controller
 * 
 * REST API endpoints for certificate administration:
 * - GET /api/admin/certificates - List all certificates
 * - GET /api/admin/certificates/health - Certificate health dashboard
 * - POST /api/admin/certificates/rotate - Trigger certificate rotation
 * - GET /api/admin/certificates/revocation-list - View CRL
 * - POST /api/admin/certificates/revoke - Revoke a certificate
 * 
 * Security:
 * - All endpoints require admin authentication
 * - Rate limiting: 10 requests per minute
 * - Audit logging for all operations
 */

import { Request, Response } from 'express';
import { certificateManager } from '../utils/certificate-manager';
import { certificateLifecycleService } from '../services/certificate-lifecycle.service';
import { crlManager } from '../utils/crl-manager';
import { logger } from '../utils/logger';

/**
 * List all certificates with status
 * GET /api/admin/certificates
 */
export async function listCertificates(req: Request, res: Response): Promise<void> {
    try {
        logger.info('Admin: List certificates requested', {
            adminUser: req.user?.uniqueID || 'unknown'
        });

        // Load three-tier hierarchy
        const hierarchy = await certificateManager.loadThreeTierHierarchy();

        // Get health for each certificate
        const rootHealth = certificateLifecycleService.checkCertificateExpiry(hierarchy.root, 'root');
        const intermediateHealth = certificateLifecycleService.checkCertificateExpiry(hierarchy.intermediate, 'intermediate');
        const signingHealth = certificateLifecycleService.checkCertificateExpiry(hierarchy.signing, 'signing');

        // Get certificate paths
        const paths = certificateManager.resolveCertificatePaths();

        const certificates = [
            {
                type: 'root',
                subject: hierarchy.root.subject,
                issuer: hierarchy.root.issuer,
                validFrom: hierarchy.root.validFrom,
                validTo: hierarchy.root.validTo,
                daysRemaining: rootHealth.daysRemaining,
                status: rootHealth.status,
                serialNumber: hierarchy.root.serialNumber,
                path: paths.rootCertPath,
                alerts: rootHealth.alerts.length
            },
            {
                type: 'intermediate',
                subject: hierarchy.intermediate.subject,
                issuer: hierarchy.intermediate.issuer,
                validFrom: hierarchy.intermediate.validFrom,
                validTo: hierarchy.intermediate.validTo,
                daysRemaining: intermediateHealth.daysRemaining,
                status: intermediateHealth.status,
                serialNumber: hierarchy.intermediate.serialNumber,
                path: paths.intermediateCertPath,
                alerts: intermediateHealth.alerts.length
            },
            {
                type: 'signing',
                subject: hierarchy.signing.subject,
                issuer: hierarchy.signing.issuer,
                validFrom: hierarchy.signing.validFrom,
                validTo: hierarchy.signing.validTo,
                daysRemaining: signingHealth.daysRemaining,
                status: signingHealth.status,
                serialNumber: hierarchy.signing.serialNumber,
                path: paths.signingCertPath,
                alerts: signingHealth.alerts.length
            }
        ];

        // Calculate summary
        const summary = {
            total: certificates.length,
            valid: certificates.filter(c => c.status === 'valid').length,
            expiringSoon: certificates.filter(c => c.status === 'expiring-soon').length,
            expired: certificates.filter(c => c.status === 'expired').length
        };

        res.json({
            success: true,
            certificates,
            summary
        });

    } catch (error) {
        logger.error('Failed to list certificates', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to list certificates',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Get certificate health dashboard
 * GET /api/admin/certificates/health
 */
export async function getCertificateHealth(req: Request, res: Response): Promise<void> {
    try {
        logger.info('Admin: Certificate health dashboard requested', {
            adminUser: req.user?.uniqueID || 'unknown'
        });

        // Get dashboard data
        const dashboard = await certificateLifecycleService.getDashboardData();

        // Get CRL stats
        const paths = certificateManager.resolveCertificatePaths();
        const crlDir = paths.rootCertPath.replace('/ca/root.crt', '/crl');

        let crlStats = null;
        try {
            const rootCRLStats = await crlManager.getCRLStats(`${crlDir}/root-crl.pem`);
            const intermediateCRLStats = await crlManager.getCRLStats(`${crlDir}/intermediate-crl.pem`);

            crlStats = {
                root: rootCRLStats,
                intermediate: intermediateCRLStats
            };
        } catch (error) {
            logger.warn('Failed to load CRL stats', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }

        res.json({
            success: true,
            dashboard,
            crlStats
        });

    } catch (error) {
        logger.error('Failed to get certificate health', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to get certificate health',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Rotate signing certificate
 * POST /api/admin/certificates/rotate
 * 
 * Body: { overlapPeriodDays?: number }
 */
export async function rotateCertificate(req: Request, res: Response): Promise<void> {
    try {
        const { overlapPeriodDays = 7 } = req.body;

        logger.warn('Admin: Certificate rotation initiated', {
            adminUser: req.user?.uniqueID || 'unknown',
            overlapPeriodDays
        });

        // Check if rotation already in progress
        const currentStatus = await certificateLifecycleService.isRotationInProgress();
        if (currentStatus.inProgress) {
            res.status(400).json({
                success: false,
                error: 'Rotation already in progress',
                rotationStatus: currentStatus
            });
            return;
        }

        // Start rotation
        const rotationStatus = await certificateLifecycleService.startRotation(
            'signing',
            overlapPeriodDays
        );

        // Generate new signing certificate during rotation
        try {
            await certificateManager.generatePolicySigningCertificate({
                type: 'signing',
                commonName: 'DIVE V3 Policy Signer (Rotated)',
                organization: 'DIVE V3',
                organizationalUnit: 'Policy Signing',
                country: 'US',
                validityDays: 730, // 2 years
            });
            logger.info('New signing certificate generated during rotation');
        } catch (certError) {
            logger.warn('Certificate generation deferred — complete manually or via Vault PKI', {
                error: certError instanceof Error ? certError.message : 'Unknown error'
            });
        }

        res.json({
            success: true,
            message: 'Certificate rotation initiated',
            rotationStatus,
            instructions: [
                'Rotation overlap period started',
                'Both old and new certificates are valid during overlap',
                `Overlap period ends: ${rotationStatus.overlapEndDate?.toISOString()}`,
                'Call POST /api/admin/certificates/rotation/complete after overlap period'
            ]
        });

    } catch (error) {
        logger.error('Failed to rotate certificate', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to rotate certificate',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Complete certificate rotation
 * POST /api/admin/certificates/rotation/complete
 */
export async function completeRotation(req: Request, res: Response): Promise<void> {
    try {
        logger.warn('Admin: Certificate rotation completion requested', {
            adminUser: req.user?.uniqueID || 'unknown'
        });

        // Check if rotation in progress
        const status = await certificateLifecycleService.isRotationInProgress();
        if (!status.inProgress) {
            res.status(400).json({
                success: false,
                error: 'No rotation in progress'
            });
            return;
        }

        // Complete rotation
        await certificateLifecycleService.completeRotation();

        res.json({
            success: true,
            message: 'Certificate rotation completed successfully',
            certificateType: status.certificateType
        });

    } catch (error) {
        logger.error('Failed to complete rotation', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to complete rotation',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Rollback certificate rotation
 * POST /api/admin/certificates/rotation/rollback
 */
export async function rollbackRotation(req: Request, res: Response): Promise<void> {
    try {
        logger.warn('Admin: Certificate rotation rollback requested', {
            adminUser: req.user?.uniqueID || 'unknown'
        });

        // Rollback rotation
        await certificateLifecycleService.rollbackRotation();

        res.json({
            success: true,
            message: 'Certificate rotation rolled back successfully'
        });

    } catch (error) {
        logger.error('Failed to rollback rotation', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to rollback rotation',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Get certificate revocation list
 * GET /api/admin/certificates/revocation-list
 * 
 * Query: ?ca=root|intermediate
 */
export async function getRevocationList(req: Request, res: Response): Promise<void> {
    try {
        const caType = req.query.ca as string || 'intermediate';

        logger.info('Admin: Revocation list requested', {
            adminUser: req.user?.uniqueID || 'unknown',
            caType
        });

        // Get CRL path
        const paths = certificateManager.resolveCertificatePaths();
        const crlDir = paths.rootCertPath.replace('/ca/root.crt', '/crl');
        const crlPath = `${crlDir}/${caType}-crl.pem`;

        // Load CRL
        const crl = await crlManager.loadCRL(crlPath);

        // Validate CRL freshness
        const validation = crlManager.validateCRLFreshness(crl);

        res.json({
            success: true,
            crl: {
                version: crl.version,
                issuer: crl.issuer,
                thisUpdate: crl.thisUpdate,
                nextUpdate: crl.nextUpdate,
                revokedCertificates: crl.revokedCertificates,
                crlNumber: crl.crlNumber
            },
            validation,
            stats: {
                revokedCount: crl.revokedCertificates.length,
                age: validation.age,
                fresh: validation.fresh
            }
        });

    } catch (error) {
        logger.error('Failed to get revocation list', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to get revocation list',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Revoke a certificate
 * POST /api/admin/certificates/revoke
 * 
 * Body: { serialNumber: string, reason: string, ca: 'root'|'intermediate' }
 */
export async function revokeCertificate(req: Request, res: Response): Promise<void> {
    try {
        const { serialNumber, reason, ca = 'intermediate' } = req.body;

        // Validate input
        if (!serialNumber || !reason) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: serialNumber, reason'
            });
            return;
        }

        logger.warn('Admin: Certificate revocation requested', {
            adminUser: req.user?.uniqueID || 'unknown',
            serialNumber,
            reason,
            ca
        });

        // Get CRL path
        const paths = certificateManager.resolveCertificatePaths();
        const crlDir = paths.rootCertPath.replace('/ca/root.crt', '/crl');
        const crlPath = `${crlDir}/${ca}-crl.pem`;

        // Revoke certificate
        await crlManager.revokeCertificate(
            serialNumber,
            reason as any,
            crlPath,
            `Revoked by admin: ${req.user?.uniqueID || 'unknown'}`
        );

        res.json({
            success: true,
            message: 'Certificate revoked successfully',
            serialNumber,
            reason,
            revocationDate: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to revoke certificate', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to revoke certificate',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Check certificate revocation status
 * GET /api/admin/certificates/revocation-status/:serialNumber
 * 
 * Query: ?ca=root|intermediate
 */
export async function checkRevocationStatus(req: Request, res: Response): Promise<void> {
    try {
        const { serialNumber } = req.params;
        const caType = req.query.ca as string || 'intermediate';

        logger.info('Admin: Revocation status check requested', {
            adminUser: req.user?.uniqueID || 'unknown',
            serialNumber,
            caType
        });

        // Get CRL path
        const paths = certificateManager.resolveCertificatePaths();
        const crlDir = paths.rootCertPath.replace('/ca/root.crt', '/crl');
        const crlPath = `${crlDir}/${caType}-crl.pem`;

        // Check revocation status
        const status = await crlManager.isRevoked(serialNumber, crlPath);

        res.json({
            success: true,
            serialNumber,
            revoked: status.revoked,
            reason: status.reason,
            revocationDate: status.revocationDate,
            crlFresh: status.crlFresh,
            crlAge: status.crlAge
        });

    } catch (error) {
        logger.error('Failed to check revocation status', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to check revocation status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

/**
 * Update CRL (refresh from CA)
 * POST /api/admin/certificates/revocation-list/update
 * 
 * Body: { ca: 'root'|'intermediate' }
 */
export async function updateCRL(req: Request, res: Response): Promise<void> {
    try {
        const { ca = 'intermediate' } = req.body;

        logger.info('Admin: CRL update requested', {
            adminUser: req.user?.uniqueID || 'unknown',
            ca
        });

        // Get CRL path
        const paths = certificateManager.resolveCertificatePaths();
        const crlDir = paths.rootCertPath.replace('/ca/root.crt', '/crl');
        const crlPath = `${crlDir}/${ca}-crl.pem`;

        // Update CRL
        const result = await crlManager.updateCRL(crlPath);

        res.json({
            success: true,
            message: result.updated ? 'CRL updated successfully' : 'CRL is still fresh',
            ...result
        });

    } catch (error) {
        logger.error('Failed to update CRL', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to update CRL',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}
