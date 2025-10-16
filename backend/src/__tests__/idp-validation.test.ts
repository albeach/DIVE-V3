/**
 * Unit Tests for IdP Validation Service
 * 
 * Tests TLS validation, algorithm checking, and endpoint reachability
 * Comprehensive coverage with mocked external dependencies
 */

import { idpValidationService } from '../services/idp-validation.service';
import * as tls from 'tls';
import axios from 'axios';

// Mock external dependencies
jest.mock('axios');
jest.mock('tls', () => ({
  connect: jest.fn()
}));

describe('IdP Validation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('TLS Validation', () => {
    describe('validateTLS()', () => {
      it('should pass for TLS 1.3 with strong cipher', async () => {
        // Create mock socket with all required methods
        const mockSocket: any = {
          getProtocol: jest.fn().mockReturnValue('TLSv1.3'),
          getCipher: jest.fn().mockReturnValue({ name: 'ECDHE-RSA-AES256-GCM-SHA384' }),
          getPeerCertificate: jest.fn().mockReturnValue({
            valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }),
          end: jest.fn(),
          authorized: true,
          on: jest.fn().mockReturnThis()
        };

        // Mock tls.connect to call the callback asynchronously (simulating real connection)
        (tls.connect as jest.Mock).mockImplementation((_options: any, callback: any) => {
          // Call the connection callback asynchronously to simulate real TLS handshake
          setImmediate(() => {
            if (callback) callback();
          });
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://example.com');

        expect(result.pass).toBe(true);
        expect(result.version).toBe('TLSv1.3');
        expect(result.score).toBe(15);
        expect(result.cipher).toBe('ECDHE-RSA-AES256-GCM-SHA384');
        expect(result.errors).toHaveLength(0);
      });

      it('should pass for TLS 1.2 with strong cipher', async () => {
        const mockSocket: any = {
          getProtocol: jest.fn().mockReturnValue('TLSv1.2'),
          getCipher: jest.fn().mockReturnValue({ name: 'ECDHE-RSA-AES256-GCM-SHA384' }),
          getPeerCertificate: jest.fn().mockReturnValue({
            valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }),
          end: jest.fn(),
          authorized: true,
          on: jest.fn().mockReturnThis()
        };

        (tls.connect as jest.Mock).mockImplementation((_options: any, callback: any) => {
          setImmediate(() => {
            if (callback) callback();
          });
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://example.com');

        expect(result.pass).toBe(true);
        expect(result.version).toBe('TLSv1.2');
        expect(result.score).toBe(12);
        expect(result.errors).toHaveLength(0);
      });

      it('should fail for TLS 1.1', async () => {
        const mockSocket: any = {
          getProtocol: jest.fn().mockReturnValue('TLSv1.1'),
          getCipher: jest.fn().mockReturnValue({ name: 'ECDHE-RSA-AES256-GCM-SHA384' }),
          getPeerCertificate: jest.fn().mockReturnValue({
            valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }),
          end: jest.fn(),
          authorized: true,
          on: jest.fn().mockReturnThis()
        };

        (tls.connect as jest.Mock).mockImplementation((_options: any, callback: any) => {
          setImmediate(() => {
            if (callback) callback();
          });
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://old-server.com');

        expect(result.pass).toBe(false);
        expect(result.version).toBe('TLSv1.1');
        expect(result.score).toBe(0);
        expect(result.errors).toContain('TLS version too old: TLSv1.1. Minimum required: TLS 1.2');
      });

      it('should fail for TLS 1.0', async () => {
        const mockSocket: any = {
          getProtocol: jest.fn().mockReturnValue('TLSv1'),
          getCipher: jest.fn().mockReturnValue({ name: 'ECDHE-RSA-AES256-GCM-SHA384' }),
          getPeerCertificate: jest.fn().mockReturnValue({
            valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }),
          end: jest.fn(),
          authorized: true,
          on: jest.fn().mockReturnThis()
        };

        (tls.connect as jest.Mock).mockImplementation((_options: any, callback: any) => {
          setImmediate(() => {
            if (callback) callback();
          });
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://very-old-server.com');

        expect(result.pass).toBe(false);
        expect(result.version).toBe('TLSv1');
        expect(result.score).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('should warn on certificate expiring soon', async () => {
        const expiryDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days

        const mockSocket: any = {
          getProtocol: jest.fn().mockReturnValue('TLSv1.3'),
          getCipher: jest.fn().mockReturnValue({ name: 'ECDHE-RSA-AES256-GCM-SHA384' }),
          getPeerCertificate: jest.fn().mockReturnValue({
            valid_to: expiryDate.toISOString()
          }),
          end: jest.fn(),
          authorized: true,
          on: jest.fn().mockReturnThis()
        };

        (tls.connect as jest.Mock).mockImplementation((_options: any, callback: any) => {
          setImmediate(() => {
            if (callback) callback();
          });
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://expiring-cert.com');

        expect(result.pass).toBe(true);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain('expires in');
      });

      it('should handle connection timeout', async () => {
        let timeoutHandler: any;

        (tls.connect as jest.Mock).mockImplementation((_options: any, _callback: any) => {
          const mockSocket: any = {
            on: jest.fn((event: string, handler: any) => {
              if (event === 'timeout') {
                timeoutHandler = handler;
                // Trigger timeout immediately
                setImmediate(() => timeoutHandler());
              }
              return mockSocket;
            }),
            destroy: jest.fn()
          };
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://timeout.example.com');

        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
        expect(result.errors[0]).toContain('timeout');
      });

      it('should handle connection error', async () => {
        let errorHandler: any;

        (tls.connect as jest.Mock).mockImplementation((_options: any) => {
          const mockSocket: any = {
            on: jest.fn((event: string, handler: any) => {
              if (event === 'error') {
                errorHandler = handler;
                // Trigger error immediately
                setImmediate(() => errorHandler(new Error('Connection refused')));
              }
              return mockSocket;
            })
          };
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://unreachable.example.com');

        expect(result.pass).toBe(false);
        expect(result.errors[0]).toContain('Connection refused');
      });

      it('should allow self-signed certificates in pilot mode', async () => {
        const mockSocket: any = {
          getProtocol: jest.fn().mockReturnValue('TLSv1.3'),
          getCipher: jest.fn().mockReturnValue({ name: 'ECDHE-RSA-AES256-GCM-SHA384' }),
          getPeerCertificate: jest.fn().mockReturnValue({
            valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          }),
          end: jest.fn(),
          authorized: false, // Self-signed - not authorized
          on: jest.fn().mockReturnThis()
        };

        (tls.connect as jest.Mock).mockImplementation((_options: any, callback: any) => {
          setImmediate(() => {
            if (callback) callback();
          });
          return mockSocket;
        });

        const result = await idpValidationService.validateTLS('https://self-signed.com');

        expect(result.pass).toBe(true); // Allowed in pilot mode
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('self-signed') || w.includes('validation failed'))).toBe(true);
      });
    });
  });

  describe('Algorithm Validation', () => {
    describe('validateOIDCAlgorithms()', () => {
      it('should pass for RS256 algorithm', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          data: {
            keys: [
              { kid: 'key1', kty: 'RSA', use: 'sig', alg: 'RS256' }
            ]
          }
        });

        const result = await idpValidationService.validateOIDCAlgorithms('https://idp.com/.well-known/jwks.json');

        expect(result.pass).toBe(true);
        expect(result.algorithms).toContain('RS256');
        expect(result.score).toBe(25);
        expect(result.violations).toHaveLength(0);
      });

      it('should pass for multiple strong algorithms', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          data: {
            keys: [
              { kid: 'key1', kty: 'RSA', use: 'sig', alg: 'RS256' },
              { kid: 'key2', kty: 'RSA', use: 'sig', alg: 'RS512' },
              { kid: 'key3', kty: 'EC', use: 'sig', alg: 'ES256' }
            ]
          }
        });

        const result = await idpValidationService.validateOIDCAlgorithms('https://idp.com/.well-known/jwks.json');

        expect(result.pass).toBe(true);
        expect(result.algorithms).toEqual(['RS256', 'RS512', 'ES256']);
        expect(result.score).toBe(25);
      });

      it('should fail for MD5 algorithm', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          data: {
            keys: [
              { kid: 'key1', kty: 'RSA', use: 'sig', alg: 'MD5' }
            ]
          }
        });

        const result = await idpValidationService.validateOIDCAlgorithms('https://weak-idp.com/.well-known/jwks.json');

        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it('should fail for RS1 (SHA-1) - in denied list', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          data: {
            keys: [
              { kid: 'key1', kty: 'RSA', use: 'sig', alg: 'RS1' }
            ]
          }
        });

        const result = await idpValidationService.validateOIDCAlgorithms('https://sha1-idp.com/.well-known/jwks.json');

        expect(result.pass).toBe(false); // RS1 is in denied list
        expect(result.score).toBe(0);
        expect(result.violations.some(v => v.includes('Denied algorithm'))).toBe(true);
      });

      it('should fail for "none" algorithm', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          data: {
            keys: [
              { kid: 'key1', kty: 'RSA', use: 'sig', alg: 'none' }
            ]
          }
        });

        const result = await idpValidationService.validateOIDCAlgorithms('https://insecure-idp.com/.well-known/jwks.json');

        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
      });

      it('should handle JWKS fetch timeout', async () => {
        (axios.get as jest.Mock) = jest.fn().mockRejectedValue(new Error('timeout'));

        const result = await idpValidationService.validateOIDCAlgorithms('https://timeout.com/.well-known/jwks.json');

        expect(result.pass).toBe(false);
        expect(result.violations[0]).toContain('timeout');
      });

      it('should fail for invalid JWKS format', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          data: { invalid: 'format' }
        });

        const result = await idpValidationService.validateOIDCAlgorithms('https://broken-idp.com/.well-known/jwks.json');

        expect(result.pass).toBe(false);
        expect(result.violations[0]).toContain('Invalid JWKS format');
      });
    });

    describe('validateSAMLAlgorithm()', () => {
      it('should pass for SHA-256 algorithm', () => {
        const result = idpValidationService.validateSAMLAlgorithm(
          'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
        );

        expect(result.pass).toBe(true);
        expect(result.score).toBe(25);
        expect(result.violations).toHaveLength(0);
      });

      it('should warn for SHA-1 in pilot mode', () => {
        const result = idpValidationService.validateSAMLAlgorithm(
          'http://www.w3.org/2000/09/xmldsig#rsa-sha1'
        );

        expect(result.pass).toBe(true); // Allowed in pilot mode
        expect(result.score).toBe(10);
        expect(result.violations.some(v => v.includes('SHA-1'))).toBe(true);
      });

      it('should fail for MD5 algorithm', () => {
        const result = idpValidationService.validateSAMLAlgorithm(
          'http://www.w3.org/2000/09/xmldsig#rsa-md5'
        );

        expect(result.pass).toBe(false);
        expect(result.score).toBe(0);
        expect(result.violations.some(v => v.includes('MD5'))).toBe(true);
      });
    });
  });

  describe('Endpoint Reachability', () => {
    describe('checkEndpointReachability()', () => {
      it('should pass for reachable endpoint', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          status: 200,
          data: {}
        });

        const result = await idpValidationService.checkEndpointReachability('https://reachable.com');

        expect(result.reachable).toBe(true);
        expect(result.score).toBe(10);
        expect(result.errors).toHaveLength(0);
        expect(result.latency_ms).toBeGreaterThanOrEqual(0);
      });

      it('should fail for unreachable endpoint', async () => {
        (axios.get as jest.Mock) = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await idpValidationService.checkEndpointReachability('https://unreachable.com');

        expect(result.reachable).toBe(false);
        expect(result.score).toBe(0);
        expect(result.errors[0]).toContain('unreachable');
      });

      it('should fail for 500 error', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          status: 500,
          data: {}
        });

        const result = await idpValidationService.checkEndpointReachability('https://error-server.com');

        expect(result.reachable).toBe(false);
        expect(result.score).toBe(0);
        expect(result.errors[0]).toContain('500');
      });

      it('should pass for 404 (client error, not server error)', async () => {
        (axios.get as jest.Mock) = jest.fn().mockResolvedValue({
          status: 404,
          data: {}
        });

        const result = await idpValidationService.checkEndpointReachability('https://not-found.com');

        expect(result.reachable).toBe(false);
        expect(result.errors[0]).toContain('404');
      });
    });
  });
});

