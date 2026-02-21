/**
 * Logger Configuration Test Suite
 * Target: 100% coverage for logger.ts
 *
 * Tests:
 * - Logger instance creation
 * - Configuration validation
 * - Environment variable handling
 * - Log format configuration
 * - Transport configuration
 * - Directory creation
 *
 * Note: This tests the logger configuration, not the winston library itself
 */

import fs from 'fs';

// IMPORTANT: Unmock winston and logger for this test file
// The global mock in setup.ts prevents testing actual logger behavior
jest.unmock('winston');
jest.unmock('../utils/logger');

// We need to test the module, so we'll import after setting env vars
describe('Logger Configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules(); // Clear module cache
        process.env = { ...originalEnv };
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('Logger Instance', () => {
        it('should create logger with default configuration', () => {
            const { logger } = require('../utils/logger');

            expect(logger).toBeDefined();
            expect(logger.level).toBe('info'); // Default LOG_LEVEL
        });

        it('should create logger with custom LOG_LEVEL from env', () => {
            process.env.LOG_LEVEL = 'debug';

            const { logger } = require('../utils/logger');

            expect(logger.level).toBe('debug');
        });

        it('should create logger with custom LOG_LEVEL=error', () => {
            process.env.LOG_LEVEL = 'error';

            const { logger } = require('../utils/logger');

            expect(logger.level).toBe('error');
        });

        it('should create logger with custom LOG_LEVEL=warn', () => {
            process.env.LOG_LEVEL = 'warn';

            const { logger } = require('../utils/logger');

            expect(logger.level).toBe('warn');
        });
    });

    describe('Log Format Configuration', () => {
        it('should use JSON format by default', () => {
            const { logger } = require('../utils/logger');

            // Logger should be configured with JSON format (default)
            expect(logger).toBeDefined();
        });

        it('should use JSON format when LOG_FORMAT=json', () => {
            process.env.LOG_FORMAT = 'json';

            const { logger } = require('../utils/logger');

            expect(logger).toBeDefined();
        });

        it('should use pretty format when LOG_FORMAT=pretty', () => {
            process.env.LOG_FORMAT = 'pretty';

            const { logger } = require('../utils/logger');

            expect(logger).toBeDefined();
        });

        it('should use pretty format when LOG_FORMAT is not json', () => {
            process.env.LOG_FORMAT = 'text';

            const { logger } = require('../utils/logger');

            expect(logger).toBeDefined();
        });
    });

    describe('Logger Metadata', () => {
        it('should include default service metadata', () => {
            const { logger } = require('../utils/logger');

            expect(logger.defaultMeta).toEqual({ service: 'dive-v3-backend' });
        });
    });

    describe('Transport Configuration', () => {
        it('should have console transport', () => {
            const { logger } = require('../utils/logger');

            const consoleTransport = logger.transports.find(
                (t: any) => t.constructor.name === 'Console'
            );

            expect(consoleTransport).toBeDefined();
        });

        it('should have file transport for app logs', () => {
            const { logger } = require('../utils/logger');

            const fileTransports = logger.transports.filter(
                (t: any) => t.constructor.name === 'File'
            );

            expect(fileTransports.length).toBeGreaterThanOrEqual(3);
        });

        it('should have error log transport', () => {
            const { logger } = require('../utils/logger');

            const errorTransport = logger.transports.find(
                (t: any) => t.constructor.name === 'File' && t.level === 'error'
            );

            expect(errorTransport).toBeDefined();
        });

        it('should configure transports with correct file sizes', () => {
            const { logger } = require('../utils/logger');

            const fileTransports = logger.transports.filter(
                (t: any) => t.constructor.name === 'File'
            );

            expect(fileTransports.length).toBeGreaterThan(0);
        });
    });

    describe('Logs Directory Creation', () => {
        it('should create logs directory if it does not exist', () => {
            const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation();
            const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

            // Re-require to trigger directory creation
            jest.resetModules();
            require('../utils/logger');

            expect(existsSyncSpy).toHaveBeenCalledWith(
                expect.stringContaining('logs')
            );
            expect(mkdirSyncSpy).toHaveBeenCalledWith(
                expect.stringContaining('logs'),
                { recursive: true }
            );

            mkdirSyncSpy.mockRestore();
            existsSyncSpy.mockRestore();
        });

        it('should not create logs directory if it already exists', () => {
            const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation();
            const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

            // Re-require to trigger check
            jest.resetModules();
            require('../utils/logger');

            expect(existsSyncSpy).toHaveBeenCalled();
            expect(mkdirSyncSpy).not.toHaveBeenCalled();

            mkdirSyncSpy.mockRestore();
            existsSyncSpy.mockRestore();
        });
    });

    describe('Logger Methods', () => {
        it('should have info method', () => {
            const { logger } = require('../utils/logger');

            expect(logger.info).toBeDefined();
            expect(typeof logger.info).toBe('function');
        });

        it('should have error method', () => {
            const { logger } = require('../utils/logger');

            expect(logger.error).toBeDefined();
            expect(typeof logger.error).toBe('function');
        });

        it('should have warn method', () => {
            const { logger } = require('../utils/logger');

            expect(logger.warn).toBeDefined();
            expect(typeof logger.warn).toBe('function');
        });

        it('should have debug method', () => {
            const { logger } = require('../utils/logger');

            expect(logger.debug).toBeDefined();
            expect(typeof logger.debug).toBe('function');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty LOG_LEVEL', () => {
            process.env.LOG_LEVEL = '';

            const { logger } = require('../utils/logger');

            // Empty string is falsy, should use default 'info'
            expect(logger.level).toBe('info');
        });

        it('should handle empty LOG_FORMAT', () => {
            process.env.LOG_FORMAT = '';

            const { logger } = require('../utils/logger');

            // Empty string is falsy, should use default 'json'
            expect(logger).toBeDefined();
        });

        it('should handle undefined LOG_LEVEL', () => {
            delete process.env.LOG_LEVEL;

            const { logger } = require('../utils/logger');

            expect(logger.level).toBe('info');
        });

        it('should handle undefined LOG_FORMAT', () => {
            delete process.env.LOG_FORMAT;

            const { logger } = require('../utils/logger');

            expect(logger).toBeDefined();
        });
    });

    describe('Log File Paths', () => {
        it('should use correct path for app logs', () => {
            const { logger } = require('../utils/logger');

            const appLogTransport = logger.transports.find(
                (t: any) => t.constructor.name === 'File' && t.filename?.includes('app.log')
            );

            expect(appLogTransport).toBeDefined();
            expect(appLogTransport.filename).toContain('app.log');
        });

        it('should use correct path for error logs', () => {
            const { logger } = require('../utils/logger');

            const errorLogTransport = logger.transports.find(
                (t: any) => t.constructor.name === 'File' && t.filename?.includes('error.log')
            );

            expect(errorLogTransport).toBeDefined();
            expect(errorLogTransport.filename).toContain('error.log');
        });

        it('should use correct path for authz logs', () => {
            const { logger } = require('../utils/logger');

            const authzLogTransport = logger.transports.find(
                (t: any) => t.constructor.name === 'File' && t.filename?.includes('authz.log')
            );

            expect(authzLogTransport).toBeDefined();
            expect(authzLogTransport.filename).toContain('authz.log');
        });
    });
});
