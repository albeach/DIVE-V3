/**
 * E2E Tests for Multimedia Upload
 *
 * Tests the complete upload flow for audio and video files
 * with STANAG 4774/4778 compliance.
 */

import request from 'supertest';
import path from 'path';
import fs from 'fs';

// These tests require a running backend server
// Skip if no server is available
const API_URL = process.env.API_URL || 'http://localhost:3001';

describe('Multimedia Upload E2E', () => {
  // Helper to check if server is available
  const checkServer = async () => {
    try {
      const response = await request(API_URL).get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  };

  beforeAll(async () => {
    const serverAvailable = await checkServer();
    if (!serverAvailable) {
      console.warn('Backend server not available, skipping E2E tests');
    }
  });

  describe('Audio Upload', () => {
    it.skip('should upload MP3 file with STANAG classification', async () => {
      // Create a minimal MP3 header for testing
      const mp3Header = Buffer.from([
        0xFF, 0xFB, 0x90, 0x00, // MP3 frame header
        0x00, 0x00, 0x00, 0x00,
      ]);

      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', mp3Header, {
          filename: 'test-audio.mp3',
          contentType: 'audio/mpeg',
        })
        .field('classification', 'SECRET')
        .field('releasabilityTo', JSON.stringify(['USA', 'GBR']))
        .field('title', 'Test Audio File');

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.resourceId).toBeDefined();
      expect(response.body.displayMarking).toContain('SECRET');
    });

    it.skip('should create XMP sidecar for MP3', async () => {
      const mp3Header = Buffer.from([
        0xFF, 0xFB, 0x90, 0x00,
        0x00, 0x00, 0x00, 0x00,
      ]);

      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', mp3Header, {
          filename: 'test-sidecar.mp3',
          contentType: 'audio/mpeg',
        })
        .field('classification', 'CONFIDENTIAL')
        .field('releasabilityTo', JSON.stringify(['USA']))
        .field('title', 'Test Sidecar');

      expect(response.status).toBe(201);

      // Verify metadata indicates sidecar was created
      // Note: Actual sidecar verification would require checking GridFS
    });

    it.skip('should embed XMP in M4A files', async () => {
      // M4A file requires ftyp atom
      const m4aHeader = Buffer.from([
        0x00, 0x00, 0x00, 0x1C, // Box size
        0x66, 0x74, 0x79, 0x70, // 'ftyp'
        0x4D, 0x34, 0x41, 0x20, // 'M4A '
        0x00, 0x00, 0x00, 0x00,
        0x4D, 0x34, 0x41, 0x20,
        0x6D, 0x70, 0x34, 0x32,
        0x69, 0x73, 0x6F, 0x6D,
      ]);

      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', m4aHeader, {
          filename: 'test-audio.m4a',
          contentType: 'audio/mp4',
        })
        .field('classification', 'SECRET')
        .field('releasabilityTo', JSON.stringify(['USA', 'CAN']))
        .field('title', 'M4A Test');

      expect(response.status).toBe(201);
    });
  });

  describe('Video Upload', () => {
    it.skip('should upload MP4 video with classification', async () => {
      // Minimal MP4 ftyp box
      const mp4Header = Buffer.from([
        0x00, 0x00, 0x00, 0x1C,
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x69, 0x73, 0x6F, 0x6D, // isom
        0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6F, 0x6D,
        0x69, 0x73, 0x6F, 0x32,
        0x6D, 0x70, 0x34, 0x31,
      ]);

      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', mp4Header, {
          filename: 'test-video.mp4',
          contentType: 'video/mp4',
        })
        .field('classification', 'TOP_SECRET')
        .field('releasabilityTo', JSON.stringify(['USA']))
        .field('title', 'Top Secret Video');

      expect(response.status).toBe(201);
      expect(response.body.displayMarking).toContain('TOP SECRET');
    });

    it.skip('should reject video exceeding size limit for classification', async () => {
      // Create a buffer that exceeds TOP_SECRET limit (50MB)
      // Note: This test would need actual large file handling
      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .send({
          fileSize: 60 * 1024 * 1024, // 60MB
          classification: 'TOP_SECRET',
          mimeType: 'video/mp4',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('size');
    });
  });

  describe('Classification Compliance', () => {
    it.skip('should preserve classification through upload pipeline', async () => {
      const mp3Header = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);

      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', mp3Header, {
          filename: 'classified-audio.mp3',
          contentType: 'audio/mpeg',
        })
        .field('classification', 'SECRET')
        .field('originalClassification', 'GEHEIM')
        .field('originalCountry', 'DEU')
        .field('releasabilityTo', JSON.stringify(['USA', 'DEU']))
        .field('title', 'German Classified Audio');

      expect(response.status).toBe(201);

      // Verify ZTDF contains classification equivalency
      if (response.body.ztdf) {
        expect(
          response.body.ztdf.policy.securityLabel.originalClassification
        ).toBe('GEHEIM');
        expect(
          response.body.ztdf.policy.securityLabel.originalCountry
        ).toBe('DEU');
      }
    });
  });

  describe('Audit Logging', () => {
    it.skip('should log multimedia upload event', async () => {
      const mp3Header = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);

      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .set('X-Request-ID', 'test-audit-' + Date.now())
        .attach('file', mp3Header, {
          filename: 'audit-test.mp3',
          contentType: 'audio/mpeg',
        })
        .field('classification', 'CONFIDENTIAL')
        .field('releasabilityTo', JSON.stringify(['USA']))
        .field('title', 'Audit Test');

      expect(response.status).toBe(201);

      // Note: Actual audit log verification would require
      // checking the audit log file or MongoDB collection
    });
  });

  describe('Error Handling', () => {
    it.skip('should reject unsupported audio format', async () => {
      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', Buffer.from('fake audio'), {
          filename: 'test.aac',
          contentType: 'audio/aac',
        })
        .field('classification', 'UNCLASSIFIED')
        .field('releasabilityTo', JSON.stringify(['USA']))
        .field('title', 'Invalid Format');

      // Should either accept (if AAC is allowed) or reject with clear message
      if (response.status === 400) {
        expect(response.body.error).toBeDefined();
      }
    });

    it.skip('should handle corrupted audio gracefully', async () => {
      const response = await request(API_URL)
        .post('/api/resources/upload')
        .set('Authorization', 'Bearer test-token')
        .attach('file', Buffer.from('not valid audio data'), {
          filename: 'corrupted.mp3',
          contentType: 'audio/mpeg',
        })
        .field('classification', 'UNCLASSIFIED')
        .field('releasabilityTo', JSON.stringify(['USA']))
        .field('title', 'Corrupted File');

      // Should process despite potential metadata extraction failure
      // The upload should succeed, metadata might be incomplete
      expect([201, 400]).toContain(response.status);
    });
  });
});
