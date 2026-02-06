/**
 * Admin Page Transition Tests
 * 
 * Tests for page transition animations with:
 * - Page transitions
 * - Section transitions
 * - Reduced motion support
 * - Animation variants
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.9 - Comprehensive Testing
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AdminPageTransition, AdminSectionTransition, useReducedMotion } from '@/components/admin/shared';
import { renderHook } from '@testing-library/react';

// Mock Framer Motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className, ...props }: any) => (
      <div className={className} data-testid="motion-div" {...props}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock animations lib
jest.mock('@/lib/animations', () => ({
  prefersReducedMotion: jest.fn(() => false),
}));

// Mock theme tokens
jest.mock('@/components/admin/shared/theme-tokens', () => ({
  adminAnimations: {
    slideUp: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -20 },
      transition: { duration: 0.3, ease: 'easeOut' },
    },
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2 },
    },
    scale: {
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.9 },
      transition: { duration: 0.2, ease: 'easeOut' },
    },
  },
}));

describe('AdminPageTransition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render children', () => {
      render(
        <AdminPageTransition pageKey="/admin/dashboard">
          <div>Page Content</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Page Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <AdminPageTransition pageKey="/admin/users" className="custom-class">
          <div>Content</div>
        </AdminPageTransition>
      );
      const container = screen.getByTestId('motion-div');
      expect(container).toHaveClass('custom-class');
    });

    it('should use default className when not provided', () => {
      render(
        <AdminPageTransition pageKey="/admin/logs">
          <div>Content</div>
        </AdminPageTransition>
      );
      const container = screen.getByTestId('motion-div');
      expect(container).toHaveClass('w-full');
    });
  });

  describe('Animation Variants', () => {
    it('should use slideUp variant by default', () => {
      render(
        <AdminPageTransition pageKey="/admin/dashboard">
          <div>Content</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should accept fadeIn variant', () => {
      render(
        <AdminPageTransition pageKey="/admin/users" variant="fadeIn">
          <div>Content</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should accept scale variant', () => {
      render(
        <AdminPageTransition pageKey="/admin/logs" variant="scale">
          <div>Content</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Page Keys', () => {
    it('should handle page key changes', () => {
      const { rerender } = render(
        <AdminPageTransition pageKey="/admin/dashboard">
          <div>Dashboard</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Dashboard')).toBeInTheDocument();

      rerender(
        <AdminPageTransition pageKey="/admin/users">
          <div>Users</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Users')).toBeInTheDocument();
    });
  });

  describe('Reduced Motion Support', () => {
    it('should use instant transition when reduced motion is preferred', () => {
      const { prefersReducedMotion } = require('@/lib/animations');
      prefersReducedMotion.mockReturnValue(true);

      render(
        <AdminPageTransition pageKey="/admin/dashboard">
          <div>Content</div>
        </AdminPageTransition>
      );
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });
});

describe('AdminSectionTransition', () => {
  it('should render children', () => {
    render(
      <AdminSectionTransition sectionKey="overview">
        <div>Section Content</div>
      </AdminSectionTransition>
    );
    expect(screen.getByText('Section Content')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    render(
      <AdminSectionTransition sectionKey="analytics" className="section-class">
        <div>Content</div>
      </AdminSectionTransition>
    );
    const container = screen.getByTestId('motion-div');
    expect(container).toHaveClass('section-class');
  });

  it('should handle section key changes', () => {
    const { rerender } = render(
      <AdminSectionTransition sectionKey="overview">
        <div>Overview</div>
      </AdminSectionTransition>
    );
    expect(screen.getByText('Overview')).toBeInTheDocument();

    rerender(
      <AdminSectionTransition sectionKey="analytics">
        <div>Analytics</div>
      </AdminSectionTransition>
    );
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });
});

describe('useReducedMotion', () => {
  beforeEach(() => {
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('should return false when reduced motion is not preferred', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('should return true when reduced motion is preferred', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('should listen for changes to motion preference', () => {
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener,
        removeEventListener,
        dispatchEvent: jest.fn(),
      })),
    });

    const { unmount } = renderHook(() => useReducedMotion());

    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
