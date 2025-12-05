/**
 * ResourcePreviewModal Component Tests
 * 
 * Tests for @/components/resources/resource-preview-modal.tsx
 * Phase 3: Power User Features
 * 
 * Coverage targets:
 * - Modal open/close
 * - Resource details display
 * - Navigation (prev/next)
 * - Actions (download, bookmark, decrypt)
 * - Keyboard shortcuts
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourcePreviewModal } from '@/components/resources/resource-preview-modal';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: React.PropsWithChildren<object>) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

const mockResource = {
  resourceId: 'doc-1',
  title: 'Fuel Inventory Report Q4 2024',
  classification: 'SECRET',
  releasabilityTo: ['USA', 'GBR'],
  COI: ['NATO'],
  encrypted: true,
  sourceInstance: 'USA',
  content: 'This is the document content for the fuel inventory report...',
  createdAt: '2024-01-15T10:30:00Z',
  updatedAt: '2024-03-20T14:45:00Z',
  metadata: {
    author: 'John Smith',
    department: 'Logistics',
    version: '1.2',
  },
};

const defaultProps = {
  resource: mockResource,
  isOpen: true,
  onClose: jest.fn(),
  onNavigatePrev: jest.fn(),
  onNavigateNext: jest.fn(),
  onDownload: jest.fn(),
  onBookmark: jest.fn(),
  onDecrypt: jest.fn(),
  hasPrev: true,
  hasNext: true,
  currentIndex: 5,
  totalCount: 50,
};

describe('ResourcePreviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render when open', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(<ResourcePreviewModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display resource title', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText('Fuel Inventory Report Q4 2024')).toBeInTheDocument();
    });

    it('should display resource classification', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText('SECRET')).toBeInTheDocument();
    });

    it('should display releasability', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText(/USA/)).toBeInTheDocument();
      expect(screen.getByText(/GBR/)).toBeInTheDocument();
    });

    it('should display COI tags', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText('NATO')).toBeInTheDocument();
    });

    it('should display content preview', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText(/fuel inventory report/i)).toBeInTheDocument();
    });

    it('should display metadata', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText(/John Smith/)).toBeInTheDocument();
      expect(screen.getByText(/Logistics/)).toBeInTheDocument();
    });

    it('should display timestamps', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      // Should show created/updated dates
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('should show position indicator', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      // 6 of 50 (1-indexed display)
      expect(screen.getByText(/6.*of.*50|6\/50/i)).toBeInTheDocument();
    });
  });

  describe('encrypted resources', () => {
    it('should show encrypted indicator', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText(/encrypted/i)).toBeInTheDocument();
    });

    it('should show decrypt button for encrypted resources', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /decrypt/i })).toBeInTheDocument();
    });

    it('should hide content when encrypted and not decrypted', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      // Content should be obscured or show placeholder
      const contentArea = screen.getByTestId('content-preview');
      expect(contentArea).toHaveClass(/blur|hidden|placeholder/);
    });

    it('should call onDecrypt when decrypt button clicked', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const decryptButton = screen.getByRole('button', { name: /decrypt/i });
      await user.click(decryptButton);
      
      expect(defaultProps.onDecrypt).toHaveBeenCalledWith(mockResource);
    });

    it('should not show decrypt button for unencrypted resources', () => {
      render(
        <ResourcePreviewModal 
          {...defaultProps} 
          resource={{ ...mockResource, encrypted: false }}
        />
      );
      
      expect(screen.queryByRole('button', { name: /decrypt/i })).not.toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('should have prev/next buttons', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /prev|previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('should call onNavigatePrev when prev clicked', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const prevButton = screen.getByRole('button', { name: /prev|previous/i });
      await user.click(prevButton);
      
      expect(defaultProps.onNavigatePrev).toHaveBeenCalled();
    });

    it('should call onNavigateNext when next clicked', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);
      
      expect(defaultProps.onNavigateNext).toHaveBeenCalled();
    });

    it('should disable prev button when hasPrev is false', () => {
      render(<ResourcePreviewModal {...defaultProps} hasPrev={false} />);
      
      const prevButton = screen.getByRole('button', { name: /prev|previous/i });
      expect(prevButton).toBeDisabled();
    });

    it('should disable next button when hasNext is false', () => {
      render(<ResourcePreviewModal {...defaultProps} hasNext={false} />);
      
      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });
  });

  describe('actions', () => {
    it('should have close button', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('should call onClose when close button clicked', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should have download button', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });

    it('should call onDownload when download clicked', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const downloadButton = screen.getByRole('button', { name: /download/i });
      await user.click(downloadButton);
      
      expect(defaultProps.onDownload).toHaveBeenCalledWith(mockResource);
    });

    it('should have bookmark button', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByRole('button', { name: /bookmark/i })).toBeInTheDocument();
    });

    it('should call onBookmark when bookmark clicked', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const bookmarkButton = screen.getByRole('button', { name: /bookmark/i });
      await user.click(bookmarkButton);
      
      expect(defaultProps.onBookmark).toHaveBeenCalledWith(mockResource);
    });

    it('should show bookmarked state when resource is bookmarked', () => {
      render(<ResourcePreviewModal {...defaultProps} isBookmarked />);
      
      const bookmarkButton = screen.getByRole('button', { name: /bookmark/i });
      expect(bookmarkButton).toHaveClass(/active|filled/);
    });
  });

  describe('keyboard shortcuts', () => {
    it('should close on Escape', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('{Escape}');
      
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should navigate prev on ArrowLeft', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('{ArrowLeft}');
      
      expect(defaultProps.onNavigatePrev).toHaveBeenCalled();
    });

    it('should navigate next on ArrowRight', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('{ArrowRight}');
      
      expect(defaultProps.onNavigateNext).toHaveBeenCalled();
    });

    it('should navigate prev on j key', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('j');
      
      expect(defaultProps.onNavigatePrev).toHaveBeenCalled();
    });

    it('should navigate next on k key', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('k');
      
      expect(defaultProps.onNavigateNext).toHaveBeenCalled();
    });

    it('should toggle bookmark on b key', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('b');
      
      expect(defaultProps.onBookmark).toHaveBeenCalled();
    });

    it('should trigger download on d key', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('d');
      
      expect(defaultProps.onDownload).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have proper dialog role', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('should have accessible title', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });

    it('should trap focus within modal', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      // Tab through focusable elements
      await user.tab();
      await user.tab();
      await user.tab();
      
      // Focus should stay within modal
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('should return focus on close', async () => {
      const triggerRef = { current: document.createElement('button') };
      document.body.appendChild(triggerRef.current);
      triggerRef.current.focus();
      
      const { rerender } = render(
        <ResourcePreviewModal {...defaultProps} triggerRef={triggerRef} />
      );
      
      rerender(<ResourcePreviewModal {...defaultProps} isOpen={false} triggerRef={triggerRef} />);
      
      await waitFor(() => {
        expect(document.activeElement).toBe(triggerRef.current);
      });
      
      document.body.removeChild(triggerRef.current);
    });

    it('should announce navigation to screen readers', async () => {
      const user = userEvent.setup();
      render(<ResourcePreviewModal {...defaultProps} />);
      
      await user.keyboard('{ArrowRight}');
      
      // Check for aria-live announcement
      const liveRegion = document.querySelector('[aria-live]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('should have accessible classification badge', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      const badge = screen.getByText('SECRET');
      expect(badge).toHaveAttribute('role', 'status');
    });
  });

  describe('loading state', () => {
    it('should show loading spinner during decrypt', () => {
      render(<ResourcePreviewModal {...defaultProps} isDecrypting />);
      
      expect(screen.getByText(/decrypting|loading/i)).toBeInTheDocument();
    });

    it('should disable actions during loading', () => {
      render(<ResourcePreviewModal {...defaultProps} isLoading />);
      
      const downloadButton = screen.getByRole('button', { name: /download/i });
      expect(downloadButton).toBeDisabled();
    });
  });

  describe('error handling', () => {
    it('should display error message', () => {
      render(<ResourcePreviewModal {...defaultProps} error="Failed to load resource" />);
      
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });

    it('should show retry button on error', () => {
      render(<ResourcePreviewModal {...defaultProps} error="Failed to load resource" />);
      
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe('null resource', () => {
    it('should handle null resource gracefully', () => {
      render(<ResourcePreviewModal {...defaultProps} resource={null} />);
      
      // Should show empty state or not render
      expect(screen.queryByText('Fuel Inventory Report')).not.toBeInTheDocument();
    });
  });

  describe('classification colors', () => {
    it.each([
      ['UNCLASSIFIED', /green/],
      ['CONFIDENTIAL', /blue/],
      ['SECRET', /red/],
      ['TOP_SECRET', /orange|amber/],
    ])('should apply correct color for %s', (classification, colorPattern) => {
      render(
        <ResourcePreviewModal 
          {...defaultProps} 
          resource={{ ...mockResource, classification }}
        />
      );
      
      const badge = screen.getByText(classification);
      expect(badge.className).toMatch(colorPattern);
    });
  });

  describe('instance indicator', () => {
    it('should show source instance', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      expect(screen.getByText(/USA|🇺🇸/)).toBeInTheDocument();
    });

    it('should show flag for instance', () => {
      render(<ResourcePreviewModal {...defaultProps} />);
      
      // Check for flag emoji or flag icon
      expect(document.querySelector('[aria-label*="USA"], [title*="USA"]')).toBeInTheDocument();
    });
  });
});





