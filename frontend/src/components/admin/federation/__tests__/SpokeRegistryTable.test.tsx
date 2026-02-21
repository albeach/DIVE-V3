/**
 * DIVE V3 - SpokeRegistryTable Tests
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SpokeRegistryTable } from '../SpokeRegistryTable';
import { ISpoke } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    tr: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <tr {...props}>{children}</tr>,
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    button: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button onClick={onClick} {...props}>{children}</button>
    ),
  },
}));

// Sample spoke data
const mockActiveSpoke: ISpoke = {
  spokeId: 'spoke-nzl-12345',
  instanceCode: 'NZL',
  name: 'New Zealand Defence Force',
  status: 'active',
  baseUrl: 'https://nzl.dive.example.com',
  apiUrl: 'https://nzl.dive.example.com/api',
  idpUrl: 'https://nzl.dive.example.com/auth',
  trustLevel: 'partner',
  allowedPolicyScopes: ['policy:base', 'policy:fvey'],
  maxClassificationAllowed: 'SECRET',
  dataIsolationLevel: 'filtered',
  registeredAt: '2025-12-01T00:00:00Z',
  approvedAt: '2025-12-02T00:00:00Z',
  contactEmail: 'admin@nzdf.mil.nz',
  lastHeartbeat: new Date().toISOString(),
  lastPolicySync: new Date().toISOString(),
  currentPolicyVersion: 'abc123456789',
  opaHealthy: true,
  opalClientConnected: true,
};

const mockPendingSpoke: ISpoke = {
  spokeId: 'spoke-aus-67890',
  instanceCode: 'AUS',
  name: 'Australian Defence Force',
  status: 'pending',
  baseUrl: 'https://aus.dive.example.com',
  apiUrl: 'https://aus.dive.example.com/api',
  idpUrl: 'https://aus.dive.example.com/auth',
  trustLevel: 'development',
  allowedPolicyScopes: [],
  maxClassificationAllowed: 'UNCLASSIFIED',
  dataIsolationLevel: 'minimal',
  registeredAt: '2025-12-10T00:00:00Z',
  contactEmail: 'admin@defence.gov.au',
};

const mockSuspendedSpoke: ISpoke = {
  ...mockActiveSpoke,
  spokeId: 'spoke-gbr-11111',
  instanceCode: 'GBR',
  name: 'United Kingdom MOD',
  status: 'suspended',
};

describe('SpokeRegistryTable', () => {
  describe('Rendering', () => {
    it('renders loading state correctly', () => {
      render(<SpokeRegistryTable spokes={[]} loading={true} />);
      expect(screen.getByText('Loading spokes...')).toBeInTheDocument();
    });

    it('renders empty state when no spokes', () => {
      render(<SpokeRegistryTable spokes={[]} loading={false} />);
      expect(screen.getByText('No Spokes Registered')).toBeInTheDocument();
      expect(screen.getByText(/Federation spokes will appear here/)).toBeInTheDocument();
    });

    it('renders table with spokes', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke, mockPendingSpoke]} />);

      expect(screen.getByText('NZL')).toBeInTheDocument();
      expect(screen.getByText('New Zealand Defence Force')).toBeInTheDocument();
      expect(screen.getByText('AUS')).toBeInTheDocument();
      expect(screen.getByText('Australian Defence Force')).toBeInTheDocument();
    });

    it('displays correct status badges', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke, mockPendingSpoke, mockSuspendedSpoke]} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();
      expect(screen.getByText('Suspended')).toBeInTheDocument();
    });

    it('displays trust level for active spokes', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} />);
      expect(screen.getByText('Partner')).toBeInTheDocument();
    });

    it('shows health indicators for active spokes', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} />);
      expect(screen.getByText('OPA')).toBeInTheDocument();
      expect(screen.getByText('OPAL')).toBeInTheDocument();
    });

    it('shows policy version for active spokes', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} />);
      expect(screen.getByText('abc123456789'.slice(0, 12))).toBeInTheDocument();
    });

    it('displays country flags', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} />);
      // The NZL flag emoji should be rendered
      expect(screen.getByText('🇳🇿')).toBeInTheDocument();
    });
  });

  describe('Actions', () => {
    it('shows Approve button for pending spokes', () => {
      const onApprove = jest.fn();
      render(<SpokeRegistryTable spokes={[mockPendingSpoke]} onApprove={onApprove} />);

      const approveButton = screen.getByRole('button', { name: /approve/i });
      expect(approveButton).toBeInTheDocument();
    });

    it('calls onApprove when Approve button clicked', () => {
      const onApprove = jest.fn();
      render(<SpokeRegistryTable spokes={[mockPendingSpoke]} onApprove={onApprove} />);

      fireEvent.click(screen.getByRole('button', { name: /approve/i }));
      expect(onApprove).toHaveBeenCalledWith(mockPendingSpoke);
    });

    it('shows action buttons for active spokes', () => {
      const onViewDetails = jest.fn();
      const onRotateToken = jest.fn();
      const onSuspend = jest.fn();

      render(
        <SpokeRegistryTable
          spokes={[mockActiveSpoke]}
          onViewDetails={onViewDetails}
          onRotateToken={onRotateToken}
          onSuspend={onSuspend}
        />
      );

      expect(screen.getByTitle('View Details')).toBeInTheDocument();
      expect(screen.getByTitle('Rotate Token')).toBeInTheDocument();
      expect(screen.getByTitle('Suspend')).toBeInTheDocument();
    });

    it('calls onViewDetails when View button clicked', () => {
      const onViewDetails = jest.fn();
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} onViewDetails={onViewDetails} />);

      fireEvent.click(screen.getByTitle('View Details'));
      expect(onViewDetails).toHaveBeenCalledWith(mockActiveSpoke);
    });

    it('calls onSuspend when Suspend button clicked', () => {
      const onSuspend = jest.fn();
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} onSuspend={onSuspend} />);

      fireEvent.click(screen.getByTitle('Suspend'));
      expect(onSuspend).toHaveBeenCalledWith(mockActiveSpoke);
    });

    it('shows Reactivate button for suspended spokes', () => {
      const onApprove = jest.fn();
      render(<SpokeRegistryTable spokes={[mockSuspendedSpoke]} onApprove={onApprove} />);

      expect(screen.getByRole('button', { name: /reactivate/i })).toBeInTheDocument();
    });

    it('shows Revoke button for suspended spokes', () => {
      const onRevoke = jest.fn();
      render(<SpokeRegistryTable spokes={[mockSuspendedSpoke]} onRevoke={onRevoke} />);

      expect(screen.getByTitle('Revoke')).toBeInTheDocument();
    });
  });

  describe('Health Indicators', () => {
    it('shows healthy status for recent heartbeat', () => {
      const recentHeartbeat = { ...mockActiveSpoke, lastHeartbeat: new Date().toISOString() };
      render(<SpokeRegistryTable spokes={[recentHeartbeat]} />);

      // Should show "Just now" for recent heartbeat
      expect(screen.getByText('Just now')).toBeInTheDocument();
    });

    it('shows degraded status for older heartbeat', () => {
      const oldHeartbeat = new Date();
      oldHeartbeat.setMinutes(oldHeartbeat.getMinutes() - 5);
      const spoke = { ...mockActiveSpoke, lastHeartbeat: oldHeartbeat.toISOString() };

      render(<SpokeRegistryTable spokes={[spoke]} />);
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });
  });

  describe('Table Structure', () => {
    it('renders all column headers', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} />);

      expect(screen.getByText('Spoke')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('Trust Level')).toBeInTheDocument();
      expect(screen.getByText('Health')).toBeInTheDocument();
      expect(screen.getByText('Policy Sync')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('renders external link for spoke base URL', () => {
      render(<SpokeRegistryTable spokes={[mockActiveSpoke]} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', mockActiveSpoke.baseUrl);
      expect(link).toHaveAttribute('target', '_blank');
    });
  });
});

