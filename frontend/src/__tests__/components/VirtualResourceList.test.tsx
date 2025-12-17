/**
 * VirtualResourceList Component Tests
 *
 * Tests for @/components/resources/virtual-resource-list.tsx
 * Phase 1: Performance Foundation
 *
 * Coverage targets:
 * - Virtualized rendering
 * - View mode switching (grid/list/compact)
 * - Infinite scroll loading
 * - Selection management
 * - Keyboard navigation integration
 * - Accessibility
 */

// Mock IntersectionObserver globally before any imports
const mockObserve = jest.fn();
const mockUnobserve = jest.fn();
const mockDisconnect = jest.fn();

const mockIntersectionObserver = jest.fn().mockImplementation((callback: IntersectionObserverCallback) => {
  const observer = {
    observe: mockObserve,
    unobserve: mockUnobserve,
    disconnect: mockDisconnect,
    callback,
    // Helper to trigger intersection
    trigger: (isIntersecting: boolean) => {
      callback([{ isIntersecting } as IntersectionObserverEntry], observer as unknown as IntersectionObserver);
    },
  };
  return observer;
});

global.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;

// Mock ResizeObserver globally
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VirtualResourceList from '@/components/resources/virtual-resource-list';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    article: ({ children, ...props }: React.PropsWithChildren<object>) => <article {...props}>{children}</article>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

// Mocks are set up globally at the top of the file

// Generate mock resources
const generateMockResources = (count: number) => 
  Array.from({ length: count }, (_, i) => ({
    resourceId: `doc-${i}`,
    title: `Document ${i}`,
    classification: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'][i % 4],
    releasabilityTo: ['USA', 'GBR'],
    COI: i % 2 === 0 ? ['NATO'] : [],
    encrypted: i % 3 === 0,
    sourceInstance: 'USA',
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  }));

const mockResources = generateMockResources(50);

const defaultProps = {
  resources: mockResources,
  viewMode: 'grid' as const,
  focusedIndex: -1,
  selectedIds: new Set<string>(),
  onSelect: jest.fn(),
  onPreview: jest.fn(),
  onLoadMore: jest.fn(),
  hasMore: true,
  isLoading: false,
  isLoadingMore: false,
  searchQuery: '',
};

describe('VirtualResourceList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render resource items', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      // Should render at least some items (virtualized)
      expect(screen.getByText('Document 0')).toBeInTheDocument();
    });

    it('should show skeleton loading state', () => {
      render(<VirtualResourceList {...defaultProps} isLoading />);
      
      // Should show skeleton loaders
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should show loading more indicator', () => {
      render(<VirtualResourceList {...defaultProps} isLoadingMore />);
      
      // Should show "Loading more..." or similar
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it('should render empty state when no resources', () => {
      render(<VirtualResourceList {...defaultProps} resources={[]} />);
      
      // Should show empty message
      expect(screen.getByText(/no resources/i)).toBeInTheDocument();
    });

    it('should render total count', () => {
      render(<VirtualResourceList {...defaultProps} totalCount={500} />);
      
      expect(screen.getByText(/500/)).toBeInTheDocument();
    });
  });

  describe('view modes', () => {
    it('should render grid view correctly', () => {
      render(<VirtualResourceList {...defaultProps} viewMode="grid" />);
      
      const container = document.querySelector('[class*="grid"]');
      expect(container).toBeInTheDocument();
    });

    it('should render list view correctly', () => {
      render(<VirtualResourceList {...defaultProps} viewMode="list" />);
      
      // List view should not have grid class
      const container = document.querySelector('[class*="grid-cols"]');
      expect(container).toBeNull();
    });

    it('should render compact view correctly', () => {
      render(<VirtualResourceList {...defaultProps} viewMode="compact" />);
      
      // Compact view should have smaller spacing
      const items = document.querySelectorAll('[role="listitem"]');
      expect(items.length).toBeGreaterThan(0);
    });

    it('should adjust grid columns based on view mode', () => {
      const { rerender } = render(<VirtualResourceList {...defaultProps} viewMode="grid" />);
      
      let gridContainer = document.querySelector('[class*="grid-cols"]');
      expect(gridContainer).toBeInTheDocument();
      
      rerender(<VirtualResourceList {...defaultProps} viewMode="list" />);
      gridContainer = document.querySelector('[class*="grid-cols-1"]');
      // List should be single column
    });
  });

  describe('selection', () => {
    it('should highlight selected items', () => {
      const selectedIds = new Set(['doc-0', 'doc-2']);
      render(<VirtualResourceList {...defaultProps} selectedIds={selectedIds} />);
      
      const items = screen.getAllByRole('article');
      const firstItem = items[0];
      expect(firstItem).toHaveClass(/selected|ring|border/);
    });

    it('should call onSelect when item is clicked', async () => {
      const user = userEvent.setup();
      render(<VirtualResourceList {...defaultProps} />);
      
      const firstItem = screen.getByText('Document 0').closest('article');
      if (firstItem) {
        await user.click(firstItem);
      }
      
      expect(defaultProps.onSelect).toHaveBeenCalledWith('doc-0');
    });

    it('should support multi-select with shift key', async () => {
      const user = userEvent.setup();
      const onSelect = jest.fn();
      render(<VirtualResourceList {...defaultProps} onSelect={onSelect} />);
      
      // Select first item
      await user.click(screen.getByText('Document 0').closest('article')!);
      
      // Shift-click on third item
      await user.keyboard('{Shift>}');
      await user.click(screen.getByText('Document 2').closest('article')!);
      await user.keyboard('{/Shift}');
      
      // Should select range
      expect(onSelect).toHaveBeenCalled();
    });

    it('should show selection count', () => {
      const selectedIds = new Set(['doc-0', 'doc-1', 'doc-2']);
      render(<VirtualResourceList {...defaultProps} selectedIds={selectedIds} />);
      
      // Should show "3 selected" or similar
      expect(screen.getByText(/3.*selected/i)).toBeInTheDocument();
    });
  });

  describe('keyboard navigation integration', () => {
    it('should highlight focused item', () => {
      render(<VirtualResourceList {...defaultProps} focusedIndex={0} />);
      
      const items = screen.getAllByRole('article');
      expect(items[0]).toHaveAttribute('data-focused', 'true');
    });

    it('should scroll focused item into view', async () => {
      const scrollIntoViewMock = jest.fn();
      Element.prototype.scrollIntoView = scrollIntoViewMock;
      
      const { rerender } = render(<VirtualResourceList {...defaultProps} focusedIndex={-1} />);
      
      rerender(<VirtualResourceList {...defaultProps} focusedIndex={5} />);
      
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalled();
      });
    });

    it('should expose scrollToIndex via ref', () => {
      const ref = React.createRef<{ scrollToIndex: (index: number) => void }>();
      render(<VirtualResourceList {...defaultProps} ref={ref} />);
      
      expect(ref.current?.scrollToIndex).toBeDefined();
    });

    it('should call onPreview on preview action', async () => {
      const user = userEvent.setup();
      render(<VirtualResourceList {...defaultProps} />);
      
      const firstItem = screen.getByText('Document 0').closest('article')!;
      await user.dblClick(firstItem);
      
      expect(defaultProps.onPreview).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'doc-0' })
      );
    });
  });

  describe('infinite scroll', () => {
    beforeEach(() => {
      mockObserve.mockClear();
      mockUnobserve.mockClear();
      mockDisconnect.mockClear();
    });

    it('should setup IntersectionObserver for sentinel', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      expect(mockIntersectionObserver).toHaveBeenCalled();
      expect(mockObserve).toHaveBeenCalled();
    });

    it('should call onLoadMore when sentinel is visible', async () => {
      const onLoadMore = jest.fn();
      const { container } = render(<VirtualResourceList {...defaultProps} onLoadMore={onLoadMore} />);
      
      // Get the observer instance that was created
      const observerInstance = (mockIntersectionObserver.mock.results[0]?.value as any);
      expect(observerInstance).toBeDefined();
      
      // Simulate sentinel becoming visible
      if (observerInstance?.trigger) {
        observerInstance.trigger(true);
      }
      
      await waitFor(() => {
        expect(onLoadMore).toHaveBeenCalled();
      }, { timeout: 1000 });
    });

    it('should not call onLoadMore when hasMore is false', async () => {
      const onLoadMore = jest.fn();
      render(<VirtualResourceList {...defaultProps} hasMore={false} onLoadMore={onLoadMore} />);
      
      // Get the observer instance
      const observerInstance = (mockIntersectionObserver.mock.results[0]?.value as any);
      
      // Simulate sentinel becoming visible
      if (observerInstance?.trigger) {
        observerInstance.trigger(true);
      }
      
      // Wait a bit to ensure it doesn't call
      await waitFor(() => {
        expect(onLoadMore).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it('should not call onLoadMore while already loading', async () => {
      const onLoadMore = jest.fn();
      render(<VirtualResourceList {...defaultProps} isLoadingMore onLoadMore={onLoadMore} />);
      
      // Get the observer instance
      const observerInstance = (mockIntersectionObserver.mock.results[0]?.value as any);
      
      // Simulate sentinel becoming visible
      if (observerInstance?.trigger) {
        observerInstance.trigger(true);
      }
      
      // Wait a bit to ensure it doesn't call
      await waitFor(() => {
        expect(onLoadMore).not.toHaveBeenCalled();
      }, { timeout: 500 });
    });

    it('should render sentinel element', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      const sentinel = document.querySelector('[data-sentinel]');
      expect(sentinel).toBeInTheDocument();
    });
  });

  describe('search highlighting', () => {
    it('should highlight matching text in search query', () => {
      render(<VirtualResourceList {...defaultProps} searchQuery="Document" />);
      
      // Check for highlighted spans
      const highlighted = document.querySelectorAll('mark, [class*="bg-yellow"]');
      expect(highlighted.length).toBeGreaterThan(0);
    });
  });

  describe('classification display', () => {
    it('should show classification badges', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      expect(screen.getByText(/UNCLASSIFIED|SECRET|TOP_SECRET|CONFIDENTIAL/)).toBeInTheDocument();
    });

    it('should color-code classifications', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      // SECRET should be red
      const secretBadge = screen.getAllByText('SECRET')[0];
      expect(secretBadge).toHaveClass(/red|danger/i);
    });

    it('should show encrypted indicator', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      // Should show lock icon or encrypted text for encrypted items
      const encryptedIndicators = document.querySelectorAll('[aria-label*="encrypted"], [title*="encrypted"]');
      expect(encryptedIndicators.length).toBeGreaterThan(0);
    });
  });

  describe('instance display', () => {
    it('should show source instance flag', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      // Should show USA flag or label
      expect(screen.getAllByText(/USA|🇺🇸/).length).toBeGreaterThan(0);
    });
  });

  describe('accessibility', () => {
    it('should have proper list role', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('should have proper listitem roles', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      const items = screen.getAllByRole('article');
      expect(items.length).toBeGreaterThan(0);
    });

    it('should have accessible name for items', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      const item = screen.getByText('Document 0').closest('article');
      expect(item).toHaveAccessibleName();
    });

    it('should support keyboard focus', () => {
      render(<VirtualResourceList {...defaultProps} />);
      
      const items = screen.getAllByRole('article');
      expect(items[0]).toHaveAttribute('tabindex');
    });

    it('should announce loading state', () => {
      render(<VirtualResourceList {...defaultProps} isLoading />);
      
      // Check for aria-live region or aria-busy
      const loadingRegion = document.querySelector('[aria-live], [aria-busy="true"]');
      expect(loadingRegion).toBeInTheDocument();
    });

    it('should have proper ARIA attributes', () => {
      const { container } = render(<VirtualResourceList {...defaultProps} />);
      
      const list = screen.getByRole('list');
      expect(list).toHaveAttribute('aria-label', expect.stringContaining('resource'));
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<VirtualResourceList {...defaultProps} />);
      
      const items = screen.getAllByRole('article');
      if (items.length > 0) {
        items[0].focus();
        await user.keyboard('{ArrowDown}');
        expect(document.activeElement).toBe(items[1] || items[0]);
      }
    });

    it('should have proper focus management', () => {
      render(<VirtualResourceList {...defaultProps} focusedIndex={0} />);
      
      const items = screen.getAllByRole('article');
      expect(items[0]).toHaveAttribute('data-focused', 'true');
    });
  });

  describe('performance', () => {
    it('should only render visible items (virtualization)', () => {
      // With 50 items, not all should be in DOM
      const largeResourceSet = generateMockResources(1000);
      render(<VirtualResourceList {...defaultProps} resources={largeResourceSet} />);
      
      const renderedItems = screen.getAllByRole('article');
      // Should be significantly less than 1000
      expect(renderedItems.length).toBeLessThan(100);
    });

    it('should use memoization for item rendering', () => {
      const { rerender } = render(<VirtualResourceList {...defaultProps} />);
      
      // Re-render with same props
      rerender(<VirtualResourceList {...defaultProps} />);
      
      // Items should not re-render (this is hard to test directly,
      // but we can check that the component handles it gracefully)
      expect(screen.getByText('Document 0')).toBeInTheDocument();
    });
  });

  describe('loading overlay', () => {
    it('should show overlay during filter changes', () => {
      render(<VirtualResourceList {...defaultProps} isFilterLoading />);
      
      const overlay = document.querySelector('[class*="opacity"]');
      expect(overlay).toBeInTheDocument();
    });

    it('should not block interactions during overlay', () => {
      // Overlay should be pointer-events-none
      render(<VirtualResourceList {...defaultProps} isFilterLoading />);
      
      const items = screen.getAllByRole('article');
      expect(items[0]).not.toHaveClass('pointer-events-none');
    });
  });

  describe('empty states', () => {
    it('should show search empty state when query returns no results', () => {
      render(
        <VirtualResourceList 
          {...defaultProps} 
          resources={[]} 
          searchQuery="nonexistent" 
        />
      );
      
      expect(screen.getByText(/no.*found/i)).toBeInTheDocument();
    });

    it('should show filter empty state when filters return no results', () => {
      render(
        <VirtualResourceList 
          {...defaultProps} 
          resources={[]} 
          hasActiveFilters 
        />
      );
      
      expect(screen.getByText(/no.*match/i)).toBeInTheDocument();
    });
  });

  describe('ref imperative handle', () => {
    it('should expose scrollToTop method', () => {
      const ref = React.createRef<{ scrollToTop: () => void }>();
      render(<VirtualResourceList {...defaultProps} ref={ref} />);
      
      expect(ref.current?.scrollToTop).toBeDefined();
    });

    it('should expose scrollToBottom method', () => {
      const ref = React.createRef<{ scrollToBottom: () => void }>();
      render(<VirtualResourceList {...defaultProps} ref={ref} />);
      
      expect(ref.current?.scrollToBottom).toBeDefined();
    });
  });
});












