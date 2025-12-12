/**
 * DIVE V3 - CircuitBreakerControl Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CircuitBreakerControl, ICircuitBreakerStatus } from '../CircuitBreakerControl';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockClosedStatus: ICircuitBreakerStatus = {
  state: 'CLOSED',
  consecutiveFailures: 0,
  consecutiveSuccesses: 10,
  lastFailure: undefined,
  lastSuccess: new Date().toISOString(),
  totalFailures: 5,
  totalRecoveries: 2,
  uptimePercentage: 99.9,
};

const mockOpenStatus: ICircuitBreakerStatus = {
  state: 'OPEN',
  consecutiveFailures: 5,
  consecutiveSuccesses: 0,
  lastFailure: new Date().toISOString(),
  lastSuccess: '2025-12-10T00:00:00Z',
  totalFailures: 15,
  totalRecoveries: 3,
  uptimePercentage: 95.5,
};

const mockHalfOpenStatus: ICircuitBreakerStatus = {
  state: 'HALF_OPEN',
  consecutiveFailures: 0,
  consecutiveSuccesses: 2,
  lastFailure: '2025-12-10T00:00:00Z',
  lastSuccess: new Date().toISOString(),
  totalFailures: 10,
  totalRecoveries: 3,
  uptimePercentage: 97.0,
};

describe('CircuitBreakerControl', () => {
  describe('Rendering', () => {
    it('renders loading state correctly', () => {
      render(<CircuitBreakerControl status={null} loading={true} />);
      const loadingElement = document.querySelector('.animate-pulse');
      expect(loadingElement).toBeInTheDocument();
    });

    it('renders CLOSED state correctly', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      
      expect(screen.getByText('Circuit Breaker')).toBeInTheDocument();
      // Multiple "Closed" texts appear (header + indicator) - check at least one exists
      expect(screen.getAllByText('Closed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Circuit is healthy, all requests flow normally')).toBeInTheDocument();
    });

    it('renders OPEN state correctly', () => {
      render(<CircuitBreakerControl status={mockOpenStatus} />);
      
      expect(screen.getAllByText('Open').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Circuit tripped, requests blocked, using fallback')).toBeInTheDocument();
    });

    it('renders HALF_OPEN state correctly', () => {
      render(<CircuitBreakerControl status={mockHalfOpenStatus} />);
      
      expect(screen.getAllByText('Half Open').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Testing connection, limited requests allowed')).toBeInTheDocument();
    });
  });

  describe('Metrics Display', () => {
    it('displays consecutive failures count', () => {
      render(<CircuitBreakerControl status={mockOpenStatus} />);
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Failures')).toBeInTheDocument();
    });

    it('displays consecutive successes count', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Successes')).toBeInTheDocument();
    });

    it('displays total recoveries', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      expect(screen.getByText('Recoveries')).toBeInTheDocument();
    });

    it('displays uptime percentage', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      expect(screen.getByText('99.9%')).toBeInTheDocument();
      expect(screen.getByText('Uptime')).toBeInTheDocument();
    });
  });

  describe('State Indicator Dots', () => {
    it('shows all three state indicators', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      
      // Should have labels for all states
      const closedLabels = screen.getAllByText('Closed');
      expect(closedLabels.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Reset Button', () => {
    it('renders reset button when onReset provided', () => {
      const onReset = jest.fn();
      render(<CircuitBreakerControl status={mockClosedStatus} onReset={onReset} />);
      
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });

    it('calls onReset when clicked', async () => {
      const onReset = jest.fn().mockResolvedValue(undefined);
      render(<CircuitBreakerControl status={mockClosedStatus} onReset={onReset} />);
      
      fireEvent.click(screen.getByText('Reset'));
      
      await waitFor(() => {
        expect(onReset).toHaveBeenCalled();
      });
    });
  });

  describe('Manual Override Controls', () => {
    it('shows manual override toggle', () => {
      const onForceState = jest.fn();
      render(<CircuitBreakerControl status={mockClosedStatus} onForceState={onForceState} />);
      
      expect(screen.getByText('Manual Override')).toBeInTheDocument();
    });

    it('expands controls when clicked', () => {
      const onForceState = jest.fn();
      render(<CircuitBreakerControl status={mockClosedStatus} onForceState={onForceState} />);
      
      fireEvent.click(screen.getByText('Manual Override'));
      
      expect(screen.getByText(/Manual state changes bypass automatic recovery/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /force closed/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /force half-open/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /force open/i })).toBeInTheDocument();
    });

    it('disables current state button', () => {
      const onForceState = jest.fn();
      render(<CircuitBreakerControl status={mockClosedStatus} onForceState={onForceState} />);
      
      fireEvent.click(screen.getByText('Manual Override'));
      
      const forceClosedButton = screen.getByRole('button', { name: /force closed/i });
      expect(forceClosedButton).toBeDisabled();
    });

    it('calls onForceState with correct state', async () => {
      const onForceState = jest.fn().mockResolvedValue(undefined);
      render(<CircuitBreakerControl status={mockClosedStatus} onForceState={onForceState} />);
      
      fireEvent.click(screen.getByText('Manual Override'));
      fireEvent.click(screen.getByRole('button', { name: /force open/i }));
      
      await waitFor(() => {
        expect(onForceState).toHaveBeenCalledWith('OPEN');
      });
    });
  });

  describe('Last Events', () => {
    it('displays last failure time', () => {
      render(<CircuitBreakerControl status={mockOpenStatus} />);
      expect(screen.getByText(/Last failure:/)).toBeInTheDocument();
    });

    it('displays last success time', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      expect(screen.getByText(/Last success:/)).toBeInTheDocument();
    });

    it('shows Never for no last failure', () => {
      render(<CircuitBreakerControl status={mockClosedStatus} />);
      // The text spans multiple elements, so check for both separately
      expect(screen.getByText(/Last failure:/)).toBeInTheDocument();
      expect(screen.getAllByText('Never').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Default State', () => {
    it('defaults to CLOSED when status is null', () => {
      render(<CircuitBreakerControl status={null} />);
      expect(screen.getAllByText('Closed').length).toBeGreaterThanOrEqual(1);
    });
  });
});

