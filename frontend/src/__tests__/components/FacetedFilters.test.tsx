/**
 * FacetedFilters Component Tests
 * 
 * Tests for @/components/resources/faceted-filters.tsx
 * Phase 2: Search Enhancement
 * 
 * Coverage targets:
 * - Filter rendering with live counts
 * - Multi-select filtering
 * - Filter clearing
 * - Loading states
 * - Collapsible sections
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FacetedFilters, MobileFilterDrawer } from '@/components/resources/faceted-filters';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: React.PropsWithChildren<object>) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
}));

const mockFacets = {
  classifications: [
    { value: 'UNCLASSIFIED', count: 25, label: 'Unclassified' },
    { value: 'CONFIDENTIAL', count: 15, label: 'Confidential' },
    { value: 'SECRET', count: 10, label: 'Secret' },
    { value: 'TOP_SECRET', count: 5, label: 'Top Secret' },
  ],
  countries: [
    { value: 'USA', count: 30, label: 'USA' },
    { value: 'GBR', count: 20, label: 'United Kingdom' },
    { value: 'FRA', count: 15, label: 'France' },
    { value: 'DEU', count: 10, label: 'Germany' },
  ],
  cois: [
    { value: 'NATO', count: 25, label: 'NATO' },
    { value: 'FVEY', count: 15, label: 'Five Eyes' },
  ],
  instances: [
    { value: 'USA', count: 30, label: 'USA Instance' },
    { value: 'GBR', count: 25, label: 'GBR Instance' },
  ],
  encryptionStatus: [
    { value: 'encrypted', count: 20, label: 'Encrypted' },
    { value: 'unencrypted', count: 35, label: 'Unencrypted' },
  ],
};

const defaultProps = {
  facets: mockFacets,
  selectedFilters: {
    classifications: [],
    countries: [],
    cois: [],
    instances: [],
    encrypted: undefined,
    dateRange: undefined,
  },
  onFilterChange: jest.fn(),
  onClearFilters: jest.fn(),
  isLoading: false,
};

describe('FacetedFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render all filter sections', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      expect(screen.getByText(/classification/i)).toBeInTheDocument();
      expect(screen.getByText(/country|releasability/i)).toBeInTheDocument();
      expect(screen.getByText(/community.*interest|coi/i)).toBeInTheDocument();
    });

    it('should render filter options with counts', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      // Check for classification options
      expect(screen.getByText('UNCLASSIFIED')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      
      expect(screen.getByText('SECRET')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should show loading skeleton when loading', () => {
      render(<FacetedFilters {...defaultProps} isLoading />);
      
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should render empty state when no facets available', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          facets={{
            classifications: [],
            countries: [],
            cois: [],
            instances: [],
            encryptionStatus: [],
          }} 
        />
      );
      
      expect(screen.getByText(/no filters available/i)).toBeInTheDocument();
    });
  });

  describe('filter selection', () => {
    it('should call onFilterChange when filter is clicked', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} />);
      
      const secretCheckbox = screen.getByLabelText(/SECRET/i);
      await user.click(secretCheckbox);
      
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith({
        ...defaultProps.selectedFilters,
        classifications: ['SECRET'],
      });
    });

    it('should support multi-select within a category', async () => {
      const user = userEvent.setup();
      const onFilterChange = jest.fn();
      
      const { rerender } = render(
        <FacetedFilters 
          {...defaultProps} 
          onFilterChange={onFilterChange}
        />
      );
      
      await user.click(screen.getByLabelText(/SECRET/i));
      
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          classifications: ['SECRET'],
        })
      );
      
      // Simulate state update
      rerender(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ ...defaultProps.selectedFilters, classifications: ['SECRET'] }}
          onFilterChange={onFilterChange}
        />
      );
      
      await user.click(screen.getByLabelText(/TOP_SECRET/i));
      
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          classifications: ['SECRET', 'TOP_SECRET'],
        })
      );
    });

    it('should deselect filter when clicked again', async () => {
      const user = userEvent.setup();
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ ...defaultProps.selectedFilters, classifications: ['SECRET'] }}
        />
      );
      
      const secretCheckbox = screen.getByLabelText(/SECRET/i);
      await user.click(secretCheckbox);
      
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          classifications: [],
        })
      );
    });

    it('should show selected state visually', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ ...defaultProps.selectedFilters, classifications: ['SECRET'] }}
        />
      );
      
      const secretCheckbox = screen.getByLabelText(/SECRET/i) as HTMLInputElement;
      expect(secretCheckbox.checked).toBe(true);
    });
  });

  describe('clear filters', () => {
    it('should show clear button when filters are selected', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ ...defaultProps.selectedFilters, classifications: ['SECRET'] }}
        />
      );
      
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
    });

    it('should hide clear button when no filters selected', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      // Clear button should not be visible
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('should call onClearFilters when clear button clicked', async () => {
      const user = userEvent.setup();
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ ...defaultProps.selectedFilters, classifications: ['SECRET'] }}
        />
      );
      
      const clearButton = screen.getByRole('button', { name: /clear/i });
      await user.click(clearButton);
      
      expect(defaultProps.onClearFilters).toHaveBeenCalled();
    });

    it('should support clearing individual filter sections', async () => {
      const user = userEvent.setup();
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ 
            ...defaultProps.selectedFilters, 
            classifications: ['SECRET', 'TOP_SECRET'],
            countries: ['USA'],
          }}
        />
      );
      
      // Find clear button for classification section
      const classificationSection = screen.getByText(/classification/i).closest('div');
      const clearSectionButton = within(classificationSection!).getByRole('button', { name: /clear|x/i });
      
      await user.click(clearSectionButton);
      
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          classifications: [],
          countries: ['USA'], // Other filters preserved
        })
      );
    });
  });

  describe('collapsible sections', () => {
    it('should render sections as collapsible', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      // Should have disclosure buttons
      const buttons = screen.getAllByRole('button', { expanded: true });
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should collapse section when header clicked', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} />);
      
      const classificationHeader = screen.getByRole('button', { name: /classification/i });
      await user.click(classificationHeader);
      
      expect(classificationHeader).toHaveAttribute('aria-expanded', 'false');
    });

    it('should expand collapsed section when clicked', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} />);
      
      const header = screen.getByRole('button', { name: /classification/i });
      
      // Collapse
      await user.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'false');
      
      // Expand
      await user.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('should preserve collapsed state across re-renders', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<FacetedFilters {...defaultProps} />);
      
      const header = screen.getByRole('button', { name: /classification/i });
      await user.click(header);
      
      // Re-render with new facets
      rerender(
        <FacetedFilters 
          {...defaultProps} 
          facets={{ 
            ...mockFacets, 
            classifications: [...mockFacets.classifications, { value: 'NEW', count: 1, label: 'New' }] 
          }} 
        />
      );
      
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('filter counts', () => {
    it('should display count next to each filter', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      // UNCLASSIFIED should show (25)
      const filterItem = screen.getByText('UNCLASSIFIED').closest('label');
      expect(filterItem?.textContent).toContain('25');
    });

    it('should update counts when facets change', () => {
      const { rerender } = render(<FacetedFilters {...defaultProps} />);
      
      expect(screen.getByText('25')).toBeInTheDocument(); // UNCLASSIFIED count
      
      rerender(
        <FacetedFilters 
          {...defaultProps} 
          facets={{ 
            ...mockFacets, 
            classifications: [
              { value: 'UNCLASSIFIED', count: 100, label: 'Unclassified' },
              ...mockFacets.classifications.slice(1),
            ]
          }} 
        />
      );
      
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should show zero counts when filter would return no results', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          facets={{ 
            ...mockFacets, 
            classifications: [
              ...mockFacets.classifications,
              { value: 'EMPTY', count: 0, label: 'Empty' },
            ]
          }} 
        />
      );
      
      const emptyFilter = screen.getByLabelText(/EMPTY/i);
      expect(emptyFilter.closest('label')?.textContent).toContain('0');
    });

    it('should disable filters with zero count', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          facets={{ 
            ...mockFacets, 
            classifications: [
              { value: 'EMPTY', count: 0, label: 'Empty' },
            ]
          }} 
        />
      );
      
      const emptyCheckbox = screen.getByLabelText(/EMPTY/i);
      expect(emptyCheckbox).toBeDisabled();
    });
  });

  describe('encryption filter', () => {
    it('should render encryption toggle', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      expect(screen.getByText(/encrypt/i)).toBeInTheDocument();
    });

    it('should handle encryption filter change', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} />);
      
      const encryptedOption = screen.getByLabelText(/encrypted/i);
      await user.click(encryptedOption);
      
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypted: true,
        })
      );
    });
  });

  describe('date range filter', () => {
    it('should render date range picker', () => {
      render(<FacetedFilters {...defaultProps} showDateRange />);
      
      expect(screen.getByLabelText(/from|start/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to|end/i)).toBeInTheDocument();
    });

    it('should call onFilterChange with date range', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} showDateRange />);
      
      const fromInput = screen.getByLabelText(/from|start/i);
      await user.type(fromInput, '2024-01-01');
      
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          dateRange: expect.objectContaining({
            from: '2024-01-01',
          }),
        })
      );
    });
  });

  describe('instance filter', () => {
    it('should render instance/federation filter', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      expect(screen.getByText(/instance|source/i)).toBeInTheDocument();
    });

    it('should show flags for instances', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      // Check for USA flag emoji or flag icon
      const usaLabel = screen.getByText(/USA Instance/i).closest('label');
      expect(usaLabel?.textContent).toMatch(/🇺🇸|USA/);
    });
  });

  describe('accessibility', () => {
    it('should have proper heading structure', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      // Each section should be a heading or labeled region
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have accessible checkboxes', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toHaveAccessibleName();
      });
    });

    it('should use fieldset and legend for groups', () => {
      render(<FacetedFilters {...defaultProps} />);
      
      const fieldsets = document.querySelectorAll('fieldset');
      expect(fieldsets.length).toBeGreaterThan(0);
      
      fieldsets.forEach(fieldset => {
        expect(fieldset.querySelector('legend')).toBeInTheDocument();
      });
    });

    it('should announce filter changes', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} />);
      
      const checkbox = screen.getByLabelText(/SECRET/i);
      await user.click(checkbox);
      
      // Check for aria-live region
      const liveRegion = document.querySelector('[aria-live]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<FacetedFilters {...defaultProps} />);
      
      // Tab to first checkbox
      await user.tab();
      
      // Should focus on first interactive element
      expect(document.activeElement?.tagName).toMatch(/INPUT|BUTTON/i);
    });
  });

  describe('active filter badges', () => {
    it('should show active filter count badge', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ 
            ...defaultProps.selectedFilters, 
            classifications: ['SECRET', 'TOP_SECRET'],
          }}
        />
      );
      
      // Should show (2) or similar badge
      expect(screen.getByText(/2/)).toBeInTheDocument();
    });

    it('should show active filter pills/badges', () => {
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ 
            ...defaultProps.selectedFilters, 
            classifications: ['SECRET'],
          }}
        />
      );
      
      // Should show SECRET as an active filter pill
      const pill = screen.getByRole('button', { name: /SECRET.*remove|remove.*SECRET/i });
      expect(pill).toBeInTheDocument();
    });

    it('should remove filter when pill is clicked', async () => {
      const user = userEvent.setup();
      render(
        <FacetedFilters 
          {...defaultProps} 
          selectedFilters={{ 
            ...defaultProps.selectedFilters, 
            classifications: ['SECRET', 'TOP_SECRET'],
          }}
        />
      );
      
      const secretPill = screen.getByRole('button', { name: /SECRET.*remove|remove.*SECRET/i });
      await user.click(secretPill);
      
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({
          classifications: ['TOP_SECRET'],
        })
      );
    });
  });
});

describe('MobileFilterDrawer', () => {
  const mobileProps = {
    ...defaultProps,
    isOpen: true,
    onClose: jest.fn(),
  };

  it('should render when open', () => {
    render(<MobileFilterDrawer {...mobileProps} />);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<MobileFilterDrawer {...mobileProps} isOpen={false} />);
    
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should have close button', () => {
    render(<MobileFilterDrawer {...mobileProps} />);
    
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('should call onClose when close button clicked', async () => {
    const user = userEvent.setup();
    render(<MobileFilterDrawer {...mobileProps} />);
    
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);
    
    expect(mobileProps.onClose).toHaveBeenCalled();
  });

  it('should have apply button', () => {
    render(<MobileFilterDrawer {...mobileProps} />);
    
    expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
  });

  it('should close on escape key', async () => {
    const user = userEvent.setup();
    render(<MobileFilterDrawer {...mobileProps} />);
    
    await user.keyboard('{Escape}');
    
    expect(mobileProps.onClose).toHaveBeenCalled();
  });

  it('should show selected filter count', () => {
    render(
      <MobileFilterDrawer 
        {...mobileProps} 
        selectedFilters={{ 
          ...defaultProps.selectedFilters, 
          classifications: ['SECRET', 'TOP_SECRET'],
        }}
      />
    );
    
    expect(screen.getByText(/2.*selected|selected.*2/i)).toBeInTheDocument();
  });

  it('should have proper modal accessibility', () => {
    render(<MobileFilterDrawer {...mobileProps} />);
    
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label');
  });
});




