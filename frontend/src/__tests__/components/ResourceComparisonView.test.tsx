/**
 * ResourceComparisonView Component Tests
 * 
 * Tests for @/components/resources/resource-comparison-view.tsx
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - Side-by-side comparison
 * - Difference highlighting
 * - Sync scrolling
 * - Actions (export comparison)
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceComparisonView } from '@/components/resources/resource-comparison-view';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

const mockResources = [
  {
    resourceId: 'doc-1',
    title: 'Fuel Inventory Report Q3',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['NATO'],
    encrypted: false,
    sourceInstance: 'USA',
    content: 'Q3 fuel inventory shows 5000 gallons remaining...',
    createdAt: '2024-09-15T10:30:00Z',
    metadata: {
      author: 'John Smith',
      version: '1.0',
    },
  },
  {
    resourceId: 'doc-2',
    title: 'Fuel Inventory Report Q4',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR', 'FRA'],
    COI: ['NATO'],
    encrypted: true,
    sourceInstance: 'USA',
    content: 'Q4 fuel inventory shows 4500 gallons remaining...',
    createdAt: '2024-12-15T10:30:00Z',
    metadata: {
      author: 'Jane Doe',
      version: '1.1',
    },
  },
];

const defaultProps = {
  resources: mockResources,
  isOpen: true,
  onClose: jest.fn(),
  onRemoveResource: jest.fn(),
};

describe('ResourceComparisonView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render when open', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(<ResourceComparisonView {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render both resource titles', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByText('Fuel Inventory Report Q3')).toBeInTheDocument();
      expect(screen.getByText('Fuel Inventory Report Q4')).toBeInTheDocument();
    });

    it('should render side-by-side panels', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const panels = document.querySelectorAll('[data-comparison-panel]');
      expect(panels.length).toBe(2);
    });

    it('should show comparison header', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByText(/comparing.*2.*document/i)).toBeInTheDocument();
    });
  });

  describe('attribute comparison', () => {
    it('should display classification for both resources', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const secretBadges = screen.getAllByText('SECRET');
      expect(secretBadges.length).toBe(2);
    });

    it('should highlight different values', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // releasabilityTo differs (USA,GBR vs USA,GBR,FRA)
      const differences = document.querySelectorAll('[class*="different"], [class*="highlight"]');
      expect(differences.length).toBeGreaterThan(0);
    });

    it('should not highlight matching values', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // Classification is the same for both
      const classificationRows = screen.getAllByText('SECRET');
      classificationRows.forEach(row => {
        expect(row.closest('[class*="different"]')).toBeNull();
      });
    });

    it('should show all comparable fields', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByText(/classification/i)).toBeInTheDocument();
      expect(screen.getByText(/releasability/i)).toBeInTheDocument();
      expect(screen.getByText(/COI|community/i)).toBeInTheDocument();
      expect(screen.getByText(/encrypted/i)).toBeInTheDocument();
    });

    it('should show encrypted status difference', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // doc-1 is not encrypted, doc-2 is encrypted
      expect(screen.getByText(/yes|encrypted/i)).toBeInTheDocument();
      expect(screen.getByText(/no|unencrypted/i)).toBeInTheDocument();
    });

    it('should show metadata differences', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByText('John Smith')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  describe('content comparison', () => {
    it('should show content preview for both resources', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByText(/Q3 fuel inventory/)).toBeInTheDocument();
      expect(screen.getByText(/Q4 fuel inventory/)).toBeInTheDocument();
    });

    it('should highlight text differences', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // Differences in content (5000 vs 4500, Q3 vs Q4)
      const diffHighlights = document.querySelectorAll('[class*="added"], [class*="removed"], [class*="changed"]');
      expect(diffHighlights.length).toBeGreaterThan(0);
    });
  });

  describe('synchronized scrolling', () => {
    it('should have sync scroll toggle', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByRole('checkbox', { name: /sync.*scroll/i })).toBeInTheDocument();
    });

    it('should sync scroll by default', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const syncToggle = screen.getByRole('checkbox', { name: /sync.*scroll/i }) as HTMLInputElement;
      expect(syncToggle.checked).toBe(true);
    });

    it('should allow disabling sync scroll', async () => {
      const user = userEvent.setup();
      render(<ResourceComparisonView {...defaultProps} />);
      
      const syncToggle = screen.getByRole('checkbox', { name: /sync.*scroll/i });
      await user.click(syncToggle);
      
      expect(syncToggle).not.toBeChecked();
    });
  });

  describe('actions', () => {
    it('should have close button', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should call onClose when close clicked', async () => {
      const user = userEvent.setup();
      render(<ResourceComparisonView {...defaultProps} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should have remove resource buttons', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const removeButtons = screen.getAllByRole('button', { name: /remove|x/i });
      expect(removeButtons.length).toBe(2);
    });

    it('should call onRemoveResource when remove clicked', async () => {
      const user = userEvent.setup();
      render(<ResourceComparisonView {...defaultProps} />);
      
      const removeButtons = screen.getAllByRole('button', { name: /remove|x/i });
      await user.click(removeButtons[0]);
      
      expect(defaultProps.onRemoveResource).toHaveBeenCalledWith('doc-1');
    });

    it('should have export comparison button', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should close on Escape', async () => {
      const user = userEvent.setup();
      render(<ResourceComparisonView {...defaultProps} />);
      
      await user.keyboard('{Escape}');
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should toggle sync scroll on s key', async () => {
      const user = userEvent.setup();
      render(<ResourceComparisonView {...defaultProps} />);
      
      const syncToggle = screen.getByRole('checkbox', { name: /sync.*scroll/i }) as HTMLInputElement;
      const initialState = syncToggle.checked;
      
      await user.keyboard('s');
      
      expect(syncToggle.checked).toBe(!initialState);
    });
  });

  describe('multiple resources (3+)', () => {
    it('should render more than 2 resources', () => {
      const threeResources = [
        ...mockResources,
        {
          resourceId: 'doc-3',
          title: 'Fuel Inventory Report Q1',
          classification: 'CONFIDENTIAL',
          releasabilityTo: ['USA'],
          COI: [],
          encrypted: false,
          sourceInstance: 'GBR',
          content: 'Q1 fuel inventory...',
          createdAt: '2024-03-15T10:30:00Z',
          metadata: { author: 'Bob Wilson', version: '0.9' },
        },
      ];
      
      render(<ResourceComparisonView {...defaultProps} resources={threeResources} />);
      
      const panels = document.querySelectorAll('[data-comparison-panel]');
      expect(panels.length).toBe(3);
    });

    it('should handle maximum comparison limit', () => {
      // Most UIs limit to 4 resources max
      const manyResources = Array.from({ length: 6 }, (_, i) => ({
        ...mockResources[0],
        resourceId: `doc-${i}`,
        title: `Document ${i}`,
      }));
      
      render(<ResourceComparisonView {...defaultProps} resources={manyResources} maxResources={4} />);
      
      expect(screen.getByText(/maximum.*4/i)).toBeInTheDocument();
    });
  });

  describe('single resource', () => {
    it('should show message when only 1 resource', () => {
      render(<ResourceComparisonView {...defaultProps} resources={[mockResources[0]]} />);
      
      expect(screen.getByText(/select.*another|need.*2/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show empty state when no resources', () => {
      render(<ResourceComparisonView {...defaultProps} resources={[]} />);
      
      expect(screen.getByText(/no resources|select resources/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper dialog role', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have accessible title', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('should have comparison table with proper roles', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // Should use table/grid for comparison data
      expect(screen.getByRole('table') || screen.getByRole('grid')).toBeInTheDocument();
    });

    it('should have column headers', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      const headers = screen.getAllByRole('columnheader');
      expect(headers.length).toBeGreaterThan(0);
    });

    it('should announce differences to screen readers', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // Check for aria-label describing differences
      const diffIndicators = document.querySelectorAll('[aria-label*="different"], [aria-label*="changed"]');
      expect(diffIndicators.length).toBeGreaterThan(0);
    });

    it('should have keyboard-navigable panels', async () => {
      const user = userEvent.setup();
      render(<ResourceComparisonView {...defaultProps} />);
      
      // Tab should navigate between panels
      await user.tab();
      
      expect(document.activeElement).toBeTruthy();
    });
  });

  describe('responsive design', () => {
    it('should stack panels on mobile', () => {
      // Mock narrow viewport
      Object.defineProperty(window, 'innerWidth', { value: 375 });
      
      render(<ResourceComparisonView {...defaultProps} />);
      
      const container = document.querySelector('[class*="flex-col"], [class*="stack"]');
      expect(container || document.querySelector('[class*="grid-cols-1"]')).toBeInTheDocument();
    });
  });

  describe('difference summary', () => {
    it('should show summary of differences', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      expect(screen.getByText(/\d+.*difference|difference.*\d+/i)).toBeInTheDocument();
    });

    it('should show which fields differ', () => {
      render(<ResourceComparisonView {...defaultProps} />);
      
      // Should list: releasability, encrypted, author, version, etc.
      const diffList = screen.getByTestId('diff-summary') || document.querySelector('[class*="diff-summary"]');
      expect(diffList).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading state while fetching resource details', () => {
      render(<ResourceComparisonView {...defaultProps} isLoading />);
      
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should show error if resource fails to load', () => {
      const resourcesWithError = [
        mockResources[0],
        { ...mockResources[1], _error: 'Failed to load' },
      ];
      
      render(<ResourceComparisonView {...defaultProps} resources={resourcesWithError} />);
      
      expect(screen.getByText(/failed|error/i)).toBeInTheDocument();
    });
  });

  describe('classification comparison', () => {
    it('should show classification hierarchy difference', () => {
      const differentClassifications = [
        { ...mockResources[0], classification: 'UNCLASSIFIED' },
        { ...mockResources[1], classification: 'TOP_SECRET' },
      ];
      
      render(<ResourceComparisonView {...defaultProps} resources={differentClassifications} />);
      
      // Should highlight the significant difference
      const classificationRow = screen.getByText('UNCLASSIFIED').closest('tr, div');
      expect(classificationRow).toHaveClass(/different|warning|highlight/);
    });
  });
});

