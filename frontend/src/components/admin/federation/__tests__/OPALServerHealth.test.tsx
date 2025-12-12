/**
 * DIVE V3 - OPALServerHealth Unit Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OPALServerHealth } from '../OPALServerHealth';
import { IOPALServerStatus } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockHealthyStatus: IOPALServerStatus = {
  healthy: true,
  version: '0.9.2',
  uptime: 86400, // 1 day
  startedAt: new Date(Date.now() - 86400000).toISOString(),
  policyDataEndpoint: {
    status: 'healthy',
    lastRequest: new Date().toISOString(),
    requestsPerMinute: 45,
    totalRequests: 1234,
    errorRate: 0.5,
  },
  webSocket: {
    connected: true,
    clientCount: 3,
    lastMessage: new Date().toISOString(),
    messagesPerMinute: 12,
  },
  topics: ['policy:base', 'data:federation'],
  config: {
    serverUrl: 'https://opal-server:7002',
    dataTopics: ['policy_data'],
    policyTopics: ['policy:base'],
  },
  stats: {
    totalPublishes: 50,
    totalSyncs: 200,
    failedSyncs: 5,
    averageSyncDurationMs: 150,
  },
};

const mockUnhealthyStatus: IOPALServerStatus = {
  ...mockHealthyStatus,
  healthy: false,
  policyDataEndpoint: {
    ...mockHealthyStatus.policyDataEndpoint,
    status: 'down',
  },
  webSocket: {
    connected: false,
    clientCount: 0,
    messagesPerMinute: 0,
  },
};

describe('OPALServerHealth', () => {
  describe('Loading State', () => {
    it('renders loading skeleton when loading and no status', () => {
      render(<OPALServerHealth status={null} loading={true} />);
      
      const skeletonElements = document.querySelectorAll('.animate-pulse');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });

    it('shows content with loading indicator when refreshing', () => {
      render(<OPALServerHealth status={mockHealthyStatus} loading={true} />);
      
      expect(screen.getByText('OPAL Server')).toBeInTheDocument();
    });
  });

  describe('Healthy State', () => {
    it('renders server status as Running when healthy', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('OPAL Server')).toBeInTheDocument();
      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('displays uptime correctly', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      // 86400 seconds = 1 day
      expect(screen.getByText('1d 0h')).toBeInTheDocument();
    });

    it('displays version', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('0.9.2')).toBeInTheDocument();
    });

    it('displays client count', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      // Client count appears multiple times (in header and websocket section)
      const clientCounts = screen.getAllByText('3');
      expect(clientCounts.length).toBeGreaterThan(0);
    });

    it('shows policy data endpoint as healthy', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('Policy Data Endpoint')).toBeInTheDocument();
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    it('shows WebSocket as connected', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('WebSocket Gateway')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('displays subscribed topics', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('policy:base')).toBeInTheDocument();
      expect(screen.getByText('data:federation')).toBeInTheDocument();
    });

    it('displays server URL', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('https://opal-server:7002')).toBeInTheDocument();
    });

    it('displays stats', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      expect(screen.getByText('50')).toBeInTheDocument(); // totalPublishes
      expect(screen.getByText('200')).toBeInTheDocument(); // totalSyncs
      expect(screen.getByText('5')).toBeInTheDocument(); // failedSyncs
      expect(screen.getByText('150ms')).toBeInTheDocument(); // avgDuration
    });
  });

  describe('Unhealthy State', () => {
    it('renders server status as Offline when unhealthy', () => {
      render(<OPALServerHealth status={mockUnhealthyStatus} />);
      
      expect(screen.getByText('OPAL Server')).toBeInTheDocument();
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('shows policy data endpoint as down', () => {
      render(<OPALServerHealth status={mockUnhealthyStatus} />);
      
      expect(screen.getByText('Down')).toBeInTheDocument();
    });

    it('shows WebSocket as disconnected', () => {
      render(<OPALServerHealth status={mockUnhealthyStatus} />);
      
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });
  });

  describe('Degraded State', () => {
    const degradedStatus: IOPALServerStatus = {
      ...mockHealthyStatus,
      policyDataEndpoint: {
        ...mockHealthyStatus.policyDataEndpoint,
        status: 'degraded',
      },
    };

    it('shows policy data endpoint as degraded', () => {
      render(<OPALServerHealth status={degradedStatus} />);
      
      expect(screen.getByText('Degraded')).toBeInTheDocument();
    });
  });

  describe('Refresh Action', () => {
    it('calls onRefresh when refresh button is clicked', () => {
      const mockOnRefresh = jest.fn();
      render(<OPALServerHealth status={mockHealthyStatus} onRefresh={mockOnRefresh} />);
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);
      
      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button when loading', () => {
      const mockOnRefresh = jest.fn();
      render(<OPALServerHealth status={mockHealthyStatus} loading={true} onRefresh={mockOnRefresh} />);
      
      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      expect(refreshButton).toBeDisabled();
    });

    it('does not render refresh button when onRefresh is not provided', () => {
      render(<OPALServerHealth status={mockHealthyStatus} />);
      
      const refreshButton = screen.queryByRole('button', { name: /refresh/i });
      expect(refreshButton).not.toBeInTheDocument();
    });
  });

  describe('Uptime Formatting', () => {
    it('formats uptime as days and hours for long uptimes', () => {
      const longUptime: IOPALServerStatus = {
        ...mockHealthyStatus,
        uptime: 172800, // 2 days
      };
      render(<OPALServerHealth status={longUptime} />);
      
      expect(screen.getByText('2d 0h')).toBeInTheDocument();
    });

    it('formats uptime as hours and minutes for medium uptimes', () => {
      const mediumUptime: IOPALServerStatus = {
        ...mockHealthyStatus,
        uptime: 7200, // 2 hours
      };
      render(<OPALServerHealth status={mediumUptime} />);
      
      expect(screen.getByText('2h 0m')).toBeInTheDocument();
    });

    it('formats uptime as minutes for short uptimes', () => {
      const shortUptime: IOPALServerStatus = {
        ...mockHealthyStatus,
        uptime: 300, // 5 minutes
      };
      render(<OPALServerHealth status={shortUptime} />);
      
      expect(screen.getByText('5m')).toBeInTheDocument();
    });
  });

  describe('Null Status', () => {
    it('handles null status gracefully', () => {
      render(<OPALServerHealth status={null} />);
      
      // Should show default values (multiple '--' elements exist)
      const defaultValues = screen.getAllByText('--');
      expect(defaultValues.length).toBeGreaterThan(0);
    });
  });
});

