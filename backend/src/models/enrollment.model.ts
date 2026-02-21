/**
 * DIVE V3 - Federation Enrollment Model
 *
 * MongoDB-backed store for federation enrollment records.
 * Tracks the lifecycle of a federation enrollment request:
 *   pending_verification → fingerprint_verified → approved → credentials_exchanged → active
 *                       → rejected (terminal)
 *                       → expired (TTL-managed)
 *
 * Collection: federation_enrollments
 *
 * Standards: OIDC Discovery (RFC 8414), mTLS (RFC 8705), TOFU
 *
 * @version 1.0.0
 * @date 2026-02-21
 */

import { Collection, Db, ObjectId } from 'mongodb';
import { logger } from '../utils/logger';
import { getDb } from '../utils/mongodb-singleton';

// ============================================
// TYPES
// ============================================

export type EnrollmentStatus =
  | 'pending_verification'   // Enrollment received, awaiting OOB fingerprint verification
  | 'fingerprint_verified'   // Both sides verified fingerprints, awaiting admin approval
  | 'approved'               // Admin approved, credential exchange in progress
  | 'credentials_exchanged'  // Both sides have exchanged OIDC client metadata
  | 'active'                 // Federation fully active (IdPs created, trust cascade complete)
  | 'rejected'               // Denied by admin (terminal)
  | 'revoked'                // Previously active, now revoked (terminal)
  | 'expired';               // TTL expired without completion (terminal)

export interface IEnrollment {
  _id?: ObjectId;
  enrollmentId: string;        // Public-facing ID: enr_<random>

  // Requesting instance
  requesterInstanceCode: string;
  requesterInstanceName: string;
  requesterCertPEM: string;
  requesterFingerprint: string;
  requesterOidcDiscoveryUrl: string;
  requesterApiUrl: string;
  requesterIdpUrl: string;
  requesterKasUrl?: string;
  requesterContactEmail: string;
  requesterCapabilities: string[];
  requesterTrustLevel: 'development' | 'partner' | 'bilateral' | 'national';

  // Approving instance (this instance)
  approverInstanceCode: string;
  approverFingerprint: string;

  // Cryptographic challenge
  challengeNonce: string;
  enrollmentSignature: string;   // Requester's signature over the enrollment payload

  // Status
  status: EnrollmentStatus;
  statusHistory: Array<{
    status: EnrollmentStatus;
    timestamp: Date;
    actor?: string;             // userId or 'system'
    reason?: string;
  }>;

  // Fingerprint verification
  fingerprintVerifiedAt?: Date;
  fingerprintVerifiedBy?: string;

  // Approval/Rejection
  approvedAt?: Date;
  approvedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;

  // Credential exchange (populated after approval)
  approverCredentials?: {
    oidcClientId: string;
    oidcClientSecret: string;   // Encrypted at rest
    oidcIssuerUrl: string;
    oidcDiscoveryUrl: string;
    signedCertPEM?: string;     // CA-signed cert for the requester
    caCertPEM?: string;         // Approver's CA cert
    opalToken?: string;         // JWT for OPAL policy sync
    spokeToken?: string;        // JWT for Hub API access
    kasPublicKey?: string;      // Approver's KAS public key PEM
  };

  requesterCredentials?: {
    oidcClientId: string;
    oidcClientSecret: string;   // Encrypted at rest
    oidcIssuerUrl: string;
    oidcDiscoveryUrl: string;
    kasPublicKey?: string;      // Requester's KAS public key PEM
  };

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;              // TTL — enrollment expires if not completed
}

// ============================================
// CONSTANTS
// ============================================

const COLLECTION_NAME = 'federation_enrollments';
const ENROLLMENT_TTL_HOURS = 72; // 3 days to complete enrollment

// ============================================
// STORE
// ============================================

class EnrollmentStore {
  private indexesCreated = false;

  private collection(): Collection<IEnrollment> {
    const db = getDb();
    const col = db.collection<IEnrollment>(COLLECTION_NAME);
    if (!this.indexesCreated) {
      this.indexesCreated = true;
      Promise.all([
        col.createIndex({ enrollmentId: 1 }, { unique: true }),
        col.createIndex({ requesterInstanceCode: 1 }),
        col.createIndex({ approverInstanceCode: 1 }),
        col.createIndex({ status: 1 }),
        col.createIndex({ createdAt: 1 }),
        col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), // TTL index
      ]).catch((err) => {
        this.indexesCreated = false;
        logger.warn('Failed to create enrollment indexes', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    }
    return col;
  }

  /**
   * Create a new enrollment record.
   */
  async create(enrollment: Omit<IEnrollment, '_id' | 'createdAt' | 'updatedAt' | 'expiresAt'>): Promise<IEnrollment> {
    const col = this.collection();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ENROLLMENT_TTL_HOURS * 60 * 60 * 1000);

    const doc: IEnrollment = {
      ...enrollment,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    await col.insertOne(doc);
    logger.info('Enrollment created', {
      enrollmentId: enrollment.enrollmentId,
      requester: enrollment.requesterInstanceCode,
      approver: enrollment.approverInstanceCode,
      status: enrollment.status,
    });

    return doc;
  }

  /**
   * Find enrollment by public enrollment ID.
   */
  async findByEnrollmentId(enrollmentId: string): Promise<IEnrollment | null> {
    const col = this.collection();
    return col.findOne({ enrollmentId });
  }

  /**
   * Find enrollment by requester instance code (most recent).
   */
  async findByRequester(requesterInstanceCode: string): Promise<IEnrollment | null> {
    const col = this.collection();
    return col.findOne(
      { requesterInstanceCode },
      { sort: { createdAt: -1 } },
    );
  }

  /**
   * List all enrollments with optional status filter.
   */
  async list(filter?: { status?: EnrollmentStatus; approverInstanceCode?: string }): Promise<IEnrollment[]> {
    const col = this.collection();
    const query: Record<string, unknown> = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.approverInstanceCode) query.approverInstanceCode = filter.approverInstanceCode;
    return col.find(query).sort({ createdAt: -1 }).toArray();
  }

  /**
   * List pending enrollments (for admin dashboard).
   */
  async listPending(): Promise<IEnrollment[]> {
    const col = this.collection();
    return col
      .find({
        status: { $in: ['pending_verification', 'fingerprint_verified'] },
      })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Update enrollment status with history tracking.
   */
  async updateStatus(
    enrollmentId: string,
    newStatus: EnrollmentStatus,
    actor?: string,
    reason?: string,
  ): Promise<IEnrollment | null> {
    const col = this.collection();
    const result = await col.findOneAndUpdate(
      { enrollmentId },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date(),
          ...(newStatus === 'approved' ? { approvedAt: new Date(), approvedBy: actor } : {}),
          ...(newStatus === 'rejected' ? { rejectedAt: new Date(), rejectedBy: actor, rejectionReason: reason } : {}),
          ...(newStatus === 'fingerprint_verified' ? { fingerprintVerifiedAt: new Date(), fingerprintVerifiedBy: actor } : {}),
        },
        $push: {
          statusHistory: {
            status: newStatus,
            timestamp: new Date(),
            actor,
            reason,
          } as IEnrollment['statusHistory'][number],
        },
      },
      { returnDocument: 'after' },
    );

    if (result) {
      logger.info('Enrollment status updated', {
        enrollmentId,
        newStatus,
        actor,
        reason,
      });
    }

    return result;
  }

  /**
   * Store approver's credentials after approval.
   */
  async setApproverCredentials(
    enrollmentId: string,
    credentials: NonNullable<IEnrollment['approverCredentials']>,
  ): Promise<IEnrollment | null> {
    const col = this.collection();
    return col.findOneAndUpdate(
      { enrollmentId },
      {
        $set: {
          approverCredentials: credentials,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
  }

  /**
   * Store requester's reciprocal credentials.
   */
  async setRequesterCredentials(
    enrollmentId: string,
    credentials: NonNullable<IEnrollment['requesterCredentials']>,
  ): Promise<IEnrollment | null> {
    const col = this.collection();
    return col.findOneAndUpdate(
      { enrollmentId },
      {
        $set: {
          requesterCredentials: credentials,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
  }

  /**
   * Delete enrollment (for cleanup or testing).
   */
  async delete(enrollmentId: string): Promise<boolean> {
    const col = this.collection();
    const result = await col.deleteOne({ enrollmentId });
    return result.deletedCount > 0;
  }

  /**
   * Count enrollments by status.
   */
  async countByStatus(): Promise<Record<string, number>> {
    const col = this.collection();
    const pipeline = [
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ];
    const results = await col.aggregate(pipeline).toArray();
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r._id as string] = r.count as number;
    }
    return counts;
  }
}

// Singleton
export const enrollmentStore = new EnrollmentStore();
