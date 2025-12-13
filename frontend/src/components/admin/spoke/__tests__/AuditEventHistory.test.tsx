/**
 * DIVE V3 - AuditEventHistory Unit Tests
 * 
 * Tests for the AuditEventHistory component that displays sync event timeline.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditEventHistory } from '../AuditEventHistory';
import { IAuditEvent } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<Record<string, unknown>>) => <>{children}</>,
}));

describe('AuditEventHistory', () => {
  const mockOnLoadMore = jest.fn();
  const mockOnExport = jest.fn();

  const createEvent = (type: IAuditEvent['type'], timestamp: Date): IAuditEvent => ({
    id: `evt-${Math.random()}`,
    timestamp: timestamp.toISOString(),
    type,
    eventCount: type === 'sync_success' ? Math.floor(Math.random() * 100) + 1 : undefined,
    duration: type.startsWith('sync_') ? Math.floor(Math.random() * 2000) + 100 : undefined,
    bytesTransferred: type === 'sync_success' ? Math.floor(Math.random() * 10000) : undefined,
    error: type === 'sync_failed' ? 'Hub connection timeout' : undefined,
  });

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const mockEvents: IAuditEvent[] = [
    createEvent('sync_success', new Date(today.setHours(14, 30))),
    createEvent('sync_success', new Date(today.setHours(12, 0))),
    createEvent('sync_failed', new Date(today.setHours(9, 15))),
    createEvent('sync_success', new Date(yesterday.setHours(23, 45))),
    createEvent('sync_success', new Date(yesterday.setHours(18, 30))),
  ];

  const mockSummary = {
    totalSyncs: 5,
    successfulSyncs: 4,
    failedSyncs: 1,
    totalEventsProcessed: 350,
    lastSuccessfulSync: mockEvents[0].timestamp,
    lastFailedSync: mockEvents[2].timestamp,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State', () => {
    it('renders loading skeleton when loading with no events', () => {
      render(
        <AuditEventHistory
          events={[]}
          loading={true}
        />
      );

      expect(screen.getByText('').closest('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty message when no events', () => {
      render(
        <AuditEventHistory
          events={[]}
          loading={false}
        />
      );

      expect(screen.getByText('No events to display')).toBeInTheDocument();
    });

    it('shows clear filter button when filtering with no results', () => {
      render(
        <AuditEventHistory
          events={[]}
          loading={false}
        />
      );

      expect(screen.getByText('No events to display')).toBeInTheDocument();
    });
  });

  describe('Event Display', () => {
    it('renders events grouped by date', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });

    it('shows event type labels', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      // Multiple sync_success events
      expect(screen.getAllByText('Sync Successful').length).toBeGreaterThan(0);
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
    });

    it('shows event count for successful syncs', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          type: 'sync_success',
          eventCount: 156,
          duration: 1200,
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('156 events')).toBeInTheDocument();
    });

    it('shows duration for sync events', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          type: 'sync_success',
          eventCount: 100,
          duration: 500,
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    it('formats duration in seconds when >= 1000ms', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          type: 'sync_success',
          eventCount: 100,
          duration: 2500,
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('2.5s')).toBeInTheDocument();
    });

    it('shows error message for failed syncs', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          type: 'sync_failed',
          error: 'Hub connection timeout',
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('Hub connection timeout')).toBeInTheDocument();
    });
  });

  describe('Summary Statistics', () => {
    it('displays summary stats when provided', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
          summary={mockSummary}
        />
      );

      expect(screen.getByText('Total Syncs')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Successful')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Events Processed')).toBeInTheDocument();
      expect(screen.getByText('350')).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('renders filter dropdown', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      expect(screen.getByRole('button', { name: /All/i })).toBeInTheDocument();
    });

    it('opens filter dropdown on click', async () => {
      const user = userEvent.setup();
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      await user.click(screen.getByRole('button', { name: /All/i }));

      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('filters events by success', async () => {
      const user = userEvent.setup();
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      await user.click(screen.getByRole('button', { name: /All/i }));
      await user.click(screen.getByText('Success'));

      // Should only show sync_success events
      expect(screen.queryByText('Sync Failed')).not.toBeInTheDocument();
      expect(screen.getAllByText('Sync Successful').length).toBeGreaterThan(0);
    });

    it('filters events by failed', async () => {
      const user = userEvent.setup();
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      await user.click(screen.getByRole('button', { name: /All/i }));
      await user.click(screen.getByText('Failed'));

      // Should only show failed events
      expect(screen.getByText('Sync Failed')).toBeInTheDocument();
      expect(screen.queryAllByText('Sync Successful').length).toBe(0);
    });
  });

  describe('Load More', () => {
    it('shows load more button when hasMore is true', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      expect(screen.getByRole('button', { name: /Load More/i })).toBeInTheDocument();
    });

    it('hides load more button when hasMore is false', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
          hasMore={false}
          onLoadMore={mockOnLoadMore}
        />
      );

      expect(screen.queryByRole('button', { name: /Load More/i })).not.toBeInTheDocument();
    });

    it('calls onLoadMore when button clicked', async () => {
      const user = userEvent.setup();
      mockOnLoadMore.mockResolvedValue(undefined);

      render(
        <AuditEventHistory
          events={mockEvents}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      await user.click(screen.getByRole('button', { name: /Load More/i }));

      expect(mockOnLoadMore).toHaveBeenCalled();
    });

    it('shows loading state while loading more', async () => {
      const user = userEvent.setup();
      let resolveLoadMore: () => void;
      mockOnLoadMore.mockReturnValue(new Promise((resolve) => {
        resolveLoadMore = resolve;
      }));

      render(
        <AuditEventHistory
          events={mockEvents}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      await user.click(screen.getByRole('button', { name: /Load More/i }));

      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Resolve the promise
      resolveLoadMore!();
      
      await waitFor(() => {
        expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Export', () => {
    it('shows export button when onExport provided', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
          onExport={mockOnExport}
        />
      );

      expect(screen.getByRole('button', { name: /Export/i })).toBeInTheDocument();
    });

    it('hides export button when onExport not provided', () => {
      render(
        <AuditEventHistory
          events={mockEvents}
        />
      );

      expect(screen.queryByRole('button', { name: /Export/i })).not.toBeInTheDocument();
    });
  });

  describe('Event Types', () => {
    const eventTypes: Array<{ type: IAuditEvent['type']; label: string }> = [
      { type: 'sync_success', label: 'Sync Successful' },
      { type: 'sync_failed', label: 'Sync Failed' },
      { type: 'sync_partial', label: 'Partial Sync' },
      { type: 'queue_cleared', label: 'Queue Cleared' },
      { type: 'queue_overflow', label: 'Queue Overflow' },
      { type: 'connection_lost', label: 'Connection Lost' },
      { type: 'connection_restored', label: 'Connection Restored' },
    ];

    eventTypes.forEach(({ type, label }) => {
      it(`renders ${type} event correctly`, () => {
        const events: IAuditEvent[] = [
          {
            id: 'evt-1',
            timestamp: new Date().toISOString(),
            type,
            eventCount: type.startsWith('sync_') ? 50 : undefined,
          },
        ];

        render(
          <AuditEventHistory
            events={events}
          />
        );

        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });
  });

  describe('Time Formatting', () => {
    it('formats time in 24-hour format', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date('2025-12-12T14:30:00').toISOString(),
          type: 'sync_success',
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('14:30')).toBeInTheDocument();
    });
  });

  describe('Bytes Formatting', () => {
    it('formats bytes in KB when appropriate', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          type: 'sync_success',
          eventCount: 100,
          bytesTransferred: 2048,
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('2 KB')).toBeInTheDocument();
    });

    it('formats bytes in MB when appropriate', () => {
      const events: IAuditEvent[] = [
        {
          id: 'evt-1',
          timestamp: new Date().toISOString(),
          type: 'sync_success',
          eventCount: 100,
          bytesTransferred: 1500000,
        },
      ];

      render(
        <AuditEventHistory
          events={events}
        />
      );

      expect(screen.getByText('1.4 MB')).toBeInTheDocument();
    });
  });
});




