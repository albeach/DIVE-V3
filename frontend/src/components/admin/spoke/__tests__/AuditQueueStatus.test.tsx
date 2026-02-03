/**
 * DIVE V3 - AuditQueueStatus Tests
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuditQueueStatus, IAuditQueueInfo } from '../AuditQueueStatus';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockEmptyQueue: IAuditQueueInfo = {
  queueSize: 0,
  pendingBytes: 0,
  state: 'idle',
};

const mockSmallQueue: IAuditQueueInfo = {
  queueSize: 15,
  oldestEntry: '2025-12-12T10:00:00Z',
  newestEntry: '2025-12-12T11:00:00Z',
  lastSyncAttempt: '2025-12-12T10:30:00Z',
  lastSyncSuccess: '2025-12-12T10:30:00Z',
  pendingBytes: 4096,
  state: 'idle',
};

const mockLargeQueue: IAuditQueueInfo = {
  queueSize: 150,
  oldestEntry: '2025-12-10T10:00:00Z',
  newestEntry: '2025-12-12T11:00:00Z',
  lastSyncAttempt: '2025-12-12T10:30:00Z',
  lastSyncSuccess: '2025-12-11T10:30:00Z',
  pendingBytes: 1048576, // 1 MB
  state: 'idle',
};

const mockBlockedQueue: IAuditQueueInfo = {
  queueSize: 50,
  pendingBytes: 8192,
  state: 'blocked',
};

describe('AuditQueueStatus', () => {
  describe('Rendering', () => {
    it('renders loading state correctly', () => {
      render(<AuditQueueStatus queue={null} loading={true} />);
      const loadingElement = document.querySelector('.animate-pulse');
      expect(loadingElement).toBeInTheDocument();
    });

    it('renders empty queue state', () => {
      render(<AuditQueueStatus queue={mockEmptyQueue} />);

      expect(screen.getByText('Audit Queue')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('Queue is empty')).toBeInTheDocument();
    });

    it('renders queue with items', () => {
      render(<AuditQueueStatus queue={mockSmallQueue} />);

      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('Events pending')).toBeInTheDocument();
    });

    it('displays pending bytes', () => {
      render(<AuditQueueStatus queue={mockLargeQueue} />);

      expect(screen.getByText('1 MB total')).toBeInTheDocument();
    });
  });

  describe('Queue Size Visual', () => {
    it('shows empty queue in green', () => {
      render(<AuditQueueStatus queue={mockEmptyQueue} />);

      const queueCount = screen.getByText('0');
      expect(queueCount).toHaveClass('text-emerald-600');
    });

    it('shows small queue in blue', () => {
      render(<AuditQueueStatus queue={mockSmallQueue} />);

      const queueCount = screen.getByText('15');
      expect(queueCount).toHaveClass('text-blue-600');
    });

    it('shows large queue (>100) in amber with warning', () => {
      render(<AuditQueueStatus queue={mockLargeQueue} />);

      const queueCount = screen.getByText('150');
      expect(queueCount).toHaveClass('text-amber-600');
      expect(screen.getByText('Large queue detected')).toBeInTheDocument();
    });

    it('shows blocked queue in red', () => {
      render(<AuditQueueStatus queue={mockBlockedQueue} />);

      const queueCount = screen.getByText('50');
      expect(queueCount).toHaveClass('text-red-600');
    });
  });

  describe('Status Grid', () => {
    it('displays last sync time', () => {
      render(<AuditQueueStatus queue={mockSmallQueue} />);

      expect(screen.getByText('Last Sync')).toBeInTheDocument();
    });

    it('displays queue state', () => {
      render(<AuditQueueStatus queue={mockSmallQueue} />);

      expect(screen.getByText('Queue State')).toBeInTheDocument();
      // State is displayed with capitalize class, check case-insensitively
      expect(screen.getByText(/idle/i)).toBeInTheDocument();
    });

    it('shows syncing state correctly', () => {
      const syncingQueue = { ...mockSmallQueue, state: 'syncing' as const };
      render(<AuditQueueStatus queue={syncingQueue} />);

      // Component capitalizes state, but we check case-insensitively
      expect(screen.getByText(/syncing/i)).toBeInTheDocument();
    });
  });

  describe('Oldest/Newest Entry', () => {
    it('shows oldest and newest entry times when queue has items', () => {
      render(<AuditQueueStatus queue={mockSmallQueue} />);

      expect(screen.getByText(/Oldest:/)).toBeInTheDocument();
      expect(screen.getByText(/Newest:/)).toBeInTheDocument();
    });

    it('does not show entry times for empty queue', () => {
      render(<AuditQueueStatus queue={mockEmptyQueue} />);

      expect(screen.queryByText(/Oldest:/)).not.toBeInTheDocument();
    });
  });

  describe('Sync Button', () => {
    it('renders sync button when onSync provided', () => {
      const onSync = jest.fn();
      render(<AuditQueueStatus queue={mockSmallQueue} onSync={onSync} />);

      expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
    });

    it('calls onSync when clicked', async () => {
      const onSync = jest.fn().mockResolvedValue(undefined);
      render(<AuditQueueStatus queue={mockSmallQueue} onSync={onSync} />);

      fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

      await waitFor(() => {
        expect(onSync).toHaveBeenCalled();
      });
    });

    it('shows syncing state during sync', async () => {
      const onSync = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<AuditQueueStatus queue={mockSmallQueue} onSync={onSync} />);

      fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

      await waitFor(() => {
        expect(screen.getByText('Syncing...')).toBeInTheDocument();
      });
    });
  });

  describe('Clear Queue', () => {
    it('shows clear button when onClear provided and queue has items', () => {
      const onClear = jest.fn();
      render(<AuditQueueStatus queue={mockSmallQueue} onClear={onClear} />);

      expect(screen.getByText(/Clear Queue/)).toBeInTheDocument();
    });

    it('does not show clear button for empty queue', () => {
      const onClear = jest.fn();
      render(<AuditQueueStatus queue={mockEmptyQueue} onClear={onClear} />);

      expect(screen.queryByText(/Clear Queue/)).not.toBeInTheDocument();
    });

    it('opens confirmation modal when clear clicked', () => {
      const onClear = jest.fn();
      render(<AuditQueueStatus queue={mockSmallQueue} onClear={onClear} />);

      fireEvent.click(screen.getByText(/Clear Queue/));

      expect(screen.getByText('Clear Audit Queue?')).toBeInTheDocument();
      expect(screen.getByText('15 events will be lost')).toBeInTheDocument();
    });

    it('shows warning in confirmation modal', () => {
      const onClear = jest.fn();
      render(<AuditQueueStatus queue={mockSmallQueue} onClear={onClear} />);

      fireEvent.click(screen.getByText(/Clear Queue/));

      expect(screen.getByText(/This action is irreversible/)).toBeInTheDocument();
    });

    it('calls onClear when confirmed', async () => {
      const onClear = jest.fn().mockResolvedValue(undefined);
      render(<AuditQueueStatus queue={mockSmallQueue} onClear={onClear} />);

      fireEvent.click(screen.getByText(/Clear Queue \(destructive\)/));

      // Click the confirm button in modal
      const confirmButtons = screen.getAllByRole('button', { name: /clear queue/i });
      const confirmButton = confirmButtons.find(b => b.textContent?.includes('Clear Queue') && !b.textContent?.includes('destructive'));
      if (confirmButton) {
        fireEvent.click(confirmButton);
      }

      await waitFor(() => {
        expect(onClear).toHaveBeenCalled();
      });
    });

    it('closes modal on cancel', () => {
      const onClear = jest.fn();
      render(<AuditQueueStatus queue={mockSmallQueue} onClear={onClear} />);

      fireEvent.click(screen.getByText(/Clear Queue \(destructive\)/));
      expect(screen.getByText('Clear Audit Queue?')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText('Clear Audit Queue?')).not.toBeInTheDocument();
    });
  });

  describe('Large Queue Warning', () => {
    it('shows warning for queues over 100 items', () => {
      render(<AuditQueueStatus queue={mockLargeQueue} />);

      expect(screen.getByText('Large queue detected')).toBeInTheDocument();
      expect(screen.getByText(/Consider syncing or checking hub connectivity/)).toBeInTheDocument();
    });

    it('does not show warning for small queues', () => {
      render(<AuditQueueStatus queue={mockSmallQueue} />);

      expect(screen.queryByText('Large queue detected')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles null queue gracefully', () => {
      render(<AuditQueueStatus queue={null} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles zero pending bytes', () => {
      render(<AuditQueueStatus queue={mockEmptyQueue} />);

      // Should not display bytes section for zero bytes
      expect(screen.queryByText(/total$/)).not.toBeInTheDocument();
    });
  });
});
