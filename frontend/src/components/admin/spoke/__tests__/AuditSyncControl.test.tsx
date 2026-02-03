/**
 * DIVE V3 - AuditSyncControl Unit Tests
 *
 * Tests for the AuditSyncControl component that handles audit queue sync operations.
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditSyncControl } from '../AuditSyncControl';
import { IAuditSyncResult } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<Record<string, unknown>>) => <>{children}</>,
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = jest.fn();

describe('AuditSyncControl', () => {
  const mockOnSyncNow = jest.fn();
  const mockOnExport = jest.fn();
  const mockOnScheduleChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when loading', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={0}
          onSyncNow={mockOnSyncNow}
          loading={true}
        />
      );

      expect(screen.getByText('').closest('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Idle State', () => {
    it('renders sync controls in idle state', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByText('Sync Controls')).toBeInTheDocument();
      expect(screen.getByText('50 events pending')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sync Now/i })).toBeInTheDocument();
    });

    it('shows last sync success time', () => {
      const lastSync = new Date().toISOString();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={10}
          lastSyncSuccess={lastSync}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByText('Last Success')).toBeInTheDocument();
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('shows last sync attempt time', () => {
      const lastAttempt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={10}
          lastSyncAttempt={lastAttempt}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByText('Last Attempt')).toBeInTheDocument();
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });
  });

  describe('Sync Operations', () => {
    it('calls onSyncNow when sync button clicked', async () => {
      const user = userEvent.setup();
      mockOnSyncNow.mockResolvedValue({ success: true, eventsProcessed: 10, duration: 500 });

      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
        />
      );

      await user.click(screen.getByRole('button', { name: /Sync Now/i }));

      expect(mockOnSyncNow).toHaveBeenCalled();
    });

    it('disables sync button when queue is empty', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={0}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByRole('button', { name: /Sync Now/i })).toBeDisabled();
    });

    it('disables sync button when syncing', () => {
      render(
        <AuditSyncControl
          queueState="syncing"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByRole('button', { name: /Syncing/i })).toBeDisabled();
    });

    it('shows success result after sync', async () => {
      const user = userEvent.setup();
      mockOnSyncNow.mockResolvedValue({
        success: true,
        eventsProcessed: 25,
        duration: 1200,
      } as IAuditSyncResult);

      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
        />
      );

      await user.click(screen.getByRole('button', { name: /Sync Now/i }));

      await waitFor(() => {
        expect(screen.getByText(/Synced 25 events in 1200ms/)).toBeInTheDocument();
      });
    });

    it('shows error result after failed sync', async () => {
      const user = userEvent.setup();
      mockOnSyncNow.mockResolvedValue({
        success: false,
        error: 'Hub unreachable',
      } as IAuditSyncResult);

      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
        />
      );

      await user.click(screen.getByRole('button', { name: /Sync Now/i }));

      await waitFor(() => {
        expect(screen.getByText('Hub unreachable')).toBeInTheDocument();
      });
    });
  });

  describe('Blocked/Error States', () => {
    it('shows warning for blocked state', () => {
      render(
        <AuditSyncControl
          queueState="blocked"
          queueSize={100}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByText('Sync Blocked')).toBeInTheDocument();
      expect(screen.getByText(/Hub connectivity lost/)).toBeInTheDocument();
    });

    it('shows warning for error state', () => {
      render(
        <AuditSyncControl
          queueState="error"
          queueSize={100}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByText('Sync Error')).toBeInTheDocument();
      expect(screen.getByText(/Check hub connectivity/)).toBeInTheDocument();
    });
  });

  describe('Auto-sync Indicator', () => {
    it('shows auto-sync indicator when enabled', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          autoSyncEnabled={true}
          autoSyncInterval={300}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.getByText(/Auto:/)).toBeInTheDocument();
      expect(screen.getByText(/5 minutes/)).toBeInTheDocument();
    });

    it('hides auto-sync indicator when disabled', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          autoSyncEnabled={false}
          onSyncNow={mockOnSyncNow}
        />
      );

      expect(screen.queryByText(/Auto:/)).not.toBeInTheDocument();
    });
  });

  describe('Schedule Modal', () => {
    it('shows schedule button when onScheduleChange provided', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onScheduleChange={mockOnScheduleChange}
        />
      );

      expect(screen.getByRole('button', { name: /Schedule/i })).toBeInTheDocument();
    });

    it('opens schedule modal when schedule button clicked', async () => {
      const user = userEvent.setup();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onScheduleChange={mockOnScheduleChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /Schedule/i }));

      expect(screen.getByText('Sync Schedule')).toBeInTheDocument();
      expect(screen.getByText('Sync Interval')).toBeInTheDocument();
    });

    it('allows selecting sync interval', async () => {
      const user = userEvent.setup();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onScheduleChange={mockOnScheduleChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /Schedule/i }));

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '600');

      expect(select).toHaveValue('600');
    });

    it('calls onScheduleChange when saving', async () => {
      const user = userEvent.setup();
      mockOnScheduleChange.mockResolvedValue(undefined);

      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          autoSyncEnabled={false}
          autoSyncInterval={300}
          onSyncNow={mockOnSyncNow}
          onScheduleChange={mockOnScheduleChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /Schedule/i }));
      await user.click(screen.getByRole('button', { name: /Save/i }));

      expect(mockOnScheduleChange).toHaveBeenCalledWith(true, 300);
    });

    it('closes modal on cancel', async () => {
      const user = userEvent.setup();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onScheduleChange={mockOnScheduleChange}
        />
      );

      await user.click(screen.getByRole('button', { name: /Schedule/i }));
      expect(screen.getByText('Sync Schedule')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Cancel/i }));
      expect(screen.queryByText('Sync Schedule')).not.toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    it('shows export button when onExport provided and queue has items', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onExport={mockOnExport}
        />
      );

      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    });

    it('hides export button when queue is empty', () => {
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={0}
          onSyncNow={mockOnSyncNow}
          onExport={mockOnExport}
        />
      );

      expect(screen.queryByRole('button', { name: /Export/i })).not.toBeInTheDocument();
    });

    it('opens export modal when export button clicked', async () => {
      const user = userEvent.setup();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onExport={mockOnExport}
        />
      );

      await user.click(screen.getByRole('button', { name: /Export/i }));

      expect(screen.getByText('Export Queue')).toBeInTheDocument();
      expect(screen.getByText('Export 50 queued events for backup or analysis.')).toBeInTheDocument();
    });

    it('allows selecting export format', async () => {
      const user = userEvent.setup();
      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onExport={mockOnExport}
        />
      );

      await user.click(screen.getByRole('button', { name: /Export/i }));

      const csvButton = screen.getByRole('button', { name: /CSV/i });
      await user.click(csvButton);

      expect(csvButton.className).toContain('bg-emerald');
    });

    it('calls onExport with selected format', async () => {
      const user = userEvent.setup();
      mockOnExport.mockResolvedValue(new Blob(['test'], { type: 'application/json' }));

      // Mock document methods
      const mockAppendChild = jest.spyOn(document.body, 'appendChild').mockImplementation(() => document.createElement('a'));
      const mockRemoveChild = jest.spyOn(document.body, 'removeChild').mockImplementation(() => document.createElement('a'));

      render(
        <AuditSyncControl
          queueState="idle"
          queueSize={50}
          onSyncNow={mockOnSyncNow}
          onExport={mockOnExport}
        />
      );

      await user.click(screen.getByRole('button', { name: /Export/i }));

      // Find the Export button in the modal (there are two buttons with Export text)
      const exportButtons = screen.getAllByRole('button', { name: /Export/i });
      const modalExportButton = exportButtons.find(btn => btn.closest('.fixed'));
      if (modalExportButton) {
        await user.click(modalExportButton);
      }

      await waitFor(() => {
        expect(mockOnExport).toHaveBeenCalledWith({ format: 'json' });
      });

      mockAppendChild.mockRestore();
      mockRemoveChild.mockRestore();
    });
  });
});

