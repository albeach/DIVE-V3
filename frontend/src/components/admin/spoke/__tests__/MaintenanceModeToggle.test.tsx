/**
 * DIVE V3 - MaintenanceModeToggle Tests
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MaintenanceModeToggle, IMaintenanceStatus } from '../MaintenanceModeToggle';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockInactiveStatus: IMaintenanceStatus = {
  isInMaintenanceMode: false,
};

const mockActiveStatus: IMaintenanceStatus = {
  isInMaintenanceMode: true,
  maintenanceReason: 'Scheduled system update',
  maintenanceEnteredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 mins ago
};

describe('MaintenanceModeToggle', () => {
  describe('Rendering', () => {
    it('renders loading state correctly', () => {
      render(<MaintenanceModeToggle status={null} loading={true} />);
      const loadingElement = document.querySelector('.animate-pulse');
      expect(loadingElement).toBeInTheDocument();
    });

    it('renders inactive maintenance mode', () => {
      render(<MaintenanceModeToggle status={mockInactiveStatus} />);

      expect(screen.getByText('Maintenance Mode')).toBeInTheDocument();
      expect(screen.getByText('System is operational')).toBeInTheDocument();
    });

    it('renders active maintenance mode', () => {
      render(<MaintenanceModeToggle status={mockActiveStatus} />);

      expect(screen.getByText('Maintenance Mode')).toBeInTheDocument();
      expect(screen.getByText(/Active since/)).toBeInTheDocument();
    });

    it('shows maintenance reason when active', () => {
      render(<MaintenanceModeToggle status={mockActiveStatus} />);

      expect(screen.getByText(/Reason: Scheduled system update/)).toBeInTheDocument();
    });
  });

  describe('Toggle Behavior', () => {
    it('shows toggle button', () => {
      render(<MaintenanceModeToggle status={mockInactiveStatus} />);

      const toggleButton = screen.getByRole('button');
      expect(toggleButton).toBeInTheDocument();
    });

    it('opens enter maintenance modal when inactive and clicked', () => {
      const onEnter = jest.fn();
      render(<MaintenanceModeToggle status={mockInactiveStatus} onEnter={onEnter} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Enter Maintenance Mode')).toBeInTheDocument();
    });

    it('calls onExit when active and toggle clicked', async () => {
      const onExit = jest.fn().mockResolvedValue(undefined);
      render(<MaintenanceModeToggle status={mockActiveStatus} onExit={onExit} />);

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(onExit).toHaveBeenCalled();
      });
    });
  });

  describe('Enter Maintenance Modal', () => {
    it('displays warning message in modal', () => {
      const onEnter = jest.fn();
      render(<MaintenanceModeToggle status={mockInactiveStatus} onEnter={onEnter} />);

      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText(/Stop heartbeats to Hub/)).toBeInTheDocument();
      expect(screen.getByText(/Queue audit events locally/)).toBeInTheDocument();
      expect(screen.getByText(/Suspend policy sync/)).toBeInTheDocument();
    });

    it('allows entering a reason', async () => {
      const onEnter = jest.fn();
      render(<MaintenanceModeToggle status={mockInactiveStatus} onEnter={onEnter} />);

      fireEvent.click(screen.getByRole('button'));

      const reasonInput = screen.getByPlaceholderText(/Scheduled system update/);
      await userEvent.type(reasonInput, 'Testing');

      expect(reasonInput).toHaveValue('Testing');
    });

    it('calls onEnter with reason when confirmed', async () => {
      const onEnter = jest.fn().mockResolvedValue(undefined);
      render(<MaintenanceModeToggle status={mockInactiveStatus} onEnter={onEnter} />);

      fireEvent.click(screen.getByRole('button'));

      const reasonInput = screen.getByPlaceholderText(/Scheduled system update/);
      await userEvent.type(reasonInput, 'Test reason');

      fireEvent.click(screen.getByRole('button', { name: /enter maintenance/i }));

      await waitFor(() => {
        expect(onEnter).toHaveBeenCalledWith('Test reason');
      });
    });

    it('uses default reason if none provided', async () => {
      const onEnter = jest.fn().mockResolvedValue(undefined);
      render(<MaintenanceModeToggle status={mockInactiveStatus} onEnter={onEnter} />);

      fireEvent.click(screen.getByRole('button'));
      fireEvent.click(screen.getByRole('button', { name: /enter maintenance/i }));

      await waitFor(() => {
        expect(onEnter).toHaveBeenCalledWith('Manual maintenance');
      });
    });

    it('closes modal on cancel', () => {
      const onEnter = jest.fn();
      render(<MaintenanceModeToggle status={mockInactiveStatus} onEnter={onEnter} />);

      fireEvent.click(screen.getByRole('button'));
      expect(screen.getByText('Enter Maintenance Mode')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByText('Enter Maintenance Mode')).not.toBeInTheDocument();
    });
  });

  describe('Active Maintenance Warning', () => {
    it('shows warning banner when maintenance is active', () => {
      render(<MaintenanceModeToggle status={mockActiveStatus} />);

      expect(screen.getByText('Maintenance mode is active')).toBeInTheDocument();
    });

    it('lists affected systems in warning', () => {
      render(<MaintenanceModeToggle status={mockActiveStatus} />);

      expect(screen.getByText(/All Hub communications are paused/)).toBeInTheDocument();
      expect(screen.getByText(/Audit events are queued locally/)).toBeInTheDocument();
      expect(screen.getByText(/Policy sync is suspended/)).toBeInTheDocument();
      expect(screen.getByText(/Authorization uses cached policies/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles null status gracefully', () => {
      render(<MaintenanceModeToggle status={null} />);
      expect(screen.getByText('System is operational')).toBeInTheDocument();
    });

    it('handles missing maintenance reason', () => {
      const noReasonStatus = { isInMaintenanceMode: true };
      render(<MaintenanceModeToggle status={noReasonStatus} />);

      // Should not crash and should show active state
      expect(screen.getByText('Maintenance mode is active')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('disables toggle during processing', async () => {
      const onExit = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<MaintenanceModeToggle status={mockActiveStatus} onExit={onExit} />);

      const toggleButton = screen.getByRole('button');
      fireEvent.click(toggleButton);

      // Button should be disabled while processing
      await waitFor(() => {
        expect(toggleButton).toHaveClass('opacity-50');
      });
    });
  });
});

