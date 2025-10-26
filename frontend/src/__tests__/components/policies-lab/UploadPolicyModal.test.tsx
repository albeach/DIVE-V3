/**
 * UploadPolicyModal Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import UploadPolicyModal from '@/components/policies-lab/UploadPolicyModal';

// Mock fetch
global.fetch = jest.fn();

const mockSession = {
  user: {
    uniqueID: 'test-user-123',
    name: 'Test User',
    email: 'test@example.com'
  },
  expires: '2025-12-31'
};

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onSuccess: jest.fn()
};

describe('UploadPolicyModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('renders modal when open', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    expect(screen.getByText('📤 Upload Policy')).toBeInTheDocument();
  });

  it('does not render modal when closed', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} isOpen={false} />
      </SessionProvider>
    );

    expect(screen.queryByText('📤 Upload Policy')).not.toBeInTheDocument();
  });

  it('displays file upload area', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    expect(screen.getByText(/Upload a file/i)).toBeInTheDocument();
    expect(screen.getByText(/\.rego or \.xml up to 256KB/i)).toBeInTheDocument();
  });

  it('displays policy name input', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    expect(screen.getByLabelText(/Policy Name/i)).toBeInTheDocument();
  });

  it('displays description textarea', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
  });

  it('displays standards lens selector', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    expect(screen.getByText('Federation (5663)')).toBeInTheDocument();
    expect(screen.getByText('Unified')).toBeInTheDocument();
    expect(screen.getByText('Object (240)')).toBeInTheDocument();
  });

  it('auto-fills policy name from filename', async () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const file = new File(['package dive.lab.test'], 'test-policy.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Policy Name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('test-policy');
    });
  });

  it('shows file preview after selection', async () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const file = new File(['package dive.lab.test'], 'test-policy.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test-policy.rego')).toBeInTheDocument();
      expect(screen.getByText('REGO')).toBeInTheDocument();
    });
  });

  it('displays validation errors on upload failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        validated: false,
        validationErrors: ['Package must start with "dive.lab."']
      })
    });

    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const file = new File(['package bad.package'], 'test.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const nameInput = screen.getByLabelText(/Policy Name/i);
    fireEvent.change(nameInput, { target: { value: 'Test Policy' } });

    const uploadButton = screen.getByText('Upload & Validate');
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByText(/Validation Error/i)).toBeInTheDocument();
      expect(screen.getByText(/Package must start with "dive.lab."/i)).toBeInTheDocument();
    });
  });

  it('displays success message on successful upload', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        policyId: 'test-policy-123',
        validated: true,
        validationErrors: []
      })
    });

    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const file = new File(['package dive.lab.test'], 'test.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const nameInput = screen.getByLabelText(/Policy Name/i);
    fireEvent.change(nameInput, { target: { value: 'Test Policy' } });

    const uploadButton = screen.getByText('Upload & Validate');
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByText(/Policy Uploaded Successfully/i)).toBeInTheDocument();
      expect(screen.getByText('test-policy-123')).toBeInTheDocument();
    });
  });

  it('calls onSuccess after successful upload', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        policyId: 'test-policy-123',
        validated: true,
        validationErrors: []
      })
    });

    const onSuccess = jest.fn();

    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} onSuccess={onSuccess} />
      </SessionProvider>
    );

    const file = new File(['package dive.lab.test'], 'test.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const nameInput = screen.getByLabelText(/Policy Name/i);
    fireEvent.change(nameInput, { target: { value: 'Test Policy' } });

    const uploadButton = screen.getByText('Upload & Validate');
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('disables upload button when no file selected', () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const uploadButton = screen.getByText('Upload & Validate') as HTMLButtonElement;
    expect(uploadButton).toBeDisabled();
  });

  it('disables upload button when no name provided', async () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const file = new File(['package dive.lab.test'], 'test.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Clear the auto-filled name
    const nameInput = screen.getByLabelText(/Policy Name/i);
    fireEvent.change(nameInput, { target: { value: '' } });

    await waitFor(() => {
      const uploadButton = screen.getByText('Upload & Validate') as HTMLButtonElement;
      expect(uploadButton).toBeDisabled();
    });
  });

  it('allows file removal after selection', async () => {
    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} />
      </SessionProvider>
    );

    const file = new File(['package dive.lab.test'], 'test.rego', { type: 'text/plain' });
    const input = screen.getByLabelText(/Policy File/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.rego')).toBeInTheDocument();
    });

    const removeButton = screen.getByText('✕');
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText('test.rego')).not.toBeInTheDocument();
    });
  });

  it('calls onClose when cancel button clicked', () => {
    const onClose = jest.fn();

    render(
      <SessionProvider session={mockSession}>
        <UploadPolicyModal {...defaultProps} onClose={onClose} />
      </SessionProvider>
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });
});

