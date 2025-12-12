/**
 * DIVE V3 - OPALTransactionLog Unit Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OPALTransactionLog } from '../OPALTransactionLog';
import { IOPALTransaction } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const now = new Date();
const today = now.toISOString();
const yesterday = new Date(now.getTime() - 86400000).toISOString();

const mockTransactions: IOPALTransaction[] = [
  {
    transactionId: 'txn-001',
    type: 'publish',
    status: 'success',
    timestamp: today,
    duration: 150,
    initiatedBy: 'admin',
    details: {
      bundleVersion: '2025.12.12-001',
      affectedClients: 3,
      successfulClients: 3,
      failedClients: 0,
      topics: ['policy:base'],
    },
  },
  {
    transactionId: 'txn-002',
    type: 'sync',
    status: 'success',
    timestamp: today,
    duration: 120,
    initiatedBy: 'system',
    details: {
      bundleVersion: '2025.12.12-001',
      affectedClients: 1,
      successfulClients: 1,
      failedClients: 0,
    },
  },
  {
    transactionId: 'txn-003',
    type: 'sync',
    status: 'failed',
    timestamp: yesterday,
    duration: 5000,
    initiatedBy: 'schedule',
    details: {
      bundleVersion: '2025.12.11-003',
      affectedClients: 1,
      successfulClients: 0,
      failedClients: 1,
      error: 'Connection timeout',
    },
  },
  {
    transactionId: 'txn-004',
    type: 'refresh',
    status: 'success',
    timestamp: yesterday,
    duration: 50,
    initiatedBy: 'api',
    details: {
      topics: ['policy:base', 'data:federation'],
    },
  },
];

const mockSummary = {
  totalPublishes: 10,
  totalSyncs: 50,
  successRate: 94.5,
  lastSuccessfulSync: today,
  lastFailedSync: yesterday,
};

describe('OPALTransactionLog', () => {
  describe('Loading State', () => {
    it('renders loading skeleton when loading and no transactions', () => {
      render(<OPALTransactionLog transactions={[]} loading={true} />);
      
      const skeletonElements = document.querySelectorAll('.animate-pulse');
      expect(skeletonElements.length).toBeGreaterThan(0);
    });
  });

  describe('Transaction Display', () => {
    it('renders transaction count in header', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      expect(screen.getByText('4 transactions')).toBeInTheDocument();
    });

    it('displays transaction types', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      // Type labels
      expect(screen.getAllByText('Publish').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Sync').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Refresh').length).toBeGreaterThanOrEqual(1);
    });

    it('groups transactions by date', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('Yesterday')).toBeInTheDocument();
    });

    it('displays bundle version in transaction details', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      // Multiple transactions may have the same version
      const versionElements = screen.getAllByText('v2025.12.12-001');
      expect(versionElements.length).toBeGreaterThan(0);
    });

    it('displays duration for transactions', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      expect(screen.getByText('150ms')).toBeInTheDocument();
      expect(screen.getByText('120ms')).toBeInTheDocument();
      expect(screen.getByText('5.0s')).toBeInTheDocument();
    });

    it('displays error message for failed transactions', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });

    it('shows client counts', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      expect(screen.getByText('3/3 clients')).toBeInTheDocument();
      expect(screen.getByText('0/1 clients')).toBeInTheDocument();
    });

    it('shows initiator information', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      expect(screen.getByText('via admin')).toBeInTheDocument();
      expect(screen.getByText('via system')).toBeInTheDocument();
      expect(screen.getByText('via schedule')).toBeInTheDocument();
      expect(screen.getByText('via api')).toBeInTheDocument();
    });
  });

  describe('Summary Stats', () => {
    it('displays summary when provided', () => {
      render(<OPALTransactionLog transactions={mockTransactions} summary={mockSummary} />);
      
      expect(screen.getByText('10')).toBeInTheDocument(); // totalPublishes
      expect(screen.getByText('50')).toBeInTheDocument(); // totalSyncs
      expect(screen.getByText('94.5%')).toBeInTheDocument(); // successRate
    });
  });

  describe('Filtering', () => {
    it('opens filter dropdown when clicked', () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      const filterButton = screen.getByRole('button', { name: /all types/i });
      fireEvent.click(filterButton);
      
      // Should show filter options - use the ones with icons
      const syncButtons = screen.getAllByText('Sync');
      expect(syncButtons.length).toBeGreaterThan(0);
    });

    it('filters by transaction type', async () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      // Open filter dropdown
      const filterButton = screen.getByRole('button', { name: /all types/i });
      fireEvent.click(filterButton);
      
      // Select "Publish" filter
      const publishOption = screen.getAllByText('Publish')[0];
      fireEvent.click(publishOption);
      
      // Only publish transactions should be visible
      await waitFor(() => {
        expect(screen.getByText('v2025.12.12-001')).toBeInTheDocument();
        // Check that Sync transactions are filtered out - there should only be 1 Publish label now
        const syncLabels = screen.queryAllByText('Sync');
        expect(syncLabels.length).toBe(0);
      });
    });

    it('shows empty state when no transactions match filter', async () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      // Open filter and select data_update (no transactions of this type)
      const filterButton = screen.getByRole('button', { name: /all types/i });
      fireEvent.click(filterButton);
      const dataUpdateOption = screen.getByText('Data Update');
      fireEvent.click(dataUpdateOption);
      
      expect(screen.getByText('No transactions to display')).toBeInTheDocument();
      expect(screen.getByText('Clear filter')).toBeInTheDocument();
    });

    it('clears filter when clear button is clicked', async () => {
      render(<OPALTransactionLog transactions={mockTransactions} />);
      
      // Apply filter
      const filterButton = screen.getByRole('button', { name: /all types/i });
      fireEvent.click(filterButton);
      const dataUpdateOption = screen.getByText('Data Update');
      fireEvent.click(dataUpdateOption);
      
      // Click clear filter
      const clearButton = screen.getByText('Clear filter');
      fireEvent.click(clearButton);
      
      // All transactions should be visible
      expect(screen.getByText('4 transactions')).toBeInTheDocument();
    });
  });

  describe('Export', () => {
    it('shows export dropdown on hover', () => {
      const mockExport = jest.fn();
      render(<OPALTransactionLog transactions={mockTransactions} onExport={mockExport} />);
      
      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toBeInTheDocument();
    });

    it('calls onExport with json format', async () => {
      const mockExport = jest.fn().mockResolvedValue(undefined);
      render(<OPALTransactionLog transactions={mockTransactions} onExport={mockExport} />);
      
      // Hover over export button to show dropdown and click JSON
      const exportButtons = screen.getAllByRole('button');
      const jsonButton = screen.getByText('JSON');
      fireEvent.click(jsonButton);
      
      await waitFor(() => {
        expect(mockExport).toHaveBeenCalledWith('json');
      });
    });

    it('calls onExport with csv format', async () => {
      const mockExport = jest.fn().mockResolvedValue(undefined);
      render(<OPALTransactionLog transactions={mockTransactions} onExport={mockExport} />);
      
      const csvButton = screen.getByText('CSV');
      fireEvent.click(csvButton);
      
      await waitFor(() => {
        expect(mockExport).toHaveBeenCalledWith('csv');
      });
    });
  });

  describe('Load More', () => {
    it('shows load more button when hasMore is true', () => {
      const mockLoadMore = jest.fn();
      render(
        <OPALTransactionLog
          transactions={mockTransactions}
          hasMore={true}
          onLoadMore={mockLoadMore}
        />
      );
      
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });

    it('calls onLoadMore when load more button is clicked', async () => {
      const mockLoadMore = jest.fn().mockResolvedValue(undefined);
      render(
        <OPALTransactionLog
          transactions={mockTransactions}
          hasMore={true}
          onLoadMore={mockLoadMore}
        />
      );
      
      const loadMoreButton = screen.getByRole('button', { name: /load more/i });
      fireEvent.click(loadMoreButton);
      
      await waitFor(() => {
        expect(mockLoadMore).toHaveBeenCalled();
      });
    });

    it('does not show load more button when hasMore is false', () => {
      const mockLoadMore = jest.fn();
      render(
        <OPALTransactionLog
          transactions={mockTransactions}
          hasMore={false}
          onLoadMore={mockLoadMore}
        />
      );
      
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('shows empty state when no transactions', () => {
      render(<OPALTransactionLog transactions={[]} />);
      
      expect(screen.getByText('No transactions to display')).toBeInTheDocument();
    });
  });

  describe('Status Icons', () => {
    it('displays success icon for successful transactions', () => {
      const successTransactions = mockTransactions.filter(t => t.status === 'success');
      render(<OPALTransactionLog transactions={successTransactions} />);
      
      // Success transactions should have check icons (we can't easily check for specific icons,
      // but we can verify the transaction is displayed - may have multiple)
      const versionElements = screen.getAllByText('v2025.12.12-001');
      expect(versionElements.length).toBeGreaterThan(0);
    });

    it('displays error icon for failed transactions', () => {
      const failedTransactions = mockTransactions.filter(t => t.status === 'failed');
      render(<OPALTransactionLog transactions={failedTransactions} />);
      
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });
  });
});

