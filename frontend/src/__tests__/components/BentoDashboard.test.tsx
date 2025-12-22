/**
 * BentoDashboard Component Tests
 * 
 * Tests for @/components/resources/bento-dashboard.tsx
 * Phase 4: Visual Polish & Accessibility
 * 
 * Coverage targets:
 * - Stats display
 * - Animated counters
 * - Loading skeleton
 * - Responsive layout
 * - Accessibility
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BentoDashboard, BentoDashboardSkeleton } from '@/components/resources/bento-dashboard';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.PropsWithChildren<object>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<object>) => <>{children}</>,
  useSpring: () => ({ current: 0 }),
  useTransform: (value: number) => value,
}));

const defaultProps = {
  totalCount: 150,
  encryptedCount: 45,
  classificationBreakdown: {
    UNCLASSIFIED: 50,
    CONFIDENTIAL: 40,
    SECRET: 35,
    TOP_SECRET: 25,
  },
  activeInstances: ['USA', 'GBR', 'FRA'],
  searchTime: 123,
  userAccess: {
    clearance: 'SECRET',
    country: 'USA',
    coi: ['NATO', 'FVEY'],
  },
  bookmarkCount: 12,
  isLoading: false,
};

describe('BentoDashboard', () => {
  describe('rendering', () => {
    it('should render all stat cards', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Total documents
      expect(screen.getByText(/150/)).toBeInTheDocument();
      
      // Encrypted count
      expect(screen.getByText(/45/)).toBeInTheDocument();
      
      // Classification breakdown
      expect(screen.getByText(/UNCLASSIFIED/i)).toBeInTheDocument();
      expect(screen.getByText(/SECRET/i)).toBeInTheDocument();
    });

    it('should render hero card with total count', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      const heroCard = screen.getByText(/total.*documents|documents.*total/i).closest('div');
      expect(heroCard).toBeInTheDocument();
      expect(heroCard?.textContent).toContain('150');
    });

    it('should render search time', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      expect(screen.getByText(/123.*ms|ms.*123/i)).toBeInTheDocument();
    });

    it('should render user access info', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      expect(screen.getByText(/SECRET/)).toBeInTheDocument();
      expect(screen.getByText(/USA/)).toBeInTheDocument();
    });

    it('should render bookmark count', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      expect(screen.getByText(/12.*bookmark|bookmark.*12/i)).toBeInTheDocument();
    });
  });

  describe('classification breakdown', () => {
    it('should display all classification levels', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      expect(screen.getByText('50')).toBeInTheDocument(); // UNCLASSIFIED
      expect(screen.getByText('40')).toBeInTheDocument(); // CONFIDENTIAL
      expect(screen.getByText('35')).toBeInTheDocument(); // SECRET
      expect(screen.getByText('25')).toBeInTheDocument(); // TOP_SECRET
    });

    it('should color-code classifications correctly', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Check for color classes
      const secretBadge = screen.getByText(/SECRET/).closest('div');
      expect(secretBadge?.className).toMatch(/red|danger/i);
    });

    it('should show percentage bar for each classification', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Should have progress bars or percentage indicators
      const progressBars = document.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBeGreaterThan(0);
    });
  });

  describe('active instances', () => {
    it('should display active federation instances', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Check for instance flags or labels
      expect(screen.getByText(/USA|🇺🇸/)).toBeInTheDocument();
      expect(screen.getByText(/GBR|🇬🇧/)).toBeInTheDocument();
      expect(screen.getByText(/FRA|🇫🇷/)).toBeInTheDocument();
    });

    it('should show instance count', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      expect(screen.getByText(/3.*instance|instance.*3/i)).toBeInTheDocument();
    });

    it('should handle empty instances', () => {
      render(<BentoDashboard {...defaultProps} activeInstances={[]} />);
      
      expect(screen.getByText(/0.*instance|no.*instance/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show skeleton when loading', () => {
      render(<BentoDashboard {...defaultProps} isLoading />);
      
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should hide content when loading', () => {
      render(<BentoDashboard {...defaultProps} isLoading />);
      
      // Stats should not be visible
      expect(screen.queryByText('150')).not.toBeInTheDocument();
    });
  });

  describe('animated counters', () => {
    it('should animate count changes', async () => {
      const { rerender } = render(<BentoDashboard {...defaultProps} totalCount={100} />);
      
      rerender(<BentoDashboard {...defaultProps} totalCount={200} />);
      
      // Due to mocked framer-motion, we just check the final value
      await waitFor(() => {
        expect(screen.getByText(/200/)).toBeInTheDocument();
      });
    });
  });

  describe('responsive layout', () => {
    it('should render in grid layout', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      const gridContainer = document.querySelector('[class*="grid"]');
      expect(gridContainer).toBeInTheDocument();
    });

    it('should have responsive grid columns', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      const gridContainer = document.querySelector('[class*="grid"]');
      expect(gridContainer?.className).toMatch(/col|grid-cols/);
    });
  });

  describe('accessibility', () => {
    it('should have accessible labels for stats', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Each stat should have a label
      expect(screen.getByLabelText(/total.*document/i)).toBeInTheDocument();
    });

    it('should use semantic HTML for stats', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Should use dl/dt/dd for definition lists or similar
      const statElements = document.querySelectorAll('dt, dd, [role="group"]');
      expect(statElements.length).toBeGreaterThan(0);
    });

    it('should have proper heading hierarchy', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      const headings = screen.getAllByRole('heading');
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should announce count updates', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // Check for aria-live region
      const liveRegion = document.querySelector('[aria-live]');
      expect(liveRegion).toBeInTheDocument();
    });
  });

  describe('user COI display', () => {
    it('should show user COI memberships', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      expect(screen.getByText(/NATO/)).toBeInTheDocument();
      expect(screen.getByText(/FVEY/)).toBeInTheDocument();
    });

    it('should handle empty COI', () => {
      render(
        <BentoDashboard 
          {...defaultProps} 
          userAccess={{ ...defaultProps.userAccess, coi: [] }}
        />
      );
      
      expect(screen.getByText(/no.*coi|none/i)).toBeInTheDocument();
    });
  });

  describe('encrypted documents', () => {
    it('should show encryption percentage', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      // 45/150 = 30%
      expect(screen.getByText(/30|encrypted/i)).toBeInTheDocument();
    });

    it('should show lock icon for encrypted', () => {
      render(<BentoDashboard {...defaultProps} />);
      
      const lockIcon = document.querySelector('[aria-label*="encrypted"], svg');
      expect(lockIcon).toBeInTheDocument();
    });
  });
});

describe('BentoDashboardSkeleton', () => {
  it('should render skeleton placeholder', () => {
    render(<BentoDashboardSkeleton />);
    
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should maintain layout structure', () => {
    render(<BentoDashboardSkeleton />);
    
    const gridContainer = document.querySelector('[class*="grid"]');
    expect(gridContainer).toBeInTheDocument();
  });

  it('should be accessible to screen readers', () => {
    render(<BentoDashboardSkeleton />);
    
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

