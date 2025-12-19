/**
 * Error Boundary Component Tests
 * 
 * Tests for error boundary components including:
 * - SessionErrorBoundary
 * - Generic error boundaries
 * - Error recovery
 * - Error logging
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionErrorBoundary } from '@/components/auth/session-error-boundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Mock federatedLogout
jest.mock('@/lib/federated-logout', () => ({
  federatedLogout: jest.fn().mockResolvedValue(undefined),
}));

describe('SessionErrorBoundary', () => {
  // Suppress console.error for error boundary tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  
  afterAll(() => {
    console.error = originalError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('error catching', () => {
    it('should catch errors in children', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
    });

    it('should render children when no error', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={false} />
        </SessionErrorBoundary>
      );
      
      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('should catch session-related errors', () => {
      const SessionError = () => {
        throw new Error('Session expired');
      };
      
      render(
        <SessionErrorBoundary>
          <SessionError />
        </SessionErrorBoundary>
      );
      
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
    });

    it('should catch token-related errors', () => {
      const TokenError = () => {
        throw new Error('Invalid token');
      };
      
      render(
        <SessionErrorBoundary>
          <TokenError />
        </SessionErrorBoundary>
      );
      
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
    });
  });

  describe('error recovery', () => {
    it('should show reset button', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      const resetButton = screen.getByRole('button', { name: /try again|reload/i });
      expect(resetButton).toBeInTheDocument();
    });

    it('should show logout button', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      const logoutButton = screen.getByRole('button', { name: /logout|sign out/i });
      expect(logoutButton).toBeInTheDocument();
    });

    it('should reload page when reset clicked', () => {
      const reloadSpy = jest.spyOn(window.location, 'reload').mockImplementation(() => {});
      
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      const resetButton = screen.getByRole('button', { name: /try again|reload/i });
      fireEvent.click(resetButton);
      
      expect(reloadSpy).toHaveBeenCalled();
      
      reloadSpy.mockRestore();
    });
  });

  describe('error display', () => {
    it('should display error message', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      expect(screen.getByText(/error occurred/i)).toBeInTheDocument();
    });

    it('should display helpful error information', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      // Should show some helpful text
      const errorText = screen.getByText(/error|problem|issue/i);
      expect(errorText).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const { container } = render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('should have accessible error message', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      const errorMessage = screen.getByRole('alert');
      expect(errorMessage).toHaveAccessibleName();
    });

    it('should support keyboard navigation for buttons', () => {
      render(
        <SessionErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SessionErrorBoundary>
      );
      
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveAttribute('tabindex', expect.stringMatching(/0|-1/));
      });
    });
  });
});
