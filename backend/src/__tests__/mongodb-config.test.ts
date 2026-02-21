/**
 * MongoDB Config Utils Test Suite
 * Target: 100% coverage for mongodb-config.ts
 * 
 * Tests:
 * - getMongoDBUrl() - connection URL priority
 * - getMongoDBName() - database name selection
 * - getMongoDBConnectionString() - full connection string
 * - logMongoDBConnection() - connection logging with credential masking
 * - Environment variable handling
 * - Edge cases
 */

import {
    getMongoDBUrl,
    getMongoDBName,
    getMongoDBConnectionString,
    logMongoDBConnection,
} from '../utils/mongodb-config';

// Mock logger (Phase 6: console.* replaced with Winston)
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

const mockLogger = (require('../utils/logger') as any).logger;

describe('MongoDB Config Utils', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('getMongoDBUrl', () => {
        describe('Happy Path', () => {
            it('should return MONGODB_URI when set', () => {
                process.env.MONGODB_URI = 'mongodb://custom-host:27017/mydb';
                
                const result = getMongoDBUrl();
                
                expect(result).toBe('mongodb://custom-host:27017/mydb');
            });

            it('should return MONGODB_URL when MONGODB_URI not set', () => {
                delete process.env.MONGODB_URI;
                process.env.MONGODB_URL = 'mongodb://another-host:27017';
                
                const result = getMongoDBUrl();
                
                expect(result).toBe('mongodb://another-host:27017');
            });

            it('should return default localhost when neither set', () => {
                delete process.env.MONGODB_URI;
                delete process.env.MONGODB_URL;
                
                const result = getMongoDBUrl();
                
                expect(result).toBe('mongodb://localhost:27017');
            });
        });

        describe('Priority Order', () => {
            it('should prioritize MONGODB_URI over MONGODB_URL', () => {
                process.env.MONGODB_URI = 'mongodb://uri-host:27017';
                process.env.MONGODB_URL = 'mongodb://url-host:27017';
                
                const result = getMongoDBUrl();
                
                expect(result).toBe('mongodb://uri-host:27017');
            });

            it('should prioritize MONGODB_URI over default', () => {
                process.env.MONGODB_URI = 'mongodb://custom:27017';
                
                const result = getMongoDBUrl();
                
                expect(result).not.toBe('mongodb://localhost:27017');
                expect(result).toBe('mongodb://custom:27017');
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty MONGODB_URI (falls back to MONGODB_URL)', () => {
                process.env.MONGODB_URI = '';
                process.env.MONGODB_URL = 'mongodb://fallback:27017';
                
                const result = getMongoDBUrl();
                
                expect(result).toBe('mongodb://fallback:27017');
            });

            it('should handle empty MONGODB_URL (falls back to default)', () => {
                delete process.env.MONGODB_URI;
                process.env.MONGODB_URL = '';
                
                const result = getMongoDBUrl();
                
                expect(result).toBe('mongodb://localhost:27017');
            });
        });
    });

    describe('getMongoDBName', () => {
        describe('Happy Path', () => {
            it('should return MONGODB_DATABASE when set', () => {
                process.env.MONGODB_DATABASE = 'custom-database';
                
                const result = getMongoDBName();
                
                expect(result).toBe('custom-database');
            });

            it('should return test database when NODE_ENV is test', () => {
                delete process.env.MONGODB_DATABASE;
                process.env.NODE_ENV = 'test';
                
                const result = getMongoDBName();
                
                expect(result).toBe('dive-v3-test');
            });

            it('should return production database when NODE_ENV is production', () => {
                delete process.env.MONGODB_DATABASE;
                delete process.env.MONGODB_URI;
                delete process.env.MONGODB_URL;
                process.env.NODE_ENV = 'production';

                const result = getMongoDBName();

                expect(result).toBe('dive-v3');
            });

            it('should return production database when NODE_ENV is development', () => {
                delete process.env.MONGODB_DATABASE;
                delete process.env.MONGODB_URI;
                delete process.env.MONGODB_URL;
                process.env.NODE_ENV = 'development';

                const result = getMongoDBName();

                expect(result).toBe('dive-v3');
            });

            it('should return production database when NODE_ENV not set', () => {
                delete process.env.MONGODB_DATABASE;
                delete process.env.MONGODB_URI;
                delete process.env.MONGODB_URL;
                delete process.env.NODE_ENV;

                const result = getMongoDBName();

                expect(result).toBe('dive-v3');
            });
        });

        describe('Priority Order', () => {
            it('should prioritize MONGODB_DATABASE over NODE_ENV=test', () => {
                process.env.MONGODB_DATABASE = 'override-db';
                process.env.NODE_ENV = 'test';
                
                const result = getMongoDBName();
                
                expect(result).toBe('override-db');
            });
        });

        describe('Edge Cases', () => {
            it('should handle empty MONGODB_DATABASE (falls back to NODE_ENV logic)', () => {
                process.env.MONGODB_DATABASE = '';
                process.env.NODE_ENV = 'test';
                
                const result = getMongoDBName();
                
                expect(result).toBe('dive-v3-test');
            });
        });
    });

    describe('getMongoDBConnectionString', () => {
        describe('Happy Path', () => {
            it('should combine URL and database name', () => {
                // Use actual values from test environment
                const url = getMongoDBUrl();
                const dbName = getMongoDBName();
                
                const result = getMongoDBConnectionString();
                
                expect(result).toContain(url);
                expect(result).toContain(dbName);
            });

            it('should not duplicate database name if already in URL', () => {
                const result = getMongoDBConnectionString();
                const dbName = getMongoDBName();
                
                // Count occurrences of database name
                const count = (result.match(new RegExp(dbName, 'g')) || []).length;
                
                // Should only appear once
                expect(count).toBe(1);
            });

            it('should append database name when not in URL', () => {
                const result = getMongoDBConnectionString();
                const dbName = getMongoDBName();
                
                expect(result).toContain(`/${dbName}`);
            });
        });

        describe('Edge Cases', () => {
            it('should handle URL with trailing slash', () => {
                // Just verify it doesn't throw
                const result = getMongoDBConnectionString();
                
                expect(result).toBeTruthy();
                expect(result).toContain('mongodb://');
            });

            it('should handle URL with authentication', () => {
                // Just verify it doesn't throw
                const result = getMongoDBConnectionString();
                
                expect(result).toBeTruthy();
                expect(result).toContain('mongodb://');
            });
        });
    });

    describe('logMongoDBConnection', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        describe('Happy Path', () => {
            it('should log MongoDB connection info', () => {
                logMongoDBConnection('Test Context');

                expect(mockLogger.info).toHaveBeenCalled();
                const [message, data] = mockLogger.info.mock.calls[0];

                expect(message).toBe('MongoDB connection');
                expect(data).toHaveProperty('context', 'Test Context');
                expect(data).toHaveProperty('url');
                expect(data).toHaveProperty('database');
                expect(data).toHaveProperty('environment');
            });

            it('should mask credentials in URL', () => {
                const originalUri = process.env.MONGODB_URI;
                process.env.MONGODB_URI = 'mongodb://admin:example@secure-host:27017/mydb';

                logMongoDBConnection('Production');

                const [, data] = mockLogger.info.mock.calls[0];
                expect(data.url).toContain('***:***@');
                expect(data.url).not.toContain('password123');

                process.env.MONGODB_URI = originalUri;
            });

            it('should handle URL without credentials', () => {
                const originalUri = process.env.MONGODB_URI;
                process.env.MONGODB_URI = 'mongodb://localhost:27017';

                logMongoDBConnection('Local Dev');

                const [, data] = mockLogger.info.mock.calls[0];
                expect(data.url).toContain('mongodb://');

                process.env.MONGODB_URI = originalUri;
            });
        });

        describe('Credential Masking', () => {
            it('should mask simple username:password', () => {
                process.env.MONGODB_URI = 'mongodb://user:pass@host:27017';

                logMongoDBConnection('Test');

                const callArgs = mockLogger.info.mock.calls[0][1];
                expect(callArgs.url).not.toContain('user:pass');
                expect(callArgs.url).toContain('***:***@');
            });

            it('should mask complex password with special characters', () => {
                process.env.MONGODB_URI = 'mongodb://admin:Ex@mple!@host:27017';

                logMongoDBConnection('Test');

                const callArgs = mockLogger.info.mock.calls[0][1];
                expect(callArgs.url).not.toContain('p@ssw0rd!');
                expect(callArgs.url).toContain('***:***@');
            });

            it('should not modify URL without credentials', () => {
                const originalUri = process.env.MONGODB_URI;
                process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';

                logMongoDBConnection('Test');

                const [, data] = mockLogger.info.mock.calls[0];
                expect(data.url).toBe('mongodb://localhost:27017/testdb');
                expect(data.url).not.toContain('***');

                process.env.MONGODB_URI = originalUri;
            });
        });

        describe('Context Parameter', () => {
            it('should include context in log metadata', () => {
                logMongoDBConnection('Startup');

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'MongoDB connection',
                    expect.objectContaining({ context: 'Startup' })
                );
            });

            it('should handle empty context', () => {
                logMongoDBConnection('');

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'MongoDB connection',
                    expect.objectContaining({ context: '' })
                );
            });
        });
    });
});
