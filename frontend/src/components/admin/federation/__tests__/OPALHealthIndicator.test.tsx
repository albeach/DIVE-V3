/**
 * DIVE V3 - OPALHealthIndicator Tests
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OPALHealthIndicator } from '../OPALHealthIndicator';
import { IOPALHealth } from '@/types/federation.types';

describe('OPALHealthIndicator', () => {
  const healthyOpal: IOPALHealth = {
    healthy: true,
    opalEnabled: true,
    serverUrl: 'http://opal-server:7002',
    topics: ['policy', 'federation'],
    config: {
      serverUrl: 'http://opal-server:7002',
      topics: ['policy', 'federation'],
    },
  };

  const unhealthyOpal: IOPALHealth = {
    healthy: false,
    opalEnabled: true,
    error: 'Connection refused',
  };

  const disabledOpal: IOPALHealth = {
    healthy: false,
    opalEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when loading', () => {
      const { container } = render(<OPALHealthIndicator health={null} loading />);

      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Healthy State', () => {
    it('shows healthy status when OPAL is connected', () => {
      render(<OPALHealthIndicator health={healthyOpal} />);

      expect(screen.getByText('Healthy & Connected')).toBeInTheDocument();
      expect(screen.getByText('Policies syncing normally')).toBeInTheDocument();
    });

    it('displays server URL', () => {
      render(<OPALHealthIndicator health={healthyOpal} />);

      expect(screen.getByText('Server URL')).toBeInTheDocument();
      expect(screen.getByText('http://opal-server:7002')).toBeInTheDocument();
    });

    it('displays topics', () => {
      render(<OPALHealthIndicator health={healthyOpal} />);

      expect(screen.getByText('Data Topics')).toBeInTheDocument();
      expect(screen.getByText('policy')).toBeInTheDocument();
      expect(screen.getByText('federation')).toBeInTheDocument();
    });
  });

  describe('Unhealthy State', () => {
    it('shows connection issue when OPAL is unhealthy', () => {
      render(<OPALHealthIndicator health={unhealthyOpal} />);

      expect(screen.getByText('Connection Issue')).toBeInTheDocument();
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('shows disabled status when OPAL is not enabled', () => {
      render(<OPALHealthIndicator health={disabledOpal} />);

      expect(screen.getByText('OPAL Disabled')).toBeInTheDocument();
      expect(screen.getByText('Policy distribution not configured')).toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('shows compact healthy indicator', () => {
      render(<OPALHealthIndicator health={healthyOpal} compact />);

      expect(screen.getByText('OPAL Connected')).toBeInTheDocument();
    });

    it('shows compact unhealthy indicator', () => {
      render(<OPALHealthIndicator health={unhealthyOpal} compact />);

      expect(screen.getByText('OPAL Unhealthy')).toBeInTheDocument();
    });

    it('shows compact disabled indicator', () => {
      render(<OPALHealthIndicator health={disabledOpal} compact />);

      expect(screen.getByText('OPAL Disabled')).toBeInTheDocument();
    });
  });

  describe('Refresh', () => {
    it('calls onRefresh when refresh button clicked', () => {
      const onRefresh = jest.fn();
      render(<OPALHealthIndicator health={healthyOpal} onRefresh={onRefresh} />);

      // Find refresh button (the icon button in header)
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[0]);

      expect(onRefresh).toHaveBeenCalled();
    });
  });
});

