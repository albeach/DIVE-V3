/**
 * DIVE V3 - Federation Enrollment Service
 *
 * Manages the enrollment lifecycle for Zero Trust federation handshake:
 *   1. ENROLL  — Remote instance submits enrollment request
 *   2. VERIFY  — Admin verifies fingerprint via OOB channel
 *   3. APPROVE — Admin approves (or rejects) the enrollment
 *   4. EXCHANGE — Mutual OIDC client credential exchange
 *   5. ACTIVATE — Both sides create IdPs, trust cascade fires
 *
 * Emits events that wire into the notification service and SSE streams.
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import {
  enrollmentStore,
  type IEnrollment,
  type EnrollmentStatus,
} from '../models/enrollment.model';
import { instanceIdentityService } from './instance-identity.service';

// ============================================
// TYPES
// ============================================

export interface EnrollmentRequest {
  instanceCode: string;
  instanceName: string;
  instanceCertPEM: string;
  oidcDiscoveryUrl: string;
  apiUrl: string;
  idpUrl: string;
  kasUrl?: string;
  requestedCapabilities: string[];
  requestedTrustLevel: 'development' | 'partner' | 'bilateral' | 'national';
  contactEmail: string;
  enrollmentSignature: string;
  signatureTimestamp: string;
  signatureNonce: string;
}

export interface EnrollmentResponse {
  enrollmentId: string;
  status: EnrollmentStatus;
  challengeNonce: string;
  verifierFingerprint: string;
  verifierInstanceCode: string;
  message: string;
  statusPollingUrl: string;
}

export interface EnrollmentEvent {
  type: 'enrollment:requested'
    | 'enrollment:fingerprint_verified'
    | 'enrollment:approved'
    | 'enrollment:rejected'
    | 'enrollment:credentials_exchanged'
    | 'enrollment:activated'
    | 'enrollment:revoked';
  enrollment: IEnrollment;
  actor?: string;
  reason?: string;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending_verification: ['fingerprint_verified', 'rejected', 'expired'],
  fingerprint_verified: ['approved', 'rejected', 'expired'],
  approved: ['credentials_exchanged', 'revoked'],
  credentials_exchanged: ['active', 'revoked'],
  active: ['revoked'],
  rejected: [],   // Terminal
  revoked: [],    // Terminal
  expired: [],    // Terminal
};

// ============================================
// SERVICE
// ============================================

class EnrollmentService extends EventEmitter {

  /**
   * Process a new enrollment request from a remote instance.
   *
   * Validates the request, verifies the signature, and creates an enrollment record.
   * Returns the enrollment ID and this instance's fingerprint for OOB verification.
   */
  async processEnrollment(request: EnrollmentRequest): Promise<EnrollmentResponse> {
    const instanceCode = this.getInstanceCode();

    // Validate signature timestamp (max 5 minutes old to prevent replay)
    const sigTimestamp = new Date(request.signatureTimestamp);
    const now = new Date();
    const ageMs = now.getTime() - sigTimestamp.getTime();
    if (ageMs > 5 * 60 * 1000 || ageMs < -60 * 1000) {
      throw new Error('Enrollment signature timestamp is too old or in the future');
    }

    // Verify the enrollment signature against the presented certificate
    const signatureValid = instanceIdentityService.verifyEnrollmentSignature(
      {
        instanceCode: request.instanceCode,
        targetUrl: request.apiUrl,
        timestamp: request.signatureTimestamp,
        nonce: request.signatureNonce,
      },
      request.enrollmentSignature,
      request.instanceCertPEM,
    );

    if (!signatureValid) {
      throw new Error('Enrollment signature verification failed — certificate does not match signature');
    }

    // Validate the certificate
    const certValidation = instanceIdentityService.validateCertificate(request.instanceCertPEM);
    if (!certValidation.valid) {
      throw new Error(`Certificate validation failed: ${certValidation.errors.join(', ')}`);
    }

    // Check for duplicate enrollment (same requester, non-terminal status)
    const existing = await enrollmentStore.findByRequester(request.instanceCode);
    if (existing && !['rejected', 'revoked', 'expired'].includes(existing.status)) {
      throw new Error(
        `Active enrollment already exists for ${request.instanceCode} ` +
        `(ID: ${existing.enrollmentId}, status: ${existing.status})`
      );
    }

    // Generate enrollment ID and challenge nonce
    const enrollmentId = `enr_${crypto.randomBytes(16).toString('hex')}`;
    const challengeNonce = crypto.randomBytes(32).toString('hex');

    // Get this instance's identity for fingerprint exchange
    const identity = await instanceIdentityService.getIdentity();

    // Calculate requester's fingerprint
    const requesterFingerprint = instanceIdentityService.calculateFingerprint(request.instanceCertPEM);

    // Create enrollment record
    const enrollment = await enrollmentStore.create({
      enrollmentId,
      requesterInstanceCode: request.instanceCode,
      requesterInstanceName: request.instanceName,
      requesterCertPEM: request.instanceCertPEM,
      requesterFingerprint,
      requesterOidcDiscoveryUrl: request.oidcDiscoveryUrl,
      requesterApiUrl: request.apiUrl,
      requesterIdpUrl: request.idpUrl,
      requesterKasUrl: request.kasUrl,
      requesterContactEmail: request.contactEmail,
      requesterCapabilities: request.requestedCapabilities,
      requesterTrustLevel: request.requestedTrustLevel,
      approverInstanceCode: instanceCode,
      approverFingerprint: identity.fingerprint,
      challengeNonce,
      enrollmentSignature: request.enrollmentSignature,
      status: 'pending_verification',
      statusHistory: [{
        status: 'pending_verification',
        timestamp: new Date(),
        actor: 'system',
        reason: 'Enrollment request received',
      }],
    });

    // Emit event for notification system
    this.emit('enrollment', {
      type: 'enrollment:requested',
      enrollment,
    } as EnrollmentEvent);

    logger.info('Federation enrollment processed', {
      enrollmentId,
      requester: request.instanceCode,
      approver: instanceCode,
      requesterFingerprint,
    });

    return {
      enrollmentId,
      status: 'pending_verification',
      challengeNonce,
      verifierFingerprint: identity.fingerprint,
      verifierInstanceCode: instanceCode,
      message: 'Enrollment received. Verify fingerprints out-of-band, then await approval.',
      statusPollingUrl: `/api/federation/enrollment/${enrollmentId}/status`,
    };
  }

  /**
   * Mark fingerprint as verified after OOB verification.
   * Called by the admin of the approving instance.
   */
  async verifyFingerprint(enrollmentId: string, actor: string): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    this.assertTransition(enrollment, 'fingerprint_verified');

    const updated = await enrollmentStore.updateStatus(
      enrollmentId,
      'fingerprint_verified',
      actor,
      'Fingerprint verified via out-of-band channel',
    );

    if (!updated) {
      throw new Error('Failed to update enrollment status');
    }

    this.emit('enrollment', {
      type: 'enrollment:fingerprint_verified',
      enrollment: updated,
      actor,
    } as EnrollmentEvent);

    return updated;
  }

  /**
   * Approve an enrollment request.
   * Transitions to 'approved' state, triggering credential exchange.
   */
  async approve(enrollmentId: string, actor: string): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    this.assertTransition(enrollment, 'approved');

    const updated = await enrollmentStore.updateStatus(
      enrollmentId,
      'approved',
      actor,
      'Enrollment approved by admin',
    );

    if (!updated) {
      throw new Error('Failed to update enrollment status');
    }

    this.emit('enrollment', {
      type: 'enrollment:approved',
      enrollment: updated,
      actor,
    } as EnrollmentEvent);

    logger.info('Enrollment approved', {
      enrollmentId,
      requester: updated.requesterInstanceCode,
      approvedBy: actor,
    });

    return updated;
  }

  /**
   * Reject an enrollment request with a reason.
   */
  async reject(enrollmentId: string, actor: string, reason: string): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    this.assertTransition(enrollment, 'rejected');

    const updated = await enrollmentStore.updateStatus(
      enrollmentId,
      'rejected',
      actor,
      reason,
    );

    if (!updated) {
      throw new Error('Failed to update enrollment status');
    }

    this.emit('enrollment', {
      type: 'enrollment:rejected',
      enrollment: updated,
      actor,
      reason,
    } as EnrollmentEvent);

    logger.info('Enrollment rejected', {
      enrollmentId,
      requester: updated.requesterInstanceCode,
      rejectedBy: actor,
      reason,
    });

    return updated;
  }

  /**
   * Store the approver's credentials after generating OIDC client.
   * Called by the credential exchange service after approval.
   */
  async storeApproverCredentials(
    enrollmentId: string,
    credentials: NonNullable<IEnrollment['approverCredentials']>,
  ): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    if (enrollment.status !== 'approved') {
      throw new Error(`Cannot store credentials — enrollment is ${enrollment.status}, expected approved`);
    }

    const updated = await enrollmentStore.setApproverCredentials(enrollmentId, credentials);
    if (!updated) {
      throw new Error('Failed to store approver credentials');
    }

    return updated;
  }

  /**
   * Store the requester's reciprocal credentials.
   * Called when the requester pushes their OIDC client metadata back.
   */
  async storeRequesterCredentials(
    enrollmentId: string,
    credentials: NonNullable<IEnrollment['requesterCredentials']>,
  ): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    if (!['approved', 'credentials_exchanged'].includes(enrollment.status)) {
      throw new Error(
        `Cannot store requester credentials — enrollment is ${enrollment.status}`
      );
    }

    const updated = await enrollmentStore.setRequesterCredentials(enrollmentId, credentials);
    if (!updated) {
      throw new Error('Failed to store requester credentials');
    }

    // If both sides have credentials, transition to credentials_exchanged
    if (updated.approverCredentials && updated.requesterCredentials) {
      const exchanged = await enrollmentStore.updateStatus(
        enrollmentId,
        'credentials_exchanged',
        'system',
        'Both sides have exchanged credentials',
      );

      if (exchanged) {
        this.emit('enrollment', {
          type: 'enrollment:credentials_exchanged',
          enrollment: exchanged,
        } as EnrollmentEvent);

        return exchanged;
      }
    }

    return updated;
  }

  /**
   * Mark enrollment as fully active after trust cascade completes.
   */
  async activate(enrollmentId: string): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    this.assertTransition(enrollment, 'active');

    const updated = await enrollmentStore.updateStatus(
      enrollmentId,
      'active',
      'system',
      'Federation fully active — IdPs created, trust cascade complete',
    );

    if (!updated) {
      throw new Error('Failed to activate enrollment');
    }

    this.emit('enrollment', {
      type: 'enrollment:activated',
      enrollment: updated,
    } as EnrollmentEvent);

    logger.info('Enrollment activated — federation live', {
      enrollmentId,
      requester: updated.requesterInstanceCode,
      approver: updated.approverInstanceCode,
    });

    return updated;
  }

  /**
   * Revoke an active enrollment.
   */
  async revoke(enrollmentId: string, actor: string, reason: string): Promise<IEnrollment> {
    const enrollment = await this.getEnrollment(enrollmentId);
    this.assertTransition(enrollment, 'revoked');

    const updated = await enrollmentStore.updateStatus(
      enrollmentId,
      'revoked',
      actor,
      reason,
    );

    if (!updated) {
      throw new Error('Failed to revoke enrollment');
    }

    this.emit('enrollment', {
      type: 'enrollment:revoked',
      enrollment: updated,
      actor,
      reason,
    } as EnrollmentEvent);

    logger.info('Enrollment revoked', {
      enrollmentId,
      requester: updated.requesterInstanceCode,
      revokedBy: actor,
      reason,
    });

    return updated;
  }

  /**
   * Get enrollment status (for polling and SSE).
   */
  async getStatus(enrollmentId: string): Promise<{
    enrollmentId: string;
    status: EnrollmentStatus;
    message: string;
    credentialsReady: boolean;
    updatedAt: Date;
  }> {
    const enrollment = await this.getEnrollment(enrollmentId);

    const messages: Record<EnrollmentStatus, string> = {
      pending_verification: 'Awaiting out-of-band fingerprint verification',
      fingerprint_verified: 'Fingerprint verified, awaiting admin approval',
      approved: 'Approved — credential exchange in progress',
      credentials_exchanged: 'Credentials exchanged — activating federation',
      active: 'Federation active',
      rejected: `Enrollment rejected${enrollment.rejectionReason ? ': ' + enrollment.rejectionReason : ''}`,
      revoked: 'Federation revoked',
      expired: 'Enrollment expired',
    };

    return {
      enrollmentId: enrollment.enrollmentId,
      status: enrollment.status,
      message: messages[enrollment.status],
      credentialsReady: enrollment.status === 'approved' && !!enrollment.approverCredentials,
      updatedAt: enrollment.updatedAt,
    };
  }

  /**
   * Get full enrollment details (for admin).
   */
  async getEnrollment(enrollmentId: string): Promise<IEnrollment> {
    const enrollment = await enrollmentStore.findByEnrollmentId(enrollmentId);
    if (!enrollment) {
      throw new Error(`Enrollment not found: ${enrollmentId}`);
    }
    return enrollment;
  }

  /**
   * List pending enrollments for admin dashboard.
   */
  async listPending(): Promise<IEnrollment[]> {
    return enrollmentStore.listPending();
  }

  /**
   * List all enrollments with optional filter.
   */
  async listAll(filter?: { status?: EnrollmentStatus }): Promise<IEnrollment[]> {
    return enrollmentStore.list(filter);
  }

  /**
   * Get enrollment statistics.
   */
  async getStatistics(): Promise<Record<string, number>> {
    return enrollmentStore.countByStatus();
  }

  // ============================================
  // PRIVATE
  // ============================================

  private getInstanceCode(): string {
    return (process.env.INSTANCE_CODE || process.env.COUNTRY_CODE || 'USA').toUpperCase();
  }

  /**
   * Assert that a state transition is valid.
   */
  private assertTransition(enrollment: IEnrollment, target: EnrollmentStatus): void {
    const allowed = VALID_TRANSITIONS[enrollment.status];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(
        `Invalid state transition: ${enrollment.status} → ${target} ` +
        `(allowed: ${allowed?.join(', ') || 'none'})`
      );
    }
  }
}

// Singleton
export const enrollmentService = new EnrollmentService();
