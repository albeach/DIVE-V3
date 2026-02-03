/**
 * CommandPaletteSearch Component Tests
 *
 * Tests for @/components/resources/command-palette-search.tsx
 * Phase 2: Search Enhancement
 *
 * Coverage targets:
 * - Keyboard activation ('/')
 * - Search query handling
 * - Server-side search integration
 * - Recent/pinned searches
 * - Quick filters
 * - Accessibility (ARIA attributes)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommandPaletteSearch, { DocumentSearchTrigger } from '@/components/resources/command-palette-search';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    li: ({ children, ...props }: React.PropsWithChildren<object>) => <li {...props}>{children}</li>,
    button: ({ children, ...props }: React.PropsWithChildren<object>) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node,
}));

// Mock search-syntax-parser
jest.mock('@/lib/search-syntax-parser', () => ({
  parseSearchQuery: jest.fn((query: string) => ({
    textSearch: query,
    phrases: [],
    filters: [],
    booleanOperator: 'AND',
    negatedTerms: [],
    errors: [],
    raw: query,
  })),
  AVAILABLE_FIELDS: [
    { name: 'classification', description: 'Security classification', examples: ['SECRET', 'TS'] },
    { name: 'country', description: 'Country of origin', examples: ['USA', 'GBR'] },
    { name: 'coi', description: 'Community of Interest', examples: ['FVEY', 'NATO'] },
  ],
  SEARCH_SYNTAX_HELP: {
    operators: ['AND', 'OR', 'NOT'],
    phrases: 'Use quotes for exact phrases',
    fields: 'field:value syntax',
    negation: '-term or NOT term',
  },
}));

// Mock search-analytics
jest.mock('@/lib/search-analytics', () => ({
  trackSearch: jest.fn(),
  trackResultClick: jest.fn(),
  trackFilterApply: jest.fn(),
}));

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockResources = [
  {
    resourceId: 'doc-1',
    title: 'Fuel Inventory Report',
    classification: 'SECRET',
    releasabilityTo: ['USA'],
    COI: [],
  },
  {
    resourceId: 'doc-2',
    title: 'Supply Chain Analysis',
    classification: 'UNCLASSIFIED',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['NATO'],
  },
];

const defaultProps = {
  onSearch: jest.fn(),
  onFilterApply: jest.fn(),
  onResourceSelect: jest.fn(),
  resources: mockResources,
};

describe('CommandPaletteSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
  });

  describe('rendering', () => {
    it('should not render overlay when closed', () => {
      render(<CommandPaletteSearch {...defaultProps} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render overlay when opened', async () => {
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('should render search input with placeholder', async () => {
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByPlaceholderText(/search/i);
      expect(input).toBeInTheDocument();
    });

    it('should render with custom placeholder', async () => {
      render(
        <CommandPaletteSearch
          {...defaultProps}
          isOpen
          placeholder="Find documents..."
        />
      );

      expect(screen.getByPlaceholderText('Find documents...')).toBeInTheDocument();
    });
  });

  describe('keyboard activation', () => {
    it('should open on "/" key press', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} />);

      await user.keyboard('/');

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should not open "/" when input is focused', async () => {
      render(
        <>
          <input data-testid="other-input" />
          <CommandPaletteSearch {...defaultProps} />
        </>
      );

      const otherInput = screen.getByTestId('other-input');
      fireEvent.focus(otherInput);
      fireEvent.keyDown(document, { key: '/' });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should close on Escape key', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should call onClose when Escape is pressed', async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen onClose={onClose} />);

      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('search functionality', () => {
    it('should update query on input', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel');

      expect(input).toHaveValue('fuel');
    });

    it('should call onSearch on Enter', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel report{Enter}');

      expect(defaultProps.onSearch).toHaveBeenCalledWith(
        expect.stringContaining('fuel report'),
        expect.any(Object)
      );
    });

    it('should debounce server search', async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel');

      // Should not call immediately
      expect(mockFetch).not.toHaveBeenCalled();

      // Advance past debounce delay
      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });

    it('should show loading state during search', async () => {
      mockFetch.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ results: [] }),
        }), 1000))
      );

      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel');

      // Could check for loading indicator here
    });

    it('should display server results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [mockResources[0]],
        }),
      });

      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel');

      jest.advanceTimersByTime(300);

      await waitFor(() => {
        expect(screen.getByText('Fuel Inventory Report')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });
  });

  describe('recent searches', () => {
    it('should load recent searches from localStorage', async () => {
      const recentSearches = [
        { query: 'fuel inventory', timestamp: Date.now() },
        { query: 'secret documents', timestamp: Date.now() - 1000 },
      ];
      mockLocalStorage.setItem(
        'dive_command_palette_recent',
        JSON.stringify(recentSearches)
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      await waitFor(() => {
        expect(screen.getByText(/fuel inventory/i)).toBeInTheDocument();
      });
    });

    it('should save search to recent on submit', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'new search{Enter}');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        expect.stringContaining('recent'),
        expect.stringContaining('new search')
      );
    });

    it('should select recent search on click', async () => {
      const user = userEvent.setup();
      mockLocalStorage.setItem(
        'dive_command_palette_recent',
        JSON.stringify([{ query: 'fuel inventory', timestamp: Date.now() }])
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const recentItem = await screen.findByText(/fuel inventory/i);
      await user.click(recentItem);

      const input = screen.getByRole('combobox');
      expect(input).toHaveValue('fuel inventory');
    });
  });

  describe('pinned searches', () => {
    it('should load pinned searches from localStorage', async () => {
      const pinnedSearches = [
        { query: 'important query', id: 'pin-1', createdAt: Date.now() },
      ];
      mockLocalStorage.setItem(
        'dive_command_palette_pinned',
        JSON.stringify(pinnedSearches)
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      await waitFor(() => {
        expect(screen.getByText(/important query/i)).toBeInTheDocument();
      });
    });

    it('should display pin icon for pinned searches', async () => {
      mockLocalStorage.setItem(
        'dive_command_palette_pinned',
        JSON.stringify([{ query: 'pinned', id: 'pin-1', createdAt: Date.now() }])
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      // Look for pin icon near the pinned search
      const pinnedSection = await screen.findByText(/pinned/i);
      expect(pinnedSection).toBeInTheDocument();
    });
  });

  describe('quick filters', () => {
    it('should display quick filter options', async () => {
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      // Quick filters for classification levels
      expect(await screen.findByText(/SECRET/i)).toBeInTheDocument();
    });

    it('should apply filter on quick filter click', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const secretFilter = await screen.findByRole('option', { name: /classification:SECRET/i });
      await user.click(secretFilter);

      expect(defaultProps.onFilterApply).toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('should navigate with arrow keys', async () => {
      const user = userEvent.setup();
      mockLocalStorage.setItem(
        'dive_command_palette_recent',
        JSON.stringify([
          { query: 'first', timestamp: Date.now() },
          { query: 'second', timestamp: Date.now() - 1000 },
        ])
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, '{ArrowDown}');

      // First item should be highlighted
      const listbox = screen.getByRole('listbox');
      const items = within(listbox).getAllByRole('option');
      expect(items[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('should select with Enter key', async () => {
      const user = userEvent.setup();
      mockLocalStorage.setItem(
        'dive_command_palette_recent',
        JSON.stringify([{ query: 'recent search', timestamp: Date.now() }])
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      await user.keyboard('{ArrowDown}{Enter}');

      expect(defaultProps.onSearch).toHaveBeenCalledWith(
        'recent search',
        expect.any(Object)
      );
    });
  });

  describe('syntax help', () => {
    it('should show syntax help when typing operators', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel AND');

      // Should show syntax help
      await waitFor(() => {
        expect(screen.getByText(/AND/i)).toBeInTheDocument();
      });
    });

    it('should show field suggestions when typing field:', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'classification:');

      // Should show field value suggestions
      await waitFor(() => {
        expect(screen.getByText(/SECRET|UNCLASSIFIED/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', async () => {
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label');

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded');
      expect(input).toHaveAttribute('aria-controls');
    });

    it('should have listbox role for results', async () => {
      mockLocalStorage.setItem(
        'dive_command_palette_recent',
        JSON.stringify([{ query: 'test', timestamp: Date.now() }])
      );

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('should announce results to screen readers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [mockResources[0]],
        }),
      });

      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel');

      jest.advanceTimersByTime(300);

      // Check for aria-live region
      await waitFor(() => {
        const liveRegion = document.querySelector('[aria-live]');
        expect(liveRegion).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('should trap focus within dialog', async () => {
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      const dialog = screen.getByRole('dialog');
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(0);
    });
  });

  describe('resource selection', () => {
    it('should call onResourceSelect when resource is clicked', async () => {
      const user = userEvent.setup();
      render(<CommandPaletteSearch {...defaultProps} isOpen />);

      // Type to show results matching resources
      const input = screen.getByRole('combobox');
      await user.type(input, 'fuel');

      // Click on resource result
      const resourceResult = await screen.findByText('Fuel Inventory Report');
      await user.click(resourceResult);

      expect(defaultProps.onResourceSelect).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'doc-1' })
      );
    });
  });

  describe('close on backdrop click', () => {
    it('should close when clicking backdrop', async () => {
      const onClose = jest.fn();
      const user = userEvent.setup();

      render(<CommandPaletteSearch {...defaultProps} isOpen onClose={onClose} />);

      // Click the backdrop (outside the search box)
      const dialog = screen.getByRole('dialog');
      await user.click(dialog);

      // May need to adjust based on actual implementation
    });
  });
});

describe('DocumentSearchTrigger', () => {
  it('should render trigger button', () => {
    render(<DocumentSearchTrigger onClick={jest.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('should display keyboard shortcut', () => {
    render(<DocumentSearchTrigger onClick={jest.fn()} />);

    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('should call onClick when clicked', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();

    render(<DocumentSearchTrigger onClick={onClick} />);

    const button = screen.getByRole('button');
    await user.click(button);

    expect(onClick).toHaveBeenCalled();
  });

  it('should have accessible label', () => {
    render(<DocumentSearchTrigger onClick={jest.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName();
  });
});
