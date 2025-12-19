/**
 * DIVE V3 - SyncStatusDashboard Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SyncStatusDashboard } from '../SyncStatusDashboard';
import { ISyncStatusResponse, ISpokeSyncStatus } from '@/types/federation.types';

describe('SyncStatusDashboard', () => {
  const mockSpokes: ISpokeSyncStatus[] = [
    {
      spokeId: 'spoke-nzl-001',
      instanceCode: 'NZL',
      status: 'current',
      currentVersion: 'v1.2.3',
      hubVersion: 'v1.2.3',
      lastSyncTime: new Date().toISOString(),
      versionsBehind: 0,
    },
    {
      spokeId: 'spoke-aus-001',
      instanceCode: 'AUS',
      status: 'behind',
      currentVersion: 'v1.2.2',
      hubVersion: 'v1.2.3',
      lastSyncTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      versionsBehind: 1,
    },
    {
      spokeId: 'spoke-usa-001',
      instanceCode: 'USA',
      status: 'stale',
      currentVersion: 'v1.2.0',
      hubVersion: 'v1.2.3',
      lastSyncTime: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      versionsBehind: 3,
    },
    {
      spokeId: 'spoke-fra-001',
      instanceCode: 'FRA',
      status: 'offline',
      hubVersion: 'v1.2.3',
      versionsBehind: 0,
    },
  ];

  const mockSyncStatus: ISyncStatusResponse = {
    currentVersion: {
      version: 'v1.2.3',
      hash: 'abc123',
      timestamp: new Date().toISOString(),
      layers: ['base', 'fvey'],
    },
    spokes: mockSpokes,
    summary: {
      total: 4,
      current: 1,
      behind: 1,
      stale: 1,
      offline: 1,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when loading', () => {
      const { container } = render(<SyncStatusDashboard syncStatus={null} loading />);
      
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no spokes', () => {
      render(<SyncStatusDashboard syncStatus={{ ...mockSyncStatus, spokes: [] }} />);
      
      expect(screen.getByText('No Spokes Registered')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('displays hub version', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      expect(screen.getByText('Policy Sync Status')).toBeInTheDocument();
      // Version appears multiple times - check that at least one exists
      expect(screen.getAllByText(/v1\.2\.3/).length).toBeGreaterThan(0);
    });

    it('renders Sync All button when handler provided', () => {
      render(
        <SyncStatusDashboard
          syncStatus={mockSyncStatus}
          onForceSyncAll={jest.fn()}
        />
      );
      
      expect(screen.getByText('Sync All')).toBeInTheDocument();
    });
  });

  describe('Summary Stats', () => {
    it('displays summary statistics', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      expect(screen.getByText('Total')).toBeInTheDocument();
      // "Current" appears in both summary and legend - check at least one exists
      expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Behind').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Stale').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    });

    it('displays correct counts', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      // Check if all counts are displayed (4, 1, 1, 1, 1)
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getAllByText('1')).toHaveLength(4);
    });
  });

  describe('Status Legend', () => {
    it('displays status legend', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      // Check legend items
      const legendItems = ['Current', 'Behind', 'Stale', 'Critical', 'Offline'];
      legendItems.forEach((item) => {
        expect(screen.getAllByText(item).length).toBeGreaterThan(0);
      });
    });
  });

  describe('Spoke List', () => {
    it('displays all spokes', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      expect(screen.getByText('NZL')).toBeInTheDocument();
      expect(screen.getByText('AUS')).toBeInTheDocument();
      expect(screen.getByText('USA')).toBeInTheDocument();
      expect(screen.getByText('FRA')).toBeInTheDocument();
    });

    it('displays country flags', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      expect(screen.getByText('🇳🇿')).toBeInTheDocument();
      expect(screen.getByText('🇦🇺')).toBeInTheDocument();
      expect(screen.getByText('🇺🇸')).toBeInTheDocument();
      expect(screen.getByText('🇫🇷')).toBeInTheDocument();
    });

    it('shows versions behind count for out-of-sync spokes', () => {
      render(<SyncStatusDashboard syncStatus={mockSyncStatus} />);
      
      expect(screen.getByText('(1 behind)')).toBeInTheDocument();
      expect(screen.getByText('(3 behind)')).toBeInTheDocument();
    });
  });

  describe('Force Sync', () => {
    it('calls onForceSync when sync button clicked', async () => {
      const onForceSync = jest.fn().mockResolvedValue(undefined);
      render(
        <SyncStatusDashboard
          syncStatus={mockSyncStatus}
          onForceSync={onForceSync}
        />
      );
      
      // Click sync button for first spoke (NZL)
      const syncButtons = screen.getAllByText('Sync');
      fireEvent.click(syncButtons[0]);
      
      await waitFor(() => {
        expect(onForceSync).toHaveBeenCalledWith('spoke-nzl-001');
      });
    });

    it('does not show sync button for offline spokes', () => {
      render(
        <SyncStatusDashboard
          syncStatus={mockSyncStatus}
          onForceSync={jest.fn()}
        />
      );
      
      // There should be 3 sync buttons (not 4, because FRA is offline)
      const syncButtons = screen.getAllByText('Sync');
      expect(syncButtons).toHaveLength(3);
    });

    it('calls onForceSyncAll when Sync All clicked', async () => {
      const onForceSyncAll = jest.fn().mockResolvedValue(undefined);
      render(
        <SyncStatusDashboard
          syncStatus={mockSyncStatus}
          onForceSyncAll={onForceSyncAll}
        />
      );
      
      fireEvent.click(screen.getByText('Sync All'));
      
      await waitFor(() => {
        expect(onForceSyncAll).toHaveBeenCalled();
      });
    });
  });

  describe('Refresh', () => {
    it('calls onRefresh when refresh button clicked', () => {
      const onRefresh = jest.fn();
      render(
        <SyncStatusDashboard
          syncStatus={mockSyncStatus}
          onRefresh={onRefresh}
        />
      );
      
      // Find refresh button (second button after Sync All)
      const buttons = screen.getAllByRole('button');
      const refreshButton = buttons.find(b => !b.textContent?.includes('Sync'));
      fireEvent.click(refreshButton!);
      
      expect(onRefresh).toHaveBeenCalled();
    });
  });
});
