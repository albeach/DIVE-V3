/**
 * BulkActionsToolbar Component Tests
 * 
 * Tests for @/components/resources/bulk-actions-toolbar.tsx
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - Visibility based on selection
 * - Export functionality (CSV, JSON, Excel)
 * - Comparison trigger
 * - Clear selection
 * - Animations
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionsToolbar } from '@/components/resources/bulk-actions-toolbar';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, animate, exit, ...props }: React.PropsWithChildren<object>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, whileHover, whileTap, ...props }: React.PropsWithChildren<object>) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

// Mock export-resources
jest.mock('@/lib/export-resources', () => ({
  exportResources: jest.fn().mockResolvedValue({ success: true, filename: 'export.csv' }),
  getAvailableFormats: jest.fn(() => ['csv', 'json', 'xlsx']),
}));

const mockResources = [
  {
    resourceId: 'doc-1',
    title: 'Document 1',
    classification: 'SECRET',
    releasabilityTo: ['USA'],
    COI: [],
    encrypted: false,
  },
  {
    resourceId: 'doc-2',
    title: 'Document 2',
    classification: 'CONFIDENTIAL',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['NATO'],
    encrypted: true,
  },
  {
    resourceId: 'doc-3',
    title: 'Document 3',
    classification: 'UNCLASSIFIED',
    releasabilityTo: ['USA', 'FRA', 'GBR'],
    COI: [],
    encrypted: false,
  },
];

const defaultProps = {
  selectedIds: new Set<string>(),
  resources: mockResources,
  onClearSelection: jest.fn(),
  onCompare: jest.fn(),
  onExport: jest.fn(),
};

describe('BulkActionsToolbar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('visibility', () => {
    it('should not render when no items selected', () => {
      render(<BulkActionsToolbar {...defaultProps} />);
      
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });

    it('should render when items are selected', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('should show selection count', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2', 'doc-3'])} 
        />
      );
      
      expect(screen.getByText(/3.*selected/i)).toBeInTheDocument();
    });

    it('should update count when selection changes', () => {
      const { rerender } = render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      expect(screen.getByText(/1.*selected/i)).toBeInTheDocument();
      
      rerender(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2'])} 
        />
      );
      
      expect(screen.getByText(/2.*selected/i)).toBeInTheDocument();
    });
  });

  describe('clear selection', () => {
    it('should have clear selection button', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      expect(screen.getByRole('button', { name: /clear|deselect/i })).toBeInTheDocument();
    });

    it('should call onClearSelection when clear button clicked', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const clearButton = screen.getByRole('button', { name: /clear|deselect/i });
      await user.click(clearButton);
      
      expect(defaultProps.onClearSelection).toHaveBeenCalled();
    });
  });

  describe('export functionality', () => {
    it('should have export button', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    });

    it('should show export format dropdown when export clicked', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      // Should show format options
      expect(screen.getByText(/CSV/i)).toBeInTheDocument();
      expect(screen.getByText(/JSON/i)).toBeInTheDocument();
    });

    it('should call export with CSV format', async () => {
      const { exportResources } = require('@/lib/export-resources');
      const user = userEvent.setup();
      
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      const csvOption = screen.getByText(/CSV/i);
      await user.click(csvOption);
      
      await waitFor(() => {
        expect(exportResources).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ resourceId: 'doc-1' }),
            expect.objectContaining({ resourceId: 'doc-2' }),
          ]),
          expect.objectContaining({ format: 'csv' })
        );
      });
    });

    it('should call export with JSON format', async () => {
      const { exportResources } = require('@/lib/export-resources');
      const user = userEvent.setup();
      
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      const jsonOption = screen.getByText(/JSON/i);
      await user.click(jsonOption);
      
      await waitFor(() => {
        expect(exportResources).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({ format: 'json' })
        );
      });
    });

    it('should show loading state during export', async () => {
      const { exportResources } = require('@/lib/export-resources');
      exportResources.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000))
      );
      
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      const csvOption = screen.getByText(/CSV/i);
      await user.click(csvOption);
      
      // Should show loading indicator
      expect(screen.getByText(/exporting|loading/i)).toBeInTheDocument();
    });

    it('should show success message after export', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      const csvOption = screen.getByText(/CSV/i);
      await user.click(csvOption);
      
      await waitFor(() => {
        expect(screen.getByText(/success|exported|complete/i)).toBeInTheDocument();
      });
    });

    it('should handle export error gracefully', async () => {
      const { exportResources } = require('@/lib/export-resources');
      exportResources.mockRejectedValue(new Error('Export failed'));
      
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      const csvOption = screen.getByText(/CSV/i);
      await user.click(csvOption);
      
      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('compare functionality', () => {
    it('should have compare button', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2'])} 
        />
      );
      
      expect(screen.getByRole('button', { name: /compare/i })).toBeInTheDocument();
    });

    it('should disable compare when only 1 item selected', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const compareButton = screen.getByRole('button', { name: /compare/i });
      expect(compareButton).toBeDisabled();
    });

    it('should enable compare when 2+ items selected', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2'])} 
        />
      );
      
      const compareButton = screen.getByRole('button', { name: /compare/i });
      expect(compareButton).not.toBeDisabled();
    });

    it('should call onCompare with selected resources', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2'])} 
        />
      );
      
      const compareButton = screen.getByRole('button', { name: /compare/i });
      await user.click(compareButton);
      
      expect(defaultProps.onCompare).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ resourceId: 'doc-1' }),
          expect.objectContaining({ resourceId: 'doc-2' }),
        ])
      );
    });

    it('should limit comparison to max items', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2', 'doc-3'])} 
          maxCompareItems={2}
        />
      );
      
      // Should show warning or disable
      expect(screen.getByText(/max|limit|2/i)).toBeInTheDocument();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should support Escape to clear selection', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      await user.keyboard('{Escape}');
      
      expect(defaultProps.onClearSelection).toHaveBeenCalled();
    });

    it('should support keyboard activation of export', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      exportButton.focus();
      await user.keyboard('{Enter}');
      
      // Dropdown should open
      expect(screen.getByText(/CSV/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper toolbar role', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('should have accessible labels for buttons', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName();
      });
    });

    it('should announce selection count to screen readers', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1', 'doc-2'])} 
        />
      );
      
      // Check for aria-live region or status role
      const status = screen.getByRole('status') || document.querySelector('[aria-live]');
      expect(status).toBeInTheDocument();
    });

    it('should have proper aria-expanded on dropdown', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toHaveAttribute('aria-expanded', 'false');
      
      await user.click(exportButton);
      
      expect(exportButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('should support arrow key navigation in dropdown', async () => {
      const user = userEvent.setup();
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);
      
      await user.keyboard('{ArrowDown}');
      
      // First option should be focused
      const options = screen.getAllByRole('menuitem');
      expect(options[0]).toHaveFocus();
    });
  });

  describe('positioning', () => {
    it('should position at bottom of viewport', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const toolbar = screen.getByRole('toolbar');
      expect(toolbar).toHaveClass(/fixed|bottom/);
    });

    it('should be centered horizontally', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      const toolbar = screen.getByRole('toolbar');
      // Check for centering classes
      expect(toolbar.className).toMatch(/center|mx-auto|left-1\/2|translate-x/);
    });
  });

  describe('animations', () => {
    it('should animate in when items selected', () => {
      const { container } = render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      // Framer motion is mocked, but we can check the component renders
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('should animate out when selection cleared', () => {
      const { rerender } = render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
        />
      );
      
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
      
      rerender(<BulkActionsToolbar {...defaultProps} selectedIds={new Set()} />);
      
      expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    });
  });

  describe('selection indicator', () => {
    it('should render SelectionIndicator for compact view', () => {
      render(
        <BulkActionsToolbar 
          {...defaultProps} 
          selectedIds={new Set(['doc-1'])} 
          variant="compact"
        />
      );
      
      // Compact variant should show minimal UI
      const toolbar = screen.getByRole('toolbar');
      expect(toolbar.classList.length).toBeGreaterThan(0);
    });
  });
});





