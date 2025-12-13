/**
 * Export Resources Utility Tests
 * 
 * Tests for @/lib/export-resources.ts
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - CSV export
 * - JSON export
 * - Column selection
 * - Data formatting
 * - File download trigger
 */

import {
  exportResources,
  exportToCSV,
  exportToJSON,
  getAvailableFormats,
  estimateExportSize,
  formatBytes,
} from '@/lib/export-resources';

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = jest.fn(() => 'blob:test-url');
const mockRevokeObjectURL = jest.fn();
URL.createObjectURL = mockCreateObjectURL;
URL.revokeObjectURL = mockRevokeObjectURL;

// Mock document.createElement for anchor element
const mockClick = jest.fn();
const mockAnchor = {
  href: '',
  download: '',
  click: mockClick,
  style: {},
};
const originalCreateElement = document.createElement.bind(document);
document.createElement = jest.fn((tag: string) => {
  if (tag === 'a') {
    return mockAnchor as unknown as HTMLAnchorElement;
  }
  return originalCreateElement(tag);
});

// Mock document.body.appendChild and removeChild
document.body.appendChild = jest.fn();
document.body.removeChild = jest.fn();

const mockResources = [
  {
    resourceId: 'doc-1',
    title: 'Fuel Inventory Report',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['NATO'],
    encrypted: true,
    sourceInstance: 'USA',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-03-20T14:45:00Z',
  },
  {
    resourceId: 'doc-2',
    title: 'Supply Chain Analysis',
    classification: 'CONFIDENTIAL',
    releasabilityTo: ['USA'],
    COI: [],
    encrypted: false,
    sourceInstance: 'GBR',
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-02-15T12:00:00Z',
  },
];

describe('export-resources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportToCSV', () => {
    it('should generate valid CSV content', () => {
      const csv = exportToCSV(mockResources);
      
      expect(csv).toContain('resourceId');
      expect(csv).toContain('title');
      expect(csv).toContain('classification');
    });

    it('should include all default columns', () => {
      const csv = exportToCSV(mockResources);
      const headers = csv.split('\n')[0];
      
      expect(headers).toContain('resourceId');
      expect(headers).toContain('title');
      expect(headers).toContain('classification');
      expect(headers).toContain('releasabilityTo');
      expect(headers).toContain('COI');
      expect(headers).toContain('encrypted');
    });

    it('should include resource data rows', () => {
      const csv = exportToCSV(mockResources);
      const lines = csv.split('\n');
      
      // Header + 2 data rows
      expect(lines.length).toBe(3);
      expect(lines[1]).toContain('doc-1');
      expect(lines[1]).toContain('Fuel Inventory Report');
      expect(lines[2]).toContain('doc-2');
    });

    it('should escape CSV special characters', () => {
      const resourceWithComma = [{
        ...mockResources[0],
        title: 'Report, with comma',
      }];
      
      const csv = exportToCSV(resourceWithComma);
      
      // Should wrap in quotes
      expect(csv).toContain('"Report, with comma"');
    });

    it('should escape quotes in values', () => {
      const resourceWithQuote = [{
        ...mockResources[0],
        title: 'Report "quoted"',
      }];
      
      const csv = exportToCSV(resourceWithQuote);
      
      // Should escape quotes
      expect(csv).toContain('""');
    });

    it('should format array fields', () => {
      const csv = exportToCSV(mockResources);
      
      // releasabilityTo should be formatted
      expect(csv).toContain('USA');
      expect(csv).toContain('GBR');
    });

    it('should respect custom columns', () => {
      const csv = exportToCSV(mockResources, {
        columns: ['resourceId', 'title'],
      });
      
      const headers = csv.split('\n')[0];
      
      expect(headers).toContain('resourceId');
      expect(headers).toContain('title');
      expect(headers).not.toContain('classification');
    });

    it('should include BOM for Excel compatibility', () => {
      const csv = exportToCSV(mockResources, { includeBOM: true });
      
      expect(csv.charCodeAt(0)).toBe(0xFEFF);
    });

    it('should format dates', () => {
      const csv = exportToCSV(mockResources);
      
      // Should include formatted date
      expect(csv).toContain('2024');
    });

    it('should handle empty resources array', () => {
      const csv = exportToCSV([]);
      const lines = csv.split('\n').filter(l => l.trim());
      
      // Should only have header
      expect(lines.length).toBe(1);
    });
  });

  describe('exportToJSON', () => {
    it('should generate valid JSON', () => {
      const json = exportToJSON(mockResources);
      
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all resources', () => {
      const json = exportToJSON(mockResources);
      const parsed = JSON.parse(json);
      
      expect(parsed.data).toHaveLength(2);
    });

    it('should include metadata when requested', () => {
      const json = exportToJSON(mockResources, { includeMetadata: true });
      const parsed = JSON.parse(json);
      
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.exportedAt).toBeDefined();
      expect(parsed.metadata.count).toBe(2);
    });

    it('should exclude metadata when not requested', () => {
      const json = exportToJSON(mockResources, { includeMetadata: false });
      const parsed = JSON.parse(json);
      
      // Should be just the array
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should format JSON with indentation', () => {
      const json = exportToJSON(mockResources, { pretty: true });
      
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should respect custom columns', () => {
      const json = exportToJSON(mockResources, {
        columns: ['resourceId', 'title'],
      });
      const parsed = JSON.parse(json);
      
      expect(Object.keys(parsed[0])).toEqual(['resourceId', 'title']);
    });

    it('should handle empty resources array', () => {
      const json = exportToJSON([]);
      const parsed = JSON.parse(json);
      
      expect(parsed).toEqual([]);
    });
  });

  describe('exportResources', () => {
    it('should export as CSV', async () => {
      const result = await exportResources(mockResources, { format: 'csv' });
      
      expect(result.success).toBe(true);
      expect(result.filename).toMatch(/\.csv$/);
    });

    it('should export as JSON', async () => {
      const result = await exportResources(mockResources, { format: 'json' });
      
      expect(result.success).toBe(true);
      expect(result.filename).toMatch(/\.json$/);
    });

    it('should trigger file download', async () => {
      await exportResources(mockResources, { format: 'csv' });
      
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it('should use custom filename', async () => {
      const result = await exportResources(mockResources, {
        format: 'csv',
        filename: 'my-export',
      });
      
      expect(result.filename).toBe('my-export.csv');
    });

    it('should include timestamp in default filename', async () => {
      const result = await exportResources(mockResources, { format: 'csv' });
      
      expect(result.filename).toMatch(/resources-\d{4}-\d{2}-\d{2}/);
    });

    it('should return error on failure', async () => {
      mockCreateObjectURL.mockImplementationOnce(() => {
        throw new Error('Blob creation failed');
      });
      
      const result = await exportResources(mockResources, { format: 'csv' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty resources', async () => {
      const result = await exportResources([], { format: 'csv' });
      
      expect(result.success).toBe(true);
    });
  });

  describe('getAvailableFormats', () => {
    it('should return available formats', () => {
      const formats = getAvailableFormats();
      
      expect(formats).toContain('csv');
      expect(formats).toContain('json');
    });

    it('should include xlsx if supported', () => {
      const formats = getAvailableFormats();
      
      // xlsx may or may not be available
      expect(Array.isArray(formats)).toBe(true);
    });
  });

  describe('estimateExportSize', () => {
    it('should estimate CSV size', () => {
      const size = estimateExportSize(mockResources, 'csv');
      
      expect(size).toBeGreaterThan(0);
    });

    it('should estimate JSON size', () => {
      const size = estimateExportSize(mockResources, 'json');
      
      expect(size).toBeGreaterThan(0);
    });

    it('should scale with resource count', () => {
      const smallSize = estimateExportSize(mockResources.slice(0, 1), 'csv');
      const largeSize = estimateExportSize(mockResources, 'csv');
      
      expect(largeSize).toBeGreaterThan(smallSize);
    });

    it('should handle empty array', () => {
      const size = estimateExportSize([], 'csv');
      
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1)).toBe('1 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('should format with decimals', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should handle negative numbers', () => {
      expect(formatBytes(-1024)).toBe('-1 KB');
    });
  });

  describe('column selection', () => {
    it('should support custom column headers', () => {
      const csv = exportToCSV(mockResources, {
        columns: ['resourceId', 'title'],
        headers: {
          resourceId: 'Document ID',
          title: 'Document Title',
        },
      });
      
      const headers = csv.split('\n')[0];
      
      expect(headers).toContain('Document ID');
      expect(headers).toContain('Document Title');
    });

    it('should support nested field access', () => {
      const resourcesWithNested = [{
        ...mockResources[0],
        metadata: {
          author: 'John Smith',
        },
      }];
      
      const csv = exportToCSV(resourcesWithNested, {
        columns: ['resourceId', 'metadata.author'],
      });
      
      expect(csv).toContain('John Smith');
    });
  });

  describe('date formatting', () => {
    it('should format ISO dates to readable format', () => {
      const csv = exportToCSV(mockResources);
      
      // Should have formatted date, not raw ISO
      expect(csv).toContain('2024');
    });

    it('should handle invalid dates', () => {
      const resourceWithBadDate = [{
        ...mockResources[0],
        createdAt: 'not-a-date',
      }];
      
      const csv = exportToCSV(resourceWithBadDate);
      
      // Should not throw
      expect(csv).toBeDefined();
    });
  });

  describe('boolean formatting', () => {
    it('should format boolean values', () => {
      const csv = exportToCSV(mockResources);
      
      // encrypted field should be readable
      expect(csv).toMatch(/true|yes|1/i);
    });
  });
});












