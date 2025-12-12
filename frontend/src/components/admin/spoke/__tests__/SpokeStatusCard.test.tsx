/**
 * DIVE V3 - SpokeStatusCard Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SpokeStatusCard, ISpokeRuntimeInfo } from '../SpokeStatusCard';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
  },
}));

const mockActiveRuntime: ISpokeRuntimeInfo = {
  spokeId: 'spoke-nzl-12345',
  instanceCode: 'NZL',
  name: 'New Zealand Defence Force',
  status: 'active',
  trustLevel: 'partner',
  registeredAt: '2025-12-01T00:00:00Z',
  approvedAt: '2025-12-02T00:00:00Z',
  hubUrl: 'https://hub.dive.example.com',
  startedAt: '2025-12-10T00:00:00Z',
};

const mockPendingRuntime: ISpokeRuntimeInfo = {
  spokeId: 'spoke-aus-67890',
  instanceCode: 'AUS',
  name: 'Australian Defence Force',
  status: 'pending',
  trustLevel: 'development',
  registeredAt: '2025-12-10T00:00:00Z',
};

const mockSuspendedRuntime: ISpokeRuntimeInfo = {
  ...mockActiveRuntime,
  status: 'suspended',
};

describe('SpokeStatusCard', () => {
  describe('Rendering', () => {
    it('renders loading state correctly', () => {
      render(<SpokeStatusCard runtime={null} loading={true} />);
      // Should show skeleton/loading animation
      const loadingElement = document.querySelector('.animate-pulse');
      expect(loadingElement).toBeInTheDocument();
    });

    it('renders empty state when no runtime data', () => {
      render(<SpokeStatusCard runtime={null} loading={false} />);
      expect(screen.getByText('No spoke status available')).toBeInTheDocument();
    });

    it('renders spoke information correctly', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      
      expect(screen.getByText('NZL')).toBeInTheDocument();
      expect(screen.getByText('New Zealand Defence Force')).toBeInTheDocument();
    });

    it('displays country flag emoji', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('🇳🇿')).toBeInTheDocument();
    });

    it('displays fallback flag for unknown country', () => {
      const unknownRuntime = { ...mockActiveRuntime, instanceCode: 'XXX' };
      render(<SpokeStatusCard runtime={unknownRuntime} />);
      expect(screen.getByText('🌐')).toBeInTheDocument();
    });
  });

  describe('Status Badge', () => {
    it('shows Active status badge', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows Pending Approval status badge', () => {
      render(<SpokeStatusCard runtime={mockPendingRuntime} />);
      expect(screen.getByText('Pending Approval')).toBeInTheDocument();
    });

    it('shows Suspended status badge', () => {
      render(<SpokeStatusCard runtime={mockSuspendedRuntime} />);
      expect(screen.getByText('Suspended')).toBeInTheDocument();
    });

    it('shows Revoked status badge', () => {
      const revokedRuntime = { ...mockActiveRuntime, status: 'revoked' as const };
      render(<SpokeStatusCard runtime={revokedRuntime} />);
      expect(screen.getByText('Revoked')).toBeInTheDocument();
    });
  });

  describe('Trust Level', () => {
    it('displays trust level correctly', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('Partner')).toBeInTheDocument();
    });

    it('displays different trust levels', () => {
      const nationalRuntime = { ...mockActiveRuntime, trustLevel: 'national' as const };
      render(<SpokeStatusCard runtime={nationalRuntime} />);
      expect(screen.getByText('National')).toBeInTheDocument();
    });
  });

  describe('Stats Grid', () => {
    it('displays Trust Level section', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('Trust Level')).toBeInTheDocument();
    });

    it('displays Spoke ID section', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('Spoke ID')).toBeInTheDocument();
      expect(screen.getByText(/spoke-nzl-12/)).toBeInTheDocument();
    });

    it('displays Registered section', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('Registered')).toBeInTheDocument();
    });

    it('displays Uptime section', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      expect(screen.getByText('Uptime')).toBeInTheDocument();
    });
  });

  describe('Date Formatting', () => {
    it('formats registration date correctly', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      // Should show relative time for registeredAt (could be multiple dates shown)
      const dateElements = screen.getAllByText(/\d+d ago/);
      expect(dateElements.length).toBeGreaterThan(0);
    });

    it('handles missing dates gracefully', () => {
      const noDateRuntime = { ...mockActiveRuntime, registeredAt: undefined };
      render(<SpokeStatusCard runtime={noDateRuntime} />);
      const neverElements = screen.getAllByText('Never');
      expect(neverElements.length).toBeGreaterThan(0);
    });
  });

  describe('Accessibility', () => {
    it('has proper heading structure', () => {
      render(<SpokeStatusCard runtime={mockActiveRuntime} />);
      const heading = screen.getByRole('heading', { level: 2, hidden: true });
      // The component uses h2 implicitly with text content
    });
  });
});

