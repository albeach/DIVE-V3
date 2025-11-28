/**
 * Cross-KAS Client Test Suite
 * Target: 100% coverage for cross-kas-client.ts
 * 
 * Tests:
 * - createKASClient() with all auth methods (mtls, apikey, jwt, oauth2)
 * - requestKeyFromExternalKAS() success and error cases
 * - isExternalKAS() URL validation
 * - Edge cases (null, undefined, empty, boundaries)
 */

import axios from 'axios';
import https from 'https';
import fs from 'fs';
import {
    createKASClient,
    requestKeyFromExternalKAS,
    isExternalKAS,
    IExternalKASConfig,
} from '../utils/cross-kas-client';

// Mock dependencies
jest.mock('axios');
jest.mock('https');
jest.mock('fs');
jest.mock('../utils/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedHttps = https as jest.Mocked<typeof https>;

describe('Cross-KAS Client', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createKASClient', () => {
        describe('mTLS Authentication', () => {
            it('should create client with mTLS auth and CA cert', () => {
                const mockAgent = { test: 'agent' } as any;
                mockedHttps.Agent = jest.fn().mockReturnValue(mockAgent) as any;
                mockedFs.readFileSync = jest.fn()
                    .mockReturnValueOnce('mock-client-cert')
                    .mockReturnValueOnce('mock-client-key')
                    .mockReturnValueOnce('mock-ca-cert');

                const config: IExternalKASConfig = {
                    kasId: 'test-kas-1',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'mtls',
                    authConfig: {
                        clientCert: '/path/to/client.crt',
                        clientKey: '/path/to/client.key',
                        caCert: '/path/to/ca.crt',
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                const client = createKASClient(config);

                expect(mockedFs.readFileSync).toHaveBeenCalledWith('/path/to/client.crt');
                expect(mockedFs.readFileSync).toHaveBeenCalledWith('/path/to/client.key');
                expect(mockedFs.readFileSync).toHaveBeenCalledWith('/path/to/ca.crt');
                expect(mockedHttps.Agent).toHaveBeenCalledWith({
                    cert: 'mock-client-cert',
                    key: 'mock-client-key',
                    ca: 'mock-ca-cert',
                    rejectUnauthorized: true,
                });
                expect(mockedAxios.create).toHaveBeenCalledWith({
                    baseURL: 'https://kas.external.com',
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DIVE-V3-Backend/1.0',
                    },
                    httpsAgent: mockAgent,
                });
                expect(client).toBe(mockAxiosInstance);
            });

            it('should create client with mTLS auth without CA cert', () => {
                const mockAgent = { test: 'agent' } as any;
                mockedHttps.Agent = jest.fn().mockReturnValue(mockAgent) as any;
                mockedFs.readFileSync = jest.fn()
                    .mockReturnValueOnce('mock-client-cert')
                    .mockReturnValueOnce('mock-client-key');

                const config: IExternalKASConfig = {
                    kasId: 'test-kas-2',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'mtls',
                    authConfig: {
                        clientCert: '/path/to/client.crt',
                        clientKey: '/path/to/client.key',
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedHttps.Agent).toHaveBeenCalledWith({
                    cert: 'mock-client-cert',
                    key: 'mock-client-key',
                    ca: undefined,
                    rejectUnauthorized: false,
                });
            });

            it('should create client without mTLS agent when certs missing', () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-3',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'mtls',
                    authConfig: {
                        // No certs provided
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedHttps.Agent).not.toHaveBeenCalled();
                expect(mockedAxios.create).toHaveBeenCalledWith({
                    baseURL: 'https://kas.external.com',
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DIVE-V3-Backend/1.0',
                    },
                });
            });

            it('should create client when only client cert is provided', () => {
                mockedFs.readFileSync = jest.fn().mockReturnValue('mock-cert');

                const config: IExternalKASConfig = {
                    kasId: 'test-kas-4',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'mtls',
                    authConfig: {
                        clientCert: '/path/to/client.crt',
                        // No clientKey
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedHttps.Agent).not.toHaveBeenCalled();
            });
        });

        describe('API Key Authentication', () => {
            it('should create client with API key using default header', () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-5',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'secret-api-key-123',
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedAxios.create).toHaveBeenCalledWith({
                    baseURL: 'https://kas.external.com',
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DIVE-V3-Backend/1.0',
                        'X-API-Key': 'secret-api-key-123',
                    },
                });
            });

            it('should create client with API key using custom header', () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-6',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'secret-api-key-456',
                        apiKeyHeader: 'Authorization',
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedAxios.create).toHaveBeenCalledWith({
                    baseURL: 'https://kas.external.com',
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DIVE-V3-Backend/1.0',
                        'Authorization': 'secret-api-key-456',
                    },
                });
            });
        });

        describe('JWT Authentication', () => {
            it('should create client for JWT auth (token added per-request)', () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-7',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'jwt',
                    authConfig: {
                        jwtIssuer: 'https://issuer.example.com',
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedAxios.create).toHaveBeenCalledWith({
                    baseURL: 'https://kas.external.com',
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DIVE-V3-Backend/1.0',
                    },
                });
            });
        });

        describe('OAuth2 Authentication', () => {
            it('should create client for OAuth2 auth (token added per-request)', () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-8',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'oauth2',
                    authConfig: {
                        oauth2ClientId: 'client-123',
                        oauth2ClientSecret: 'secret-456',
                        oauth2TokenUrl: 'https://oauth.example.com/token',
                    },
                };

                const mockAxiosInstance = { test: 'instance' } as any;
                mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

                createKASClient(config);

                expect(mockedAxios.create).toHaveBeenCalledWith({
                    baseURL: 'https://kas.external.com',
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DIVE-V3-Backend/1.0',
                    },
                });
            });
        });
    });

    describe('requestKeyFromExternalKAS', () => {
        describe('Happy Path', () => {
            it('should successfully request key from external KAS', async () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-9',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'test-key',
                    },
                };

                const request = {
                    resourceId: 'res-123',
                    kaoId: 'kao-456',
                    wrappedKey: 'wrapped-key-data',
                    bearerToken: 'bearer-token-xyz',
                    requestId: 'req-789',
                    requestTimestamp: '2025-11-28T10:00:00.000Z',
                };

                const mockResponse = {
                    data: {
                        unwrappedKey: 'plaintext-key',
                        success: true,
                    },
                };

                const mockClient = {
                    post: jest.fn().mockResolvedValue(mockResponse),
                };

                mockedAxios.create = jest.fn().mockReturnValue(mockClient as any);

                const result = await requestKeyFromExternalKAS(config, request);

                expect(mockClient.post).toHaveBeenCalledWith('/request-key', {
                    resourceId: 'res-123',
                    kaoId: 'kao-456',
                    wrappedKey: 'wrapped-key-data',
                    bearerToken: 'bearer-token-xyz',
                    requestId: 'req-789',
                    requestTimestamp: '2025-11-28T10:00:00.000Z',
                });
                expect(result).toEqual({
                    unwrappedKey: 'plaintext-key',
                    success: true,
                });
            });
        });

        describe('Error Handling', () => {
            it('should handle network error', async () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-10',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'test-key',
                    },
                };

                const request = {
                    resourceId: 'res-123',
                    kaoId: 'kao-456',
                    wrappedKey: 'wrapped-key-data',
                    bearerToken: 'bearer-token-xyz',
                    requestId: 'req-789',
                    requestTimestamp: '2025-11-28T10:00:00.000Z',
                };

                const mockError = new Error('Network error');
                (mockError as any).response = undefined;

                const mockClient = {
                    post: jest.fn().mockRejectedValue(mockError),
                };

                mockedAxios.create = jest.fn().mockReturnValue(mockClient as any);

                await expect(requestKeyFromExternalKAS(config, request)).rejects.toThrow('Network error');
            });

            it('should handle 403 Forbidden error', async () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-11',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'test-key',
                    },
                };

                const request = {
                    resourceId: 'res-123',
                    kaoId: 'kao-456',
                    wrappedKey: 'wrapped-key-data',
                    bearerToken: 'bearer-token-xyz',
                    requestId: 'req-789',
                    requestTimestamp: '2025-11-28T10:00:00.000Z',
                };

                const mockError = new Error('Forbidden');
                (mockError as any).response = {
                    status: 403,
                    data: { error: 'Access denied' },
                };

                const mockClient = {
                    post: jest.fn().mockRejectedValue(mockError),
                };

                mockedAxios.create = jest.fn().mockReturnValue(mockClient as any);

                await expect(requestKeyFromExternalKAS(config, request)).rejects.toThrow('Forbidden');
            });

            it('should handle 500 Internal Server Error', async () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-12',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'test-key',
                    },
                };

                const request = {
                    resourceId: 'res-123',
                    kaoId: 'kao-456',
                    wrappedKey: 'wrapped-key-data',
                    bearerToken: 'bearer-token-xyz',
                    requestId: 'req-789',
                    requestTimestamp: '2025-11-28T10:00:00.000Z',
                };

                const mockError = new Error('Internal Server Error');
                (mockError as any).response = {
                    status: 500,
                };

                const mockClient = {
                    post: jest.fn().mockRejectedValue(mockError),
                };

                mockedAxios.create = jest.fn().mockReturnValue(mockClient as any);

                await expect(requestKeyFromExternalKAS(config, request)).rejects.toThrow('Internal Server Error');
            });

            it('should handle timeout error', async () => {
                const config: IExternalKASConfig = {
                    kasId: 'test-kas-13',
                    kasUrl: 'https://kas.external.com',
                    authMethod: 'apikey',
                    authConfig: {
                        apiKey: 'test-key',
                    },
                };

                const request = {
                    resourceId: 'res-123',
                    kaoId: 'kao-456',
                    wrappedKey: 'wrapped-key-data',
                    bearerToken: 'bearer-token-xyz',
                    requestId: 'req-789',
                    requestTimestamp: '2025-11-28T10:00:00.000Z',
                };

                const mockError = new Error('timeout of 10000ms exceeded');
                (mockError as any).code = 'ECONNABORTED';

                const mockClient = {
                    post: jest.fn().mockRejectedValue(mockError),
                };

                mockedAxios.create = jest.fn().mockReturnValue(mockClient as any);

                await expect(requestKeyFromExternalKAS(config, request)).rejects.toThrow('timeout of 10000ms exceeded');
            });
        });
    });

    describe('isExternalKAS', () => {
        const originalEnv = process.env.KAS_URL;

        beforeEach(() => {
            process.env.KAS_URL = 'https://kas:8080';
        });

        afterEach(() => {
            process.env.KAS_URL = originalEnv;
        });

        describe('Happy Path', () => {
            it('should identify external KAS URL', () => {
                const result = isExternalKAS('https://external-kas.example.com');
                expect(result).toBe(true);
            });

            it('should identify external KAS with different port', () => {
                const result = isExternalKAS('https://kas.partner.gov:9443');
                expect(result).toBe(true);
            });

            it('should identify external KAS with IP address', () => {
                const result = isExternalKAS('https://192.168.1.100:8080');
                expect(result).toBe(true);
            });
        });

        describe('Internal KAS Detection', () => {
            it('should identify internal KAS by hostname', () => {
                const result = isExternalKAS('https://kas:8080');
                expect(result).toBe(false);
            });

            it('should identify localhost as internal', () => {
                const result = isExternalKAS('https://localhost:8080');
                expect(result).toBe(false);
            });

            it('should identify kas hostname as internal', () => {
                const result = isExternalKAS('https://kas:9999');
                expect(result).toBe(false);
            });

            it('should match against configured KAS_URL', () => {
                process.env.KAS_URL = 'https://internal-kas.dive.local:8080';
                const result = isExternalKAS('https://internal-kas.dive.local:8080');
                expect(result).toBe(false);
            });
        });

        describe('Edge Cases', () => {
            it('should handle invalid URL gracefully', () => {
                const result = isExternalKAS('not-a-valid-url');
                expect(result).toBe(false);
            });

            it('should handle empty string', () => {
                const result = isExternalKAS('');
                expect(result).toBe(false);
            });

            it('should handle URL without protocol', () => {
                const result = isExternalKAS('kas.example.com:8080');
                // URL constructor will throw, caught and returns true (external)
                expect(result).toBe(true);
            });

            it('should handle malformed URL', () => {
                const result = isExternalKAS('https://[invalid:url');
                expect(result).toBe(false);
            });

            it('should handle URL with special characters', () => {
                const result = isExternalKAS('https://kas<script>:8080');
                expect(result).toBe(false);
            });

            it('should use default KAS_URL when not set', () => {
                delete process.env.KAS_URL;
                const result = isExternalKAS('https://kas:8080');
                // Should default to 'https://kas:8080'
                expect(result).toBe(false);
            });

            it('should handle localhost with different ports', () => {
                const result = isExternalKAS('https://localhost:9443');
                expect(result).toBe(false);
            });

            it('should handle http protocol', () => {
                const result = isExternalKAS('http://external-kas.com');
                expect(result).toBe(true);
            });

            it('should be case-insensitive for hostname comparison', () => {
                const result = isExternalKAS('https://KAS:8080');
                // URL spec normalizes hostnames to lowercase, so KAS becomes kas
                expect(result).toBe(false);
            });
        });
    });
});

