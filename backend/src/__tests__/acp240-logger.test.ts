/**
 * ACP-240 Logger Test Suite
 * Target: 100% coverage for acp240-logger.ts
 *
 * Tests:
 * - logACP240Event() - base audit logging
 * - logEncryptEvent() - ENCRYPT event logging
 * - logDecryptEvent() - DECRYPT event logging
 * - logAccessDeniedEvent() - ACCESS_DENIED event logging
 * - logAccessModifiedEvent() - ACCESS_MODIFIED event logging
 * - logDataSharedEvent() - DATA_SHARED event logging
 * - closeAuditLogConnection() - graceful reference cleanup
 * - MongoDB connection handling
 * - Error cases
 */

import {
    logACP240Event,
    logEncryptEvent,
    logDecryptEvent,
    logAccessDeniedEvent,
    logAccessModifiedEvent,
    logDataSharedEvent,
    closeAuditLogConnection,
    IACP240AuditEvent,
} from '../utils/acp240-logger';

// Mock logger
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        }),
    },
}));

// Mock mongodb-singleton (source uses getDb/mongoSingleton, not raw MongoClient)
// NOTE: jest.mock factories are hoisted — use inline jest.fn() to avoid TDZ
jest.mock('../utils/mongodb-singleton', () => {
    const insertOne = jest.fn();
    const collection = jest.fn().mockReturnValue({ insertOne });
    const db = { collection };
    return {
        getDb: jest.fn(() => db),
        mongoSingleton: {
            connect: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
        },
        __mocks: { insertOne, collection, db },
    };
});

const { logger } = require('../utils/logger');
const mongoSingletonMod = require('../utils/mongodb-singleton');
const mockInsertOne = mongoSingletonMod.__mocks.insertOne as jest.Mock;
const mockCollection = mongoSingletonMod.__mocks.collection as jest.Mock;
const mockConnect = mongoSingletonMod.mongoSingleton.connect as jest.Mock;

describe('ACP-240 Logger', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        mockInsertOne.mockResolvedValue({ insertedId: 'mock-id' });
        mockConnect.mockResolvedValue(undefined);
        mockCollection.mockReturnValue({ insertOne: mockInsertOne });

        // Reset connection by closing before each test
        await closeAuditLogConnection();
    });

    afterAll(async () => {
        await closeAuditLogConnection();
    });

    describe('logACP240Event', () => {
        describe('Happy Path', () => {
            it('should log audit event to file and MongoDB', async () => {
                const event: IACP240AuditEvent = {
                    eventType: 'ENCRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'encrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Resource encrypted',
                };

                await logACP240Event(event);

                // Should log to file
                expect(logger.child).toHaveBeenCalledWith({ service: 'acp240-audit' });

                // Should write to MongoDB
                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'ENCRYPT',
                        timestamp: '2025-11-28T10:00:00.000Z',
                        requestId: 'req-123',
                        subject: 'john.doe@mil',
                        action: 'encrypt',
                        resourceId: 'doc-456',
                        outcome: 'ALLOW',
                        reason: 'Resource encrypted',
                    })
                );
            });

            it('should log event with all optional fields', async () => {
                const event: IACP240AuditEvent = {
                    eventType: 'DECRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'decrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Access granted',
                    subjectAttributes: {
                        clearance: 'SECRET',
                        countryOfAffiliation: 'USA',
                        acpCOI: ['FVEY'],
                    },
                    resourceAttributes: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA', 'GBR'],
                        COI: ['FVEY'],
                        encrypted: true,
                    },
                    policyEvaluation: {
                        allow: true,
                        reason: 'All conditions satisfied',
                    },
                    context: {
                        sourceIP: '192.168.1.100',
                        deviceCompliant: true,
                    },
                    latencyMs: 45,
                };

                await logACP240Event(event);

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        subjectAttributes: event.subjectAttributes,
                        resourceAttributes: event.resourceAttributes,
                        policyEvaluation: event.policyEvaluation,
                        context: event.context,
                        latencyMs: 45,
                    })
                );
            });
        });

        describe('MongoDB Error Handling', () => {
            it('should handle MongoDB connection error gracefully', async () => {
                // Close existing connection first
                await closeAuditLogConnection();

                mockConnect.mockRejectedValueOnce(new Error('Connection failed'));

                const event: IACP240AuditEvent = {
                    eventType: 'ENCRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'encrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Resource encrypted',
                };

                await logACP240Event(event);

                // Should still log to file
                expect(logger.child).toHaveBeenCalled();

                // Should log error about MongoDB connection
                expect(logger.error).toHaveBeenCalled();
            });

            it('should handle MongoDB insert error gracefully', async () => {
                mockInsertOne.mockRejectedValueOnce(new Error('Insert failed'));

                const event: IACP240AuditEvent = {
                    eventType: 'ENCRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'encrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Resource encrypted',
                };

                await logACP240Event(event);

                // Should log error
                expect(logger.error).toHaveBeenCalledWith(
                    'Failed to write audit event to MongoDB',
                    expect.objectContaining({
                        error: 'Insert failed',
                        eventType: 'ENCRYPT',
                        requestId: 'req-123',
                    })
                );
            });

            it('should use custom logs collection from env', async () => {
                const originalEnv = process.env.ACP240_LOGS_COLLECTION;
                process.env.ACP240_LOGS_COLLECTION = 'custom_audit_logs';

                const event: IACP240AuditEvent = {
                    eventType: 'ENCRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'encrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Resource encrypted',
                };

                await logACP240Event(event);

                expect(mockCollection).toHaveBeenCalledWith('custom_audit_logs');

                process.env.ACP240_LOGS_COLLECTION = originalEnv;
            });
        });
    });

    describe('logEncryptEvent', () => {
        describe('Happy Path', () => {
            it('should log ENCRYPT event with required fields', async () => {
                await logEncryptEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    classification: 'SECRET',
                });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'ENCRYPT',
                        requestId: 'req-123',
                        subject: 'john.doe@mil',
                        action: 'encrypt',
                        resourceId: 'doc-456',
                        outcome: 'ALLOW',
                        reason: 'Resource encrypted with ZTDF',
                        resourceAttributes: {
                            classification: 'SECRET',
                            encrypted: true,
                        },
                    })
                );
            });

            it('should log ENCRYPT event with custom reason', async () => {
                await logEncryptEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    classification: 'SECRET',
                    reason: 'Custom encryption reason',
                });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        reason: 'Custom encryption reason',
                    })
                );
            });
        });
    });

    describe('logDecryptEvent', () => {
        describe('Happy Path', () => {
            it('should log DECRYPT event with all fields', async () => {
                await logDecryptEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    classification: 'SECRET',
                    releasabilityTo: ['USA', 'GBR'],
                    subjectAttributes: {
                        clearance: 'SECRET',
                        countryOfAffiliation: 'USA',
                        acpCOI: ['FVEY'],
                    },
                    latencyMs: 45,
                });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'DECRYPT',
                        requestId: 'req-123',
                        action: 'decrypt',
                        outcome: 'ALLOW',
                        reason: 'Access granted by policy',
                        subjectAttributes: {
                            clearance: 'SECRET',
                            countryOfAffiliation: 'USA',
                            acpCOI: ['FVEY'],
                        },
                        resourceAttributes: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA', 'GBR'],
                            encrypted: true,
                        },
                        latencyMs: 45,
                    })
                );
            });

            it('should use custom reason if provided', async () => {
                await logDecryptEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    classification: 'SECRET',
                    releasabilityTo: ['USA'],
                    subjectAttributes: {
                        clearance: 'SECRET',
                    },
                    reason: 'Special access granted',
                });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        reason: 'Special access granted',
                    })
                );
            });
        });
    });

    describe('logAccessDeniedEvent', () => {
        describe('Happy Path', () => {
            it('should log ACCESS_DENIED event with full details', async () => {
                await logAccessDeniedEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    reason: 'Insufficient clearance',
                    subjectAttributes: {
                        clearance: 'CONFIDENTIAL',
                        countryOfAffiliation: 'USA',
                    },
                    resourceAttributes: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA'],
                    },
                    policyEvaluation: {
                        allow: false,
                        reason: 'Clearance level mismatch',
                        evaluation_details: {
                            clearance_check: 'FAIL',
                        },
                    },
                    latencyMs: 30,
                });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'ACCESS_DENIED',
                        outcome: 'DENY',
                        reason: 'Insufficient clearance',
                        subjectAttributes: {
                            clearance: 'CONFIDENTIAL',
                            countryOfAffiliation: 'USA',
                        },
                        resourceAttributes: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA'],
                        },
                        policyEvaluation: {
                            allow: false,
                            reason: 'Clearance level mismatch',
                            evaluation_details: {
                                clearance_check: 'FAIL',
                            },
                        },
                        latencyMs: 30,
                    })
                );
            });

            it('should log ACCESS_DENIED with minimal fields', async () => {
                await logAccessDeniedEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    reason: 'Access denied',
                });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'ACCESS_DENIED',
                        outcome: 'DENY',
                        reason: 'Access denied',
                    })
                );
            });
        });
    });

    describe('logAccessModifiedEvent', () => {
        describe('Happy Path', () => {
            it('should log ACCESS_MODIFIED event', async () => {
                logAccessModifiedEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    action: 'update',
                    reason: 'Classification changed',
                    resourceAttributes: {
                        classification: 'SECRET',
                        releasabilityTo: ['USA', 'GBR'],
                    },
                });

                // Wait for async MongoDB write
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'ACCESS_MODIFIED',
                        action: 'update',
                        outcome: 'ALLOW',
                        reason: 'Classification changed',
                        resourceAttributes: {
                            classification: 'SECRET',
                            releasabilityTo: ['USA', 'GBR'],
                        },
                    })
                );
            });

            it('should log ACCESS_MODIFIED with minimal fields', async () => {
                logAccessModifiedEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    action: 'delete',
                    reason: 'Resource deleted',
                });

                // Wait for async MongoDB write
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'ACCESS_MODIFIED',
                        action: 'delete',
                        reason: 'Resource deleted',
                    })
                );
            });
        });
    });

    describe('logDataSharedEvent', () => {
        describe('Happy Path', () => {
            it('should log DATA_SHARED event', async () => {
                logDataSharedEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    sharedWith: ['CAN', 'GBR'],
                    originalReleasability: ['USA'],
                    reason: 'Federation agreement',
                });

                // Wait for async MongoDB write
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        acp240EventType: 'DATA_SHARED',
                        action: 'share',
                        outcome: 'ALLOW',
                        reason: 'Federation agreement (shared with: CAN, GBR)',
                        resourceAttributes: {
                            releasabilityTo: ['USA'],
                        },
                    })
                );
            });

            it('should log DATA_SHARED with single country', async () => {
                logDataSharedEvent({
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    resourceId: 'doc-456',
                    sharedWith: ['CAN'],
                    originalReleasability: ['USA'],
                    reason: 'Bilateral agreement',
                });

                // Wait for async MongoDB write
                await new Promise(resolve => setTimeout(resolve, 100));

                expect(mockInsertOne).toHaveBeenCalledWith(
                    expect.objectContaining({
                        reason: 'Bilateral agreement (shared with: CAN)',
                    })
                );
            });
        });
    });

    describe('closeAuditLogConnection', () => {
        describe('Happy Path', () => {
            it('should clear MongoDB reference', async () => {
                // First log something to establish connection
                await logACP240Event({
                    eventType: 'ENCRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'encrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Test',
                });

                await closeAuditLogConnection();

                expect(logger.info).toHaveBeenCalledWith(
                    'ACP-240 logger: MongoDB reference cleared (singleton manages connection lifecycle)'
                );
            });

            it('should handle close when no connection exists', async () => {
                // Already closed in beforeEach
                await closeAuditLogConnection();

                // Should not throw
                expect(logger.info).toHaveBeenCalledWith(
                    'ACP-240 logger: MongoDB reference cleared (singleton manages connection lifecycle)'
                );
            });

            it('should allow re-initialization after close', async () => {
                // Establish connection
                await logACP240Event({
                    eventType: 'ENCRYPT',
                    timestamp: '2025-11-28T10:00:00.000Z',
                    requestId: 'req-123',
                    subject: 'john.doe@mil',
                    action: 'encrypt',
                    resourceId: 'doc-456',
                    outcome: 'ALLOW',
                    reason: 'Test',
                });

                // Close
                await closeAuditLogConnection();

                // Log again — should re-initialize
                await logACP240Event({
                    eventType: 'DECRYPT',
                    timestamp: '2025-11-28T11:00:00.000Z',
                    requestId: 'req-456',
                    subject: 'jane.doe@mil',
                    action: 'decrypt',
                    resourceId: 'doc-789',
                    outcome: 'ALLOW',
                    reason: 'Re-initialized',
                });

                expect(mockInsertOne).toHaveBeenCalledTimes(2);
            });
        });
    });
});
