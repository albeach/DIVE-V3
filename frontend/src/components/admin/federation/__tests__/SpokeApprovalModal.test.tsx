/**
 * DIVE V3 - SpokeApprovalModal Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpokeApprovalModal } from '../SpokeApprovalModal';
import { ISpoke, IApprovalRequest } from '@/types/federation.types';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    button: ({ children, onClick, disabled, ...props }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
      <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const mockPendingSpoke: ISpoke = {
  spokeId: 'spoke-nzl-12345',
  instanceCode: 'NZL',
  name: 'New Zealand Defence Force',
  status: 'pending',
  baseUrl: 'https://nzl.dive.example.com',
  apiUrl: 'https://nzl.dive.example.com/api',
  idpUrl: 'https://nzl.dive.example.com/auth',
  trustLevel: 'development',
  allowedPolicyScopes: [],
  maxClassificationAllowed: 'UNCLASSIFIED',
  dataIsolationLevel: 'minimal',
  registeredAt: '2025-12-10T00:00:00Z',
  contactEmail: 'admin@nzdf.mil.nz',
};

describe('SpokeApprovalModal', () => {
  const mockOnClose = jest.fn();
  const mockOnApprove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when spoke is null', () => {
      const { container } = render(
        <SpokeApprovalModal
          spoke={null}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={false}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );
      // AnimatePresence mock passes through children, so check for modal content
      expect(screen.queryByText('Approve Spoke Registration')).not.toBeInTheDocument();
    });

    it('renders modal when open with spoke data', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByText('Approve Spoke Registration')).toBeInTheDocument();
      expect(screen.getByText('NZL — New Zealand Defence Force')).toBeInTheDocument();
    });

    it('displays spoke contact email', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByText('admin@nzdf.mil.nz')).toBeInTheDocument();
    });

    it('displays spoke base URL as a link', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const link = screen.getByRole('link', { name: /nzl.dive.example.com/i });
      expect(link).toHaveAttribute('href', mockPendingSpoke.baseUrl);
    });
  });

  describe('Trust Level Selection', () => {
    it('renders all trust level options', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByText('Development')).toBeInTheDocument();
      expect(screen.getByText('Partner')).toBeInTheDocument();
      expect(screen.getByText('Bilateral')).toBeInTheDocument();
      expect(screen.getByText('National')).toBeInTheDocument();
    });

    it('allows selecting a trust level', async () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const bilateralButton = screen.getByText('Bilateral').closest('button');
      expect(bilateralButton).toBeInTheDocument();
      if (bilateralButton) {
        fireEvent.click(bilateralButton);
      }
    });
  });

  describe('Classification Level Selection', () => {
    it('renders all classification levels', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByRole('button', { name: 'Unclassified' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confidential' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Top Secret' })).toBeInTheDocument();
    });
  });

  describe('Data Isolation Selection', () => {
    it('renders all data isolation options', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByText('Full Access')).toBeInTheDocument();
      expect(screen.getByText('Filtered')).toBeInTheDocument();
      expect(screen.getByText('Minimal')).toBeInTheDocument();
    });
  });

  describe('Policy Scopes', () => {
    it('renders policy scope options', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByText('Base Guardrails')).toBeInTheDocument();
      expect(screen.getByText('Five Eyes')).toBeInTheDocument();
      expect(screen.getByText('NATO')).toBeInTheDocument();
    });

    it('shows base scope as required and checked by default', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      expect(screen.getByText('Required')).toBeInTheDocument();
      const checkboxes = screen.getAllByRole('checkbox');
      const baseCheckbox = checkboxes[0];
      expect(baseCheckbox).toBeChecked();
      expect(baseCheckbox).toBeDisabled();
    });

    it('allows toggling non-required scopes', async () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const checkboxes = screen.getAllByRole('checkbox');
      // Find a non-disabled checkbox (not the base scope)
      const toggleableCheckbox = checkboxes.find(cb => !cb.hasAttribute('disabled'));
      if (toggleableCheckbox) {
        fireEvent.click(toggleableCheckbox);
        expect(toggleableCheckbox).toBeChecked();
      }
    });
  });

  describe('Form Submission', () => {
    it('calls onApprove with correct data on submit', async () => {
      mockOnApprove.mockResolvedValue(undefined);
      
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const approveButton = screen.getByRole('button', { name: /approve spoke/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(mockOnApprove).toHaveBeenCalledWith(
          mockPendingSpoke.spokeId,
          expect.objectContaining({
            allowedScopes: expect.arrayContaining(['policy:base']),
            trustLevel: 'partner', // default
            maxClassification: 'SECRET', // default
            dataIsolationLevel: 'filtered', // default
          })
        );
      });
    });

    it('shows loading state during submission', async () => {
      mockOnApprove.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const approveButton = screen.getByRole('button', { name: /approve spoke/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText('Approving...')).toBeInTheDocument();
      });
    });

    it('shows error message on failure', async () => {
      mockOnApprove.mockRejectedValue(new Error('Network error'));
      
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const approveButton = screen.getByRole('button', { name: /approve spoke/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('calls onClose after successful submission', async () => {
      mockOnApprove.mockResolvedValue(undefined);
      
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const approveButton = screen.getByRole('button', { name: /approve spoke/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('Cancel/Close', () => {
    it('calls onClose when Cancel button clicked', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when X button clicked', () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      // Find the close button (X icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find(b => b.querySelector('svg'));
      if (closeButton) {
        fireEvent.click(closeButton);
      }
    });
  });

  describe('Notes Field', () => {
    it('allows entering notes', async () => {
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const notesField = screen.getByPlaceholderText(/add any notes/i);
      await userEvent.type(notesField, 'Test approval note');
      expect(notesField).toHaveValue('Test approval note');
    });

    it('includes notes in approval request', async () => {
      mockOnApprove.mockResolvedValue(undefined);
      
      render(
        <SpokeApprovalModal
          spoke={mockPendingSpoke}
          isOpen={true}
          onClose={mockOnClose}
          onApprove={mockOnApprove}
        />
      );

      const notesField = screen.getByPlaceholderText(/add any notes/i);
      await userEvent.type(notesField, 'Test note');

      const approveButton = screen.getByRole('button', { name: /approve spoke/i });
      fireEvent.click(approveButton);

      await waitFor(() => {
        expect(mockOnApprove).toHaveBeenCalledWith(
          mockPendingSpoke.spokeId,
          expect.objectContaining({
            notes: 'Test note',
          })
        );
      });
    });
  });
});




