/**
 * DIVE V3 - Spoke Audit Queue Service Tests
 *
 * Tests for offline audit queuing, persistence, and sync operations.
 *
 * @version 1.0.0
 * @date 2025-12-05
 */

import SpokeAuditQueueService, {
    spokeAuditQueue,
    IAuditEntry,
} from '../services/spoke-audit-queue.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SpokeAuditQueueService', () => {
    let service: SpokeAuditQueueService;
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-queue-test-'));
        service = new SpokeAuditQueueService();
        await service.initialize({
            queuePath: tempDir,
            maxQueueSize: 100,
            batchSize: 10,
            maxRetries: 3,
            initialRetryDelayMs: 10,
            maxRetryDelayMs: 100,
            flushIntervalMs: 100,
            spokeId: 'test-spoke',
            instanceCode: 'TST',
        });
    });

    afterEach(async () => {
        await service.shutdown();
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    // Helper to create test audit entry
    const createTestEntry = (overrides: Partial<Omit<IAuditEntry, 'id' | 'spoke' | 'offlineEntry'>> = {}) => ({
        timestamp: new Date().toISOString(),
        eventType: 'authorization_decision' as const,
        subject: {
            uniqueID: 'test.user@test.com',
            countryOfAffiliation: 'TST',
            clearance: 'SECRET',
        },
        action: 'read',
        decision: 'allow' as const,
        ...overrides,
    });

    // ===========================================
    // INITIALIZATION TESTS
    // ===========================================

    describe('Initialization', () => {
        it('should initialize with default config', async () => {
            const defaultService = new SpokeAuditQueueService();
            const defaultTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-default-'));
            
            await defaultService.initialize({ queuePath: defaultTempDir });

            expect(defaultService.getQueueSize()).toBe(0);
            expect(defaultService.isEmpty()).toBe(true);

            await defaultService.shutdown();
            await fs.rm(defaultTempDir, { recursive: true, force: true });
        });

        it('should initialize with custom config', async () => {
            expect(service.getQueueSize()).toBe(0);
        });

        it('should emit initialized event', async () => {
            const newService = new SpokeAuditQueueService();
            const newTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-event-'));
            const handler = jest.fn();

            newService.on('initialized', handler);
            await newService.initialize({ queuePath: newTempDir });

            expect(handler).toHaveBeenCalled();

            await newService.shutdown();
            await fs.rm(newTempDir, { recursive: true, force: true });
        });

        it('should create queue directory if not exists', async () => {
            const newTempDir = path.join(os.tmpdir(), `audit-new-${Date.now()}`);
            const newService = new SpokeAuditQueueService();

            await newService.initialize({ queuePath: newTempDir });

            const dirExists = await fs.access(newTempDir).then(() => true).catch(() => false);
            expect(dirExists).toBe(true);

            await newService.shutdown();
            await fs.rm(newTempDir, { recursive: true, force: true });
        });
    });

    // ===========================================
    // ENQUEUE TESTS
    // ===========================================

    describe('Enqueue Operations', () => {
        it('should enqueue audit entry', async () => {
            const entry = createTestEntry();
            const id = await service.enqueue(entry);

            expect(id).toBeDefined();
            expect(id.startsWith('audit-')).toBe(true);
            expect(service.getQueueSize()).toBe(1);
        });

        it('should generate unique IDs', async () => {
            const entry1 = createTestEntry();
            const entry2 = createTestEntry();

            const id1 = await service.enqueue(entry1);
            const id2 = await service.enqueue(entry2);

            expect(id1).not.toBe(id2);
        });

        it('should emit entryEnqueued event', async () => {
            const handler = jest.fn();
            service.on('entryEnqueued', handler);

            await service.enqueue(createTestEntry());

            expect(handler).toHaveBeenCalled();
        });

        it('should mark entry as offline when specified', async () => {
            await service.enqueue(createTestEntry(), true);

            const entries = service.peek(1);
            expect(entries[0].offlineEntry).toBe(true);
        });

        it('should include spoke info in entry', async () => {
            await service.enqueue(createTestEntry());

            const entries = service.peek(1);
            expect(entries[0].spoke).toEqual({
                spokeId: 'test-spoke',
                instanceCode: 'TST',
            });
        });

        it('should increment totalEnqueued metric', async () => {
            await service.enqueue(createTestEntry());
            await service.enqueue(createTestEntry());

            const metrics = service.getMetrics();
            expect(metrics.totalEnqueued).toBe(2);
        });
    });

    // ===========================================
    // QUEUE CAPACITY TESTS
    // ===========================================

    describe('Queue Capacity', () => {
        it('should drop oldest entry when queue is full', async () => {
            // Create service with small max size
            const smallService = new SpokeAuditQueueService();
            const smallTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-small-'));
            
            await smallService.initialize({
                queuePath: smallTempDir,
                maxQueueSize: 3,
                spokeId: 'small-spoke',
                instanceCode: 'SML',
            });

            const handler = jest.fn();
            smallService.on('entryDropped', handler);

            // Fill queue
            await smallService.enqueue(createTestEntry({ action: 'entry1' }));
            await smallService.enqueue(createTestEntry({ action: 'entry2' }));
            await smallService.enqueue(createTestEntry({ action: 'entry3' }));
            expect(smallService.getQueueSize()).toBe(3);

            // Add one more - should drop oldest
            await smallService.enqueue(createTestEntry({ action: 'entry4' }));

            expect(smallService.getQueueSize()).toBe(3);
            expect(handler).toHaveBeenCalled();

            // Verify oldest was dropped
            const entries = smallService.peek(3);
            expect(entries[0].action).toBe('entry2');

            await smallService.shutdown();
            await fs.rm(smallTempDir, { recursive: true, force: true });
        });

        it('should track dropped entries in metrics', async () => {
            const smallService = new SpokeAuditQueueService();
            const smallTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-metrics-'));
            
            await smallService.initialize({
                queuePath: smallTempDir,
                maxQueueSize: 2,
                spokeId: 'metrics-spoke',
                instanceCode: 'MET',
            });

            await smallService.enqueue(createTestEntry());
            await smallService.enqueue(createTestEntry());
            await smallService.enqueue(createTestEntry()); // Causes drop

            const metrics = smallService.getMetrics();
            expect(metrics.totalDropped).toBe(1);

            await smallService.shutdown();
            await fs.rm(smallTempDir, { recursive: true, force: true });
        });

        it('should report isFull correctly', async () => {
            const smallService = new SpokeAuditQueueService();
            const smallTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-full-'));
            
            await smallService.initialize({
                queuePath: smallTempDir,
                maxQueueSize: 2,
                spokeId: 'full-spoke',
                instanceCode: 'FUL',
            });

            expect(smallService.isFull()).toBe(false);

            await smallService.enqueue(createTestEntry());
            await smallService.enqueue(createTestEntry());

            expect(smallService.isFull()).toBe(true);

            await smallService.shutdown();
            await fs.rm(smallTempDir, { recursive: true, force: true });
        });
    });

    // ===========================================
    // PEEK & QUERY TESTS
    // ===========================================

    describe('Peek Operations', () => {
        it('should peek at queue entries without removing', async () => {
            await service.enqueue(createTestEntry({ action: 'peek1' }));
            await service.enqueue(createTestEntry({ action: 'peek2' }));

            const peeked = service.peek(2);

            expect(peeked.length).toBe(2);
            expect(service.getQueueSize()).toBe(2); // Not removed
        });

        it('should limit peek count', async () => {
            for (let i = 0; i < 5; i++) {
                await service.enqueue(createTestEntry());
            }

            const peeked = service.peek(3);
            expect(peeked.length).toBe(3);
        });

        it('should return empty array for empty queue', () => {
            const peeked = service.peek(10);
            expect(peeked).toEqual([]);
        });
    });

    // ===========================================
    // SYNC TESTS
    // ===========================================

    describe('Sync Operations', () => {
        it('should sync entries to Hub', async () => {
            await service.enqueue(createTestEntry());
            await service.enqueue(createTestEntry());

            const syncFn = jest.fn().mockResolvedValue({
                success: true,
                synced: 2,
                failed: 0,
            });

            const result = await service.syncToHub(syncFn);

            expect(result.success).toBe(true);
            expect(result.syncedCount).toBe(2);
            expect(service.getQueueSize()).toBe(0);
            expect(syncFn).toHaveBeenCalled();
        });

        it('should handle sync failures', async () => {
            await service.enqueue(createTestEntry());

            const syncFn = jest.fn().mockResolvedValue({
                success: false,
                synced: 0,
                failed: 1,
            });

            const result = await service.syncToHub(syncFn);

            expect(result.failedCount).toBe(1);
            expect(service.getQueueSize()).toBe(1); // Entry not removed
        });

        it('should handle sync errors', async () => {
            await service.enqueue(createTestEntry());

            const syncFn = jest.fn().mockRejectedValue(new Error('Network error'));

            const result = await service.syncToHub(syncFn);

            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('Network error');
        });

        it('should emit syncComplete event', async () => {
            const handler = jest.fn();
            service.on('syncComplete', handler);

            await service.enqueue(createTestEntry());
            await service.syncToHub(async () => ({ success: true, synced: 1, failed: 0 }));

            expect(handler).toHaveBeenCalled();
        });

        it('should prevent concurrent syncs', async () => {
            await service.enqueue(createTestEntry());

            // Start slow sync
            const slowSync = service.syncToHub(async () => {
                await new Promise((r) => setTimeout(r, 100));
                return { success: true, synced: 1, failed: 0 };
            });

            // Try immediate second sync
            const secondSync = await service.syncToHub();

            expect(secondSync.success).toBe(false);
            expect(secondSync.errors[0]).toContain('in progress');

            await slowSync;
        });

        it('should process in batches', async () => {
            // Add 25 entries, batch size is 10
            for (let i = 0; i < 25; i++) {
                await service.enqueue(createTestEntry());
            }

            const batchCalls: number[] = [];
            const syncFn = jest.fn().mockImplementation(async (entries) => {
                batchCalls.push(entries.length);
                return { success: true, synced: entries.length, failed: 0 };
            });

            await service.syncToHub(syncFn);

            // Should be called 3 times (10 + 10 + 5)
            expect(syncFn).toHaveBeenCalledTimes(3);
            expect(batchCalls).toEqual([10, 10, 5]);
        });

        it('should track sync metrics', async () => {
            await service.enqueue(createTestEntry());
            
            await service.syncToHub(async () => ({ success: true, synced: 1, failed: 0 }));

            const metrics = service.getMetrics();
            expect(metrics.totalSynced).toBe(1);
            expect(metrics.lastSyncDurationMs).toBeGreaterThanOrEqual(0);
        });
    });

    // ===========================================
    // RETRY TESTS
    // ===========================================

    describe('Retry Logic', () => {
        it('should retry failed entries after retry delay', async () => {
            // Use very short retry delays for testing
            const retryService = new SpokeAuditQueueService();
            const retryTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-retry-'));
            
            await retryService.initialize({
                queuePath: retryTempDir,
                maxRetries: 3,
                initialRetryDelayMs: 5, // Very short for tests
                maxRetryDelayMs: 10,
                spokeId: 'retry-spoke',
                instanceCode: 'RTY',
            });

            await retryService.enqueue(createTestEntry());

            // First sync fails
            await retryService.syncToHub(async () => ({ success: false, synced: 0, failed: 1 }));

            const state = retryService.getState();
            expect(state.queueSize).toBe(1); // Entry still in queue

            // Wait for retry delay
            await new Promise((r) => setTimeout(r, 20));

            // Second sync succeeds
            await retryService.syncToHub(async () => ({ success: true, synced: 1, failed: 0 }));

            expect(retryService.getQueueSize()).toBe(0);

            await retryService.shutdown();
            await fs.rm(retryTempDir, { recursive: true, force: true });
        });

        it('should mark entry as failed after max retries', async () => {
            const failService = new SpokeAuditQueueService();
            const failTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-fail-'));
            
            await failService.initialize({
                queuePath: failTempDir,
                maxRetries: 2,
                initialRetryDelayMs: 5, // Very short for tests
                maxRetryDelayMs: 10,
                spokeId: 'fail-spoke',
                instanceCode: 'FAL',
            });

            const failHandler = jest.fn();
            failService.on('entryFailed', failHandler);

            await failService.enqueue(createTestEntry());

            // Fail first time
            await failService.syncToHub(async () => ({ success: false, synced: 0, failed: 1 }));
            
            // Wait for retry delay
            await new Promise((r) => setTimeout(r, 15));

            // Fail second time - should mark as failed
            await failService.syncToHub(async () => ({ success: false, synced: 0, failed: 1 }));

            const metrics = failService.getMetrics();
            expect(metrics.totalFailed).toBe(1);
            expect(failHandler).toHaveBeenCalled();

            await failService.shutdown();
            await fs.rm(failTempDir, { recursive: true, force: true });
        });
    });

    // ===========================================
    // PERSISTENCE TESTS
    // ===========================================

    describe('Persistence', () => {
        it('should flush queue to disk', async () => {
            await service.enqueue(createTestEntry());
            await service.flushToDisk();

            const filePath = path.join(tempDir, 'audit-queue.json');
            const exists = await fs.access(filePath).then(() => true).catch(() => false);

            expect(exists).toBe(true);
        });

        it('should load queue from disk on init', async () => {
            // Enqueue and flush
            await service.enqueue(createTestEntry({ action: 'persisted' }));
            await service.flushToDisk();
            await service.shutdown();

            // Create new service pointing to same directory
            const newService = new SpokeAuditQueueService();
            await newService.initialize({
                queuePath: tempDir,
                spokeId: 'new-spoke',
                instanceCode: 'NEW',
            });

            expect(newService.getQueueSize()).toBe(1);
            const entries = newService.peek(1);
            expect(entries[0].action).toBe('persisted');

            await newService.shutdown();
        });

        it('should emit flushed event', async () => {
            const handler = jest.fn();
            service.on('flushed', handler);

            await service.enqueue(createTestEntry());
            await service.flushToDisk();

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    entries: 1,
                })
            );
        });

        it('should track queue file size', async () => {
            await service.enqueue(createTestEntry());
            await service.flushToDisk();

            const state = service.getState();
            expect(state.queueFileSize).toBeGreaterThan(0);
        });
    });

    // ===========================================
    // AUTO-FLUSH TESTS
    // ===========================================

    describe('Auto-Flush', () => {
        it('should start auto-flush', () => {
            const handler = jest.fn();
            service.on('autoFlushStarted', handler);

            service.startAutoFlush();

            expect(handler).toHaveBeenCalled();

            service.stopAutoFlush();
        });

        it('should stop auto-flush', () => {
            const handler = jest.fn();
            service.on('autoFlushStopped', handler);

            service.startAutoFlush();
            service.stopAutoFlush();

            expect(handler).toHaveBeenCalled();
        });

        it('should throw if not initialized', async () => {
            const uninitService = new SpokeAuditQueueService();

            expect(() => uninitService.startAutoFlush()).toThrow();
        });
    });

    // ===========================================
    // CLEAR TESTS
    // ===========================================

    describe('Clear Operations', () => {
        it('should clear queue', async () => {
            await service.enqueue(createTestEntry());
            await service.enqueue(createTestEntry());

            await service.clear();

            expect(service.getQueueSize()).toBe(0);
            expect(service.isEmpty()).toBe(true);
        });

        it('should emit queueCleared event', async () => {
            const handler = jest.fn();
            service.on('queueCleared', handler);

            await service.enqueue(createTestEntry());
            await service.clear();

            expect(handler).toHaveBeenCalledWith({ clearedCount: 1 });
        });
    });

    // ===========================================
    // STATE & METRICS TESTS
    // ===========================================

    describe('State & Metrics', () => {
        it('should report correct state', async () => {
            await service.enqueue(createTestEntry());

            const state = service.getState();

            expect(state.queueSize).toBe(1);
            expect(state.pendingSync).toBe(1);
            expect(state.failedEntries).toBe(0);
            expect(state.syncInProgress).toBe(false);
        });

        it('should report sync in progress', async () => {
            await service.enqueue(createTestEntry());

            const syncPromise = service.syncToHub(async () => {
                await new Promise((r) => setTimeout(r, 50));
                return { success: true, synced: 1, failed: 0 };
            });

            // Check during sync
            expect(service.isSyncing()).toBe(true);

            await syncPromise;

            expect(service.isSyncing()).toBe(false);
        });

        it('should track last flush time', async () => {
            await service.enqueue(createTestEntry());
            await service.flushToDisk();

            const state = service.getState();
            expect(state.lastFlush).not.toBeNull();
        });

        it('should track last sync time', async () => {
            await service.enqueue(createTestEntry());
            await service.syncToHub(async () => ({ success: true, synced: 1, failed: 0 }));

            const state = service.getState();
            expect(state.lastSync).not.toBeNull();
        });
    });

    // ===========================================
    // SINGLETON TESTS
    // ===========================================

    describe('Singleton', () => {
        it('should export singleton instance', () => {
            expect(spokeAuditQueue).toBeInstanceOf(SpokeAuditQueueService);
        });
    });
});

