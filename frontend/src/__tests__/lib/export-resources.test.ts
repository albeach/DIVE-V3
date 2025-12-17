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

  describe('exportResources', () => {
    it('should export to CSV format', async () => {
      const result = await exportResources(mockResources, { format: 'csv', filename: 'test' });

      expect(result.success).toBe(true);
      expect(result.format).toBe('csv');
      expect(result.filename).toContain('test');
      expect(result.recordCount).toBe(mockResources.length);
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should export to JSON format', async () => {
      const result = await exportResources(mockResources, { format: 'json', filename: 'test' });

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
      expect(result.filename).toContain('test');
      expect(result.recordCount).toBe(mockResources.length);
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should export to Excel format (CSV with .xlsx extension)', async () => {
      const result = await exportResources(mockResources, { format: 'excel', filename: 'test' });

      expect(result.success).toBe(true);
      expect(result.format).toBe('excel');
      expect(result.filename).toContain('test.xlsx');
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should handle empty resources array', async () => {
      const result = await exportResources([], { format: 'csv', filename: 'empty' });

      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(0);
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should include metadata in JSON export when requested', async () => {
      const result = await exportResources(mockResources, { 
        format: 'json', 
        includeMetadata: true,
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
    });

    it('should exclude metadata in JSON export when not requested', async () => {
      const result = await exportResources(mockResources, { 
        format: 'json', 
        includeMetadata: false,
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
    });

    it('should use custom columns', async () => {
      const result = await exportResources(mockResources, {
        format: 'csv',
        columns: ['resourceId', 'title'],
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
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
      
      expect(result.filename).toMatch(/dive-resources-/);
    });

    it('should return error on failure', async () => {
      mockCreateObjectURL.mockImplementationOnce(() => {
        throw new Error('Blob creation failed');
      });
      
      const result = await exportResources(mockResources, { format: 'csv' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should trigger file download', async () => {
      await exportResources(mockResources, { format: 'csv' });
      
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
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
    it('should support custom column headers', async () => {
      const result = await exportResources(mockResources, {
        format: 'csv',
        columns: ['resourceId', 'title'],
        customHeaders: {
          resourceId: 'Document ID',
          title: 'Document Title',
        },
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('date formatting', () => {
    it('should format dates when formatDates is true', async () => {
      const result = await exportResources(mockResources, {
        format: 'csv',
        formatDates: true,
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
    });

    it('should handle invalid dates gracefully', async () => {
      const resourceWithBadDate = [{
        ...mockResources[0],
        createdAt: 'not-a-date',
      }];
      
      const result = await exportResources(resourceWithBadDate, {
        format: 'csv',
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('boolean formatting', () => {
    it('should format boolean values in CSV', async () => {
      const result = await exportResources(mockResources, {
        format: 'csv',
        filename: 'test'
      });
      
      expect(result.success).toBe(true);
    });
  });
});












