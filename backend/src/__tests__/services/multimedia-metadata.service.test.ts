/**
 * Multimedia Metadata Service Tests
 *
 * Tests for audio/video metadata extraction and validation
 * for STANAG 4774/4778 compliance.
 */

import {
  extractAudioMetadata,
  extractVideoMetadata,
  extractMultimediaMetadata,
  validateMultimediaForClassification,
  getSupportedAudioFormats,
  getSupportedVideoFormats,
  supportsEmbeddedXMP,
} from '../../services/multimedia-metadata.service';

// Mock music-metadata
jest.mock('music-metadata', () => ({
  parseBuffer: jest.fn().mockResolvedValue({
    format: {
      duration: 120.5,
      bitrate: 320000,
      sampleRate: 44100,
      codec: 'mp3',
      numberOfChannels: 2,
      container: 'mp3',
      lossless: false,
      bitsPerSample: undefined,
    },
    common: {
      title: 'Test Audio',
      artist: 'Test Artist',
      album: 'Test Album',
      year: 2024,
    },
    native: {
      'ID3v2.4': [
        { id: 'TIT2', value: 'Test Audio' },
        { id: 'TPE1', value: 'Test Artist' },
      ],
    },
  }),
}));

// Mock fluent-ffmpeg
jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = jest.fn().mockReturnValue({
    ffprobe: jest.fn((callback) => {
      callback(null, {
        format: {
          duration: 300,
          bit_rate: '5000000',
          format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          tags: {
            title: 'Test Video',
          },
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
            display_aspect_ratio: '16:9',
          },
          {
            codec_type: 'audio',
            codec_name: 'aac',
            sample_rate: 48000,
            channels: 2,
          },
        ],
      });
    }),
  });

  (mockFfmpeg as any).setFfmpegPath = jest.fn();
  (mockFfmpeg as any).ffprobe = jest.fn((file: string, callback: Function) => {
    callback(null, {
      format: {
        duration: 300,
        bit_rate: '5000000',
      },
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: 48000, channels: 2 },
      ],
    });
  });

  return mockFfmpeg;
});

// Mock @ffmpeg-installer/ffmpeg
jest.mock('@ffmpeg-installer/ffmpeg', () => ({
  path: '/usr/bin/ffmpeg',
}));

// Mock fs
jest.mock('fs', () => ({
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

describe('MultimediaMetadataService', () => {
  describe('extractAudioMetadata', () => {
    it('should extract metadata from audio buffer', async () => {
      const buffer = Buffer.from('fake mp3 data');
      const mimeType = 'audio/mpeg';

      const result = await extractAudioMetadata(buffer, mimeType);

      expect(result.duration).toBe(120.5);
      expect(result.bitrate).toBe(320); // 320000 / 1000
      expect(result.sampleRate).toBe(44100);
      expect(result.codec).toBe('mp3');
      expect(result.channels).toBe(2);
      expect(result.hasAudio).toBe(true);
      expect(result.hasVideo).toBe(false);
    });

    it('should extract title and artist from common tags', async () => {
      const buffer = Buffer.from('fake mp3 data');
      const mimeType = 'audio/mpeg';

      const result = await extractAudioMetadata(buffer, mimeType);

      expect(result.title).toBe('Test Audio');
      expect(result.artist).toBe('Test Artist');
      expect(result.album).toBe('Test Album');
      expect(result.year).toBe(2024);
    });
  });

  describe('validateMultimediaForClassification', () => {
    it('should allow UNCLASSIFIED files up to 500MB', () => {
      const metadata = { hasVideo: true, duration: 1800 };
      const result = validateMultimediaForClassification(
        metadata,
        'UNCLASSIFIED',
        400 * 1024 * 1024 // 400MB
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject SECRET files over 100MB', () => {
      const metadata = { hasVideo: false };
      const result = validateMultimediaForClassification(
        metadata,
        'SECRET',
        150 * 1024 * 1024 // 150MB
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('exceeds');
    });

    it('should reject TOP_SECRET videos over 15 minutes', () => {
      const metadata = { hasVideo: true, duration: 1200 }; // 20 minutes
      const result = validateMultimediaForClassification(
        metadata,
        'TOP_SECRET',
        30 * 1024 * 1024 // 30MB - within limit
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('duration');
    });

    it('should allow audio files without duration limit', () => {
      const metadata = { hasVideo: false, hasAudio: true, duration: 7200 }; // 2 hours
      const result = validateMultimediaForClassification(
        metadata,
        'SECRET',
        50 * 1024 * 1024 // 50MB
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('getSupportedAudioFormats', () => {
    it('should return list of supported audio MIME types', () => {
      const formats = getSupportedAudioFormats();

      expect(formats).toContain('audio/mpeg');
      expect(formats).toContain('audio/mp4');
      expect(formats).toContain('audio/wav');
      expect(formats).toContain('audio/ogg');
      expect(formats).toContain('audio/webm');
    });
  });

  describe('getSupportedVideoFormats', () => {
    it('should return list of supported video MIME types', () => {
      const formats = getSupportedVideoFormats();

      expect(formats).toContain('video/mp4');
      expect(formats).toContain('video/webm');
      expect(formats).toContain('video/ogg');
    });
  });

  describe('supportsEmbeddedXMP', () => {
    it('should return true for MP4 video', () => {
      expect(supportsEmbeddedXMP('video/mp4')).toBe(true);
    });

    it('should return true for M4A audio', () => {
      expect(supportsEmbeddedXMP('audio/mp4')).toBe(true);
    });

    it('should return false for MP3', () => {
      expect(supportsEmbeddedXMP('audio/mpeg')).toBe(false);
    });

    it('should return false for WAV', () => {
      expect(supportsEmbeddedXMP('audio/wav')).toBe(false);
    });

    it('should return false for WebM', () => {
      expect(supportsEmbeddedXMP('video/webm')).toBe(false);
    });
  });
});
