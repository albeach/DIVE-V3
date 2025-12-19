/**
 * DIVE V3 - HubConnectivityWidget Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubConnectivityWidget, IConnectivityStatus } from '../HubConnectivityWidget';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
}));

const mockHealthyConnectivity: IConnectivityStatus = {
  hubReachable: true,
  opalConnected: true,
  lastHeartbeat: new Date().toISOString(),
  lastOpalSync: new Date().toISOString(),
  hubUrl: 'https://hub.dive.example.com',
  opalServerUrl: 'https://hub.dive.example.com:7002',
  latencyMs: 45,
};

const mockPartialConnectivity: IConnectivityStatus = {
  hubReachable: true,
  opalConnected: false,
  lastHeartbeat: new Date().toISOString(),
};

const mockDisconnectedConnectivity: IConnectivityStatus = {
  hubReachable: false,
  opalConnected: false,
};

describe('HubConnectivityWidget', () => {
  describe('Rendering', () => {
    it('renders loading state correctly', () => {
      render(<HubConnectivityWidget connectivity={null} loading={true} />);
      const loadingElement = document.querySelector('.animate-pulse');
      expect(loadingElement).toBeInTheDocument();
    });

    it('renders healthy connectivity state', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText('Hub Connectivity')).toBeInTheDocument();
      expect(screen.getByText('All systems connected')).toBeInTheDocument();
    });

    it('renders disconnected state', () => {
      render(<HubConnectivityWidget connectivity={mockDisconnectedConnectivity} />);
      
      expect(screen.getByText('Connection issues detected')).toBeInTheDocument();
    });
  });

  describe('Hub Status Card', () => {
    it('shows Hub as connected when hubReachable is true', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText('Hub')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows Hub as disconnected when hubReachable is false', () => {
      render(<HubConnectivityWidget connectivity={mockDisconnectedConnectivity} />);
      
      expect(screen.getAllByText('Disconnected')).toHaveLength(2); // Both Hub and OPAL
    });

    it('displays last heartbeat time', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText(/Last heartbeat:/)).toBeInTheDocument();
    });

    it('displays latency when available', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText('45ms latency')).toBeInTheDocument();
    });
  });

  describe('OPAL Status Card', () => {
    it('shows OPAL as synced when connected', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText('OPAL')).toBeInTheDocument();
      expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('shows OPAL as disconnected when not connected', () => {
      render(<HubConnectivityWidget connectivity={mockPartialConnectivity} />);
      
      // Hub should be connected, OPAL disconnected
      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('displays last sync time', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText(/Last sync:/)).toBeInTheDocument();
    });
  });

  describe('Overall Status Bar', () => {
    it('shows operational message when all systems connected', () => {
      render(<HubConnectivityWidget connectivity={mockHealthyConnectivity} />);
      
      expect(screen.getByText('Federation link operational')).toBeInTheDocument();
    });

    it('shows degraded message when partially connected', () => {
      render(<HubConnectivityWidget connectivity={mockPartialConnectivity} />);
      
      expect(screen.getByText('Operating in degraded mode')).toBeInTheDocument();
    });

    it('shows fallback message when disconnected', () => {
      render(<HubConnectivityWidget connectivity={mockDisconnectedConnectivity} />);
      
      expect(screen.getByText('Using local policy cache')).toBeInTheDocument();
    });
  });

  describe('Refresh Button', () => {
    it('renders refresh button when onRefresh provided', () => {
      const onRefresh = jest.fn();
      render(
        <HubConnectivityWidget 
          connectivity={mockHealthyConnectivity} 
          onRefresh={onRefresh}
        />
      );
      
      const refreshButton = screen.getByRole('button');
      expect(refreshButton).toBeInTheDocument();
    });

    it('calls onRefresh when clicked', () => {
      const onRefresh = jest.fn();
      render(
        <HubConnectivityWidget 
          connectivity={mockHealthyConnectivity} 
          onRefresh={onRefresh}
        />
      );
      
      const refreshButton = screen.getByRole('button');
      fireEvent.click(refreshButton);
      expect(onRefresh).toHaveBeenCalled();
    });

    it('disables button when refreshing', () => {
      const onRefresh = jest.fn();
      render(
        <HubConnectivityWidget 
          connectivity={mockHealthyConnectivity} 
          onRefresh={onRefresh}
          refreshing={true}
        />
      );
      
      const refreshButton = screen.getByRole('button');
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Edge Cases', () => {
    it('handles null connectivity gracefully', () => {
      render(<HubConnectivityWidget connectivity={null} />);
      
      // Should show disconnected state for both
      expect(screen.getAllByText('Disconnected')).toHaveLength(2);
    });

    it('handles missing lastHeartbeat', () => {
      const noHeartbeat = { ...mockHealthyConnectivity, lastHeartbeat: undefined };
      render(<HubConnectivityWidget connectivity={noHeartbeat} />);
      
      expect(screen.getByText(/No heartbeat received/)).toBeInTheDocument();
    });

    it('handles missing lastOpalSync', () => {
      const noSync = { ...mockHealthyConnectivity, lastOpalSync: undefined };
      render(<HubConnectivityWidget connectivity={noSync} />);
      
      expect(screen.getByText(/No sync data/)).toBeInTheDocument();
    });
  });
});
