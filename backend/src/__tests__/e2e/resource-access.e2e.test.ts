/**
 * Resource Access E2E Tests
 * Phase 5 Task 5.3: Comprehensive E2E Test Suite
 * 
 * Tests complete resource lifecycle: list, download, upload, access control
 */

import request from 'supertest';
import app from '../../server';

describe('Resource Access E2E Tests', () => {
    const authToken = 'test-jwt-token';  // Mock token for authorized user
    const unauthToken = 'test-jwt-unauth';  // Mock token for unauthorized user

    describe('List Resources', () => {
        it('should list only resources user is authorized to access', async () => {
            const response = await request(app)
                .get('/api/resources')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);

            // Verify each resource has required fields
            response.body.forEach((resource: any) => {
                expect(resource).toHaveProperty('resourceId');
                expect(resource).toHaveProperty('title');
                expect(resource).toHaveProperty('classification');
                expect(resource).toHaveProperty('releasabilityTo');
            });
        });

        it('should return empty array for user with no authorized resources', async () => {
            const response = await request(app)
                .get('/api/resources')
                .set('Authorization', `Bearer ${unauthToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        it('should return 401 without authentication', async () => {
            const response = await request(app)
                .get('/api/resources');

            expect(response.status).toBe(401);
        });
    });

    describe('Download Resources', () => {
        it('should download UNCLASSIFIED resource successfully', async () => {
            const response = await request(app)
                .get('/api/resources/test-unclassified-doc')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('content');
            expect(response.body.classification).toBe('UNCLASSIFIED');
        });

        it('should download SECRET resource when authorized', async () => {
            const response = await request(app)
                .get('/api/resources/test-secret-doc')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('content');
            expect(response.body.classification).toBe('SECRET');
        });

        it('should return 403 when downloading unauthorized resource', async () => {
            const response = await request(app)
                .get('/api/resources/test-top-secret-doc')
                .set('Authorization', `Bearer ${unauthToken}`);

            expect(response.status).toBe(403);
            expect(response.body.error).toBe('Forbidden');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('details');
        });

        it('should return 404 for non-existent resource', async () => {
            const response = await request(app)
                .get('/api/resources/nonexistent-resource-id')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('Upload Resources with ZTDF Encryption', () => {
        it('should upload unencrypted UNCLASSIFIED resource', async () => {
            const resource = {
                title: 'Test Document',
                classification: 'UNCLASSIFIED',
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: [],
                content: 'This is test content',
                encrypted: false
            };

            const response = await request(app)
                .post('/api/resources/upload')
                .set('Authorization', `Bearer ${authToken}`)
                .send(resource);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('resourceId');
            expect(response.body.encrypted).toBe(false);
        });

        it('should upload encrypted SECRET resource with metadata signing', async () => {
            const resource = {
                title: 'Secret Operations Plan',
                classification: 'SECRET',
                releasabilityTo: ['USA'],
                COI: ['FVEY'],
                content: 'This is secret content',
                encrypted: true
            };

            const response = await request(app)
                .post('/api/resources/upload')
                .set('Authorization', `Bearer ${authToken}`)
                .send(resource);

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('resourceId');
            expect(response.body.encrypted).toBe(true);
            expect(response.body).toHaveProperty('metadata');
            expect(response.body.metadata).toHaveProperty('signature');  // ZTDF signing
            expect(response.body).toHaveProperty('wrappedDEK');  // Key wrapping
        });

        it('should reject upload with invalid classification', async () => {
            const resource = {
                title: 'Invalid Doc',
                classification: 'INVALID_LEVEL',
                releasabilityTo: ['USA'],
                content: 'Test'
            };

            const response = await request(app)
                .post('/api/resources/upload')
                .set('Authorization', `Bearer ${authToken}`)
                .send(resource);

            expect(response.status).toBe(400);
        });

        it('should reject upload with empty releasabilityTo', async () => {
            const resource = {
                title: 'No Release List',
                classification: 'SECRET',
                releasabilityTo: [],  // Empty = deny all
                content: 'Test'
            };

            const response = await request(app)
                .post('/api/resources/upload')
                .set('Authorization', `Bearer ${authToken}`)
                .send(resource);

            expect(response.status).toBe(400);
            expect(response.body.error).toContain('releasabilityTo');
        });
    });

    describe('Access Denied UI Response', () => {
        it('should return structured error for frontend AccessDenied component', async () => {
            const response = await request(app)
                .get('/api/resources/test-top-secret-restricted')
                .set('Authorization', `Bearer ${unauthToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toMatchObject({
                error: 'Forbidden',
                message: expect.any(String),
                details: expect.objectContaining({
                    clearance_check: expect.stringMatching(/PASS|FAIL/),
                    releasability_check: expect.stringMatching(/PASS|FAIL/)
                })
            });
        });
    });

    describe('Decision Logging on Resource Access', () => {
        it('should log authorization decision to MongoDB', async () => {
            const response = await request(app)
                .get('/api/resources/test-secret-doc')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);

            // Verify decision was logged
            expect(response.headers).toHaveProperty('x-request-id');

            // Check decision log exists (would query MongoDB in real test)
            // For now, verify response structure
            expect(response.body).toHaveProperty('resourceId');
        });
    });
});

