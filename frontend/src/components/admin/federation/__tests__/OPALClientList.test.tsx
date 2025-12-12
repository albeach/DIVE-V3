/**
 * DIVE V3 - OPALClientList Unit Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OPALClientList } from '../OPALClientList';
import { IOPALClient } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockClients: IOPALClient[] = [
  {
    clientId: 'opal-nzl-001',
    spokeId: 'spoke-nzl',
    instanceCode: 'NZL',
    hostname: 'opal-client-nzl.dive.local',
    ipAddress: '10.100.0.1',
    status: 'synced',
    version: '2.4.1',
    connectedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    lastSync: new Date().toISOString(),
    currentPolicyVersion: '2025.12.12-001',
    subscribedTopics: ['policy:base', 'policy:nzl'],
    stats: {
      syncsReceived: 50,
      syncsFailed: 0,
      lastSyncDurationMs: 120,
      bytesReceived: 524288,
    },
  },
  {
    clientId: 'opal-aus-001',
    spokeId: 'spoke-aus',
    instanceCode: 'AUS',
    hostname: 'opal-client-aus.dive.local',
    ipAddress: '10.101.0.1',
    status: 'behind',
    version: '2.4.0',
    connectedAt: new Date().toISOString(),
    lastHeartbeat: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    currentPolicyVersion: '2025.12.11-003',
    subscribedTopics: ['policy:base', 'policy:aus'],
    stats: {
      syncsReceived: 45,
      syncsFailed: 2,
      lastSyncDurationMs: 250,
      bytesReceived: 512000,
    },
  },
  {
    clientId: 'opal-gbr-001',
    spokeId: 'spoke-gbr',
    instanceCode: 'GBR',
    hostname: 'opal-client-gbr.dive.local',
    ipAddress: '10.102.0.1',
    status: 'offline',
    version: '2.3.9',
    connectedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    lastHeartbeat: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    subscribedTopics: ['policy:base', 'policy:gbr'],
    stats: {
      syncsReceived: 30,
      syncsFailed: 5,
      lastSyncDurationMs: 0,
      bytesReceived: 256000,
    },
  },
];

describe('OPALClientList', () => {
  describe('Loading State', () => {
    it('renders loading skeleton when loading and no clients', () => {
      render(<OPALClientList clients={[]} loading={true} />);
      
      const skeletonElements = document.querySelectorAll('.animate-pulse');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });
  });

  describe('Client Display', () => {
    it('renders all clients', () => {
      render(<OPALClientList clients={mockClients} />);
      
      expect(screen.getByText('opal-nzl-001')).toBeInTheDocument();
      expect(screen.getByText('opal-aus-001')).toBeInTheDocument();
      expect(screen.getByText('opal-gbr-001')).toBeInTheDocument();
    });

    it('displays client count in header', () => {
      render(<OPALClientList clients={mockClients} />);
      
      expect(screen.getByText('3 clients registered')).toBeInTheDocument();
    });

    it('shows instance codes', () => {
      render(<OPALClientList clients={mockClients} />);
      
      expect(screen.getByText('NZL')).toBeInTheDocument();
      expect(screen.getByText('AUS')).toBeInTheDocument();
      expect(screen.getByText('GBR')).toBeInTheDocument();
    });

    it('displays version numbers', () => {
      render(<OPALClientList clients={mockClients} />);
      
      expect(screen.getByText('v2.4.1')).toBeInTheDocument();
      expect(screen.getByText('v2.4.0')).toBeInTheDocument();
      expect(screen.getByText('v2.3.9')).toBeInTheDocument();
    });

    it('shows status badges', () => {
      render(<OPALClientList clients={mockClients} />);
      
      expect(screen.getByText('Synced')).toBeInTheDocument();
      expect(screen.getByText('Behind')).toBeInTheDocument();
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });

  describe('Summary Bar', () => {
    it('displays summary counts', () => {
      render(<OPALClientList clients={mockClients} />);
      
      expect(screen.getByText('3 clients:')).toBeInTheDocument();
      expect(screen.getByText('1 synced')).toBeInTheDocument();
      expect(screen.getByText('1 behind')).toBeInTheDocument();
      expect(screen.getByText('1 offline')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('filters by search term', async () => {
      render(<OPALClientList clients={mockClients} />);
      
      const searchInput = screen.getByPlaceholderText('Search clients...');
      fireEvent.change(searchInput, { target: { value: 'nzl' } });
      
      expect(screen.getByText('opal-nzl-001')).toBeInTheDocument();
      expect(screen.queryByText('opal-aus-001')).not.toBeInTheDocument();
      expect(screen.queryByText('opal-gbr-001')).not.toBeInTheDocument();
    });

    it('opens filter dropdown when clicked', () => {
      render(<OPALClientList clients={mockClients} />);
      
      const filterButton = screen.getByRole('button', { name: /all/i });
      fireEvent.click(filterButton);
      
      // Should show filter options - use partial text matching with function
      expect(screen.getByRole('button', { name: /all \(3\)/i })).toBeInTheDocument();
    });

    it('filters by status', async () => {
      render(<OPALClientList clients={mockClients} />);
      
      // Open filter dropdown
      const filterButton = screen.getByRole('button', { name: /all/i });
      fireEvent.click(filterButton);
      
      // Find and click the Synced filter option (it contains the text "Synced")
      const filterOptions = screen.getAllByRole('button');
      const syncedOption = filterOptions.find(btn => btn.textContent?.includes('Synced'));
      if (syncedOption) {
        fireEvent.click(syncedOption);
      }
      
      // Only synced client should be visible
      expect(screen.getByText('opal-nzl-001')).toBeInTheDocument();
      expect(screen.queryByText('opal-aus-001')).not.toBeInTheDocument();
      expect(screen.queryByText('opal-gbr-001')).not.toBeInTheDocument();
    });

    it('shows empty state when no clients match filter', async () => {
      render(<OPALClientList clients={mockClients} />);
      
      // Open filter and select "Connected" (no clients have this status)
      const filterButton = screen.getByRole('button', { name: /all/i });
      fireEvent.click(filterButton);
      
      // Find and click the Connected filter option
      const filterOptions = screen.getAllByRole('button');
      const connectedOption = filterOptions.find(btn => btn.textContent?.includes('Connected') && btn.textContent?.includes('(0)'));
      if (connectedOption) {
        fireEvent.click(connectedOption);
      }
      
      expect(screen.getByText('No clients found')).toBeInTheDocument();
      expect(screen.getByText('Clear filters')).toBeInTheDocument();
    });

    it('clears filters when clear button is clicked', async () => {
      render(<OPALClientList clients={mockClients} />);
      
      // Apply filter
      const filterButton = screen.getByRole('button', { name: /all/i });
      fireEvent.click(filterButton);
      
      // Find and click the Connected filter option
      const filterOptions = screen.getAllByRole('button');
      const connectedOption = filterOptions.find(btn => btn.textContent?.includes('Connected') && btn.textContent?.includes('(0)'));
      if (connectedOption) {
        fireEvent.click(connectedOption);
      }
      
      // Click clear filters
      const clearButton = screen.getByText('Clear filters');
      fireEvent.click(clearButton);
      
      // All clients should be visible again
      expect(screen.getByText('opal-nzl-001')).toBeInTheDocument();
      expect(screen.getByText('opal-aus-001')).toBeInTheDocument();
      expect(screen.getByText('opal-gbr-001')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('renders ping buttons when onPingClient is provided', () => {
      const mockPing = jest.fn();
      render(<OPALClientList clients={mockClients} onPingClient={mockPing} />);
      
      const pingButtons = screen.getAllByRole('button', { name: /ping/i });
      expect(pingButtons.length).toBe(3);
    });

    it('calls onPingClient when ping button is clicked', async () => {
      const mockPing = jest.fn().mockResolvedValue(undefined);
      render(<OPALClientList clients={mockClients} onPingClient={mockPing} />);
      
      const pingButtons = screen.getAllByRole('button', { name: /ping/i });
      fireEvent.click(pingButtons[0]);
      
      await waitFor(() => {
        expect(mockPing).toHaveBeenCalledWith('opal-nzl-001');
      });
    });

    it('renders sync buttons when onForceSyncClient is provided', () => {
      const mockSync = jest.fn();
      render(<OPALClientList clients={mockClients} onForceSyncClient={mockSync} />);
      
      const syncButtons = screen.getAllByRole('button', { name: /sync/i });
      expect(syncButtons.length).toBe(3);
    });

    it('calls onForceSyncClient when sync button is clicked', async () => {
      const mockSync = jest.fn().mockResolvedValue(undefined);
      render(<OPALClientList clients={mockClients} onForceSyncClient={mockSync} />);
      
      const syncButtons = screen.getAllByRole('button', { name: /sync/i });
      fireEvent.click(syncButtons[0]);
      
      await waitFor(() => {
        expect(mockSync).toHaveBeenCalledWith('opal-nzl-001');
      });
    });

    it('disables ping button for offline clients', () => {
      const mockPing = jest.fn();
      render(<OPALClientList clients={mockClients} onPingClient={mockPing} />);
      
      // GBR client is offline
      const pingButtons = screen.getAllByRole('button', { name: /ping/i });
      expect(pingButtons[2]).toBeDisabled();
    });

    it('disables sync button for offline clients', () => {
      const mockSync = jest.fn();
      render(<OPALClientList clients={mockClients} onForceSyncClient={mockSync} />);
      
      // GBR client is offline
      const syncButtons = screen.getAllByRole('button', { name: /sync/i });
      expect(syncButtons[2]).toBeDisabled();
    });
  });

  describe('Refresh', () => {
    it('calls onRefresh when refresh button is clicked', () => {
      const mockRefresh = jest.fn();
      render(<OPALClientList clients={mockClients} onRefresh={mockRefresh} />);
      
      // Find the refresh button in the header (it only has an icon)
      const refreshButtons = screen.getAllByRole('button');
      const refreshButton = refreshButtons.find(btn => !btn.textContent);
      fireEvent.click(refreshButton!);
      
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no clients', () => {
      render(<OPALClientList clients={[]} />);
      
      expect(screen.getByText('No clients found')).toBeInTheDocument();
    });
  });

  describe('Country Flags', () => {
    it('displays country flags for known instance codes', () => {
      render(<OPALClientList clients={mockClients} />);
      
      // Flags are displayed as emoji text
      expect(screen.getByText('🇳🇿')).toBeInTheDocument();
      expect(screen.getByText('🇦🇺')).toBeInTheDocument();
      expect(screen.getByText('🇬🇧')).toBeInTheDocument();
    });
  });
});

