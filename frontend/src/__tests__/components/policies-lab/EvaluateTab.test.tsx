/**
 * EvaluateTab Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import EvaluateTab from '@/components/policies-lab/EvaluateTab';

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

const mockPolicies = [
  {
    policyId: 'policy-123',
    type: 'rego',
    metadata: {
      name: 'Test Rego Policy',
      packageOrPolicyId: 'dive.lab.test'
    }
  }
];

describe('EvaluateTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('renders policy selector', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies })
    });

    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Select Policy to Evaluate *')).toBeInTheDocument();
    });
  });

  it('displays quick presets section', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    expect(screen.getByText('Quick Presets')).toBeInTheDocument();
    expect(screen.getByText('Clearance Match (ALLOW)')).toBeInTheDocument();
    expect(screen.getByText('Clearance Mismatch (DENY)')).toBeInTheDocument();
    expect(screen.getByText('Releasability Fail (DENY)')).toBeInTheDocument();
    expect(screen.getByText('COI Match (ALLOW)')).toBeInTheDocument();
  });

  it('displays subject input section', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    expect(screen.getByText('👤 Subject')).toBeInTheDocument();
    expect(screen.getByLabelText(/Unique ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Clearance/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Country/i)).toBeInTheDocument();
  });

  it('displays resource input section', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    expect(screen.getByText('📄 Resource')).toBeInTheDocument();
    expect(screen.getByLabelText(/Resource ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Classification/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Releasability To/i)).toBeInTheDocument();
  });

  it('displays action input section', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    expect(screen.getByText('⚡ Action')).toBeInTheDocument();
  });

  it('displays context input section', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    expect(screen.getByText('🌐 Context')).toBeInTheDocument();
    expect(screen.getByLabelText(/Current Time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Source IP/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Device Compliant/i)).toBeInTheDocument();
  });

  it('loads preset when preset button clicked', async () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    const presetButton = screen.getByText('Clearance Match (ALLOW)');
    fireEvent.click(presetButton);

    await waitFor(() => {
      const uniqueIDInput = screen.getByLabelText(/Unique ID/i) as HTMLInputElement;
      expect(uniqueIDInput.value).toBe('john.doe@mil');
    });

    const clearanceSelect = screen.getByLabelText(/Clearance/i) as HTMLSelectElement;
    expect(clearanceSelect.value).toBe('SECRET');
  });

  it('shows warning when no policies uploaded', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: [] })
    });

    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/⚠️ No policies uploaded yet/i)).toBeInTheDocument();
    });
  });

  it('disables evaluate button when no policy selected', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    const evaluateButton = screen.getByText('Evaluate Policy') as HTMLButtonElement;
    expect(evaluateButton).toBeDisabled();
  });

  it('enables evaluate button when policy selected', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies })
    });

    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'policy-123' } });
    });

    const evaluateButton = screen.getByText('Evaluate Policy') as HTMLButtonElement;
    expect(evaluateButton).not.toBeDisabled();
  });

  it('calls API when evaluate button clicked', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          engine: 'opa',
          decision: 'ALLOW',
          reason: 'All conditions satisfied',
          obligations: [],
          advice: [],
          evaluation_details: {
            latency_ms: 45,
            policy_version: '1.0',
            trace: []
          },
          policy_metadata: {
            id: 'policy-123',
            type: 'rego',
            packageOrPolicyId: 'dive.lab.test',
            name: 'Test Policy'
          },
          inputs: {
            unified: {},
            rego_input: {},
            xacml_request: ''
          }
        })
      });

    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'policy-123' } });
    });

    const evaluateButton = screen.getByText('Evaluate Policy');
    fireEvent.click(evaluateButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/policies-lab/policy-123/evaluate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.any(String)
        })
      );
    });
  });

  it('displays error message on evaluation failure', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies })
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Evaluation failed' })
      });

    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'policy-123' } });
    });

    const evaluateButton = screen.getByText('Evaluate Policy');
    fireEvent.click(evaluateButton);

    await waitFor(() => {
      expect(screen.getByText(/Evaluation Error/i)).toBeInTheDocument();
      expect(screen.getByText(/Evaluation failed/i)).toBeInTheDocument();
    });
  });

  it('allows COI selection via checkboxes', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    const fveyCheckbox = screen.getByRole('checkbox', { name: 'FVEY' });
    fireEvent.click(fveyCheckbox);

    expect(fveyCheckbox).toBeChecked();
  });

  it('allows multiple country selection for releasability', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    const usaCheckbox = screen.getByRole('checkbox', { name: 'USA' });
    const gbrCheckbox = screen.getByRole('checkbox', { name: 'GBR' });

    fireEvent.click(usaCheckbox);
    fireEvent.click(gbrCheckbox);

    expect(usaCheckbox).toBeChecked();
    expect(gbrCheckbox).toBeChecked();
  });

  it('updates action when dropdown changed', () => {
    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    const actionSelect = screen.getAllByRole('combobox').find(
      select => select.getAttribute('value') === 'read'
    ) as HTMLSelectElement;

    fireEvent.change(actionSelect, { target: { value: 'write' } });

    expect(actionSelect.value).toBe('write');
  });

  it('shows loading state during evaluation', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies })
      })
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <SessionProvider session={mockSession}>
        <EvaluateTab />
      </SessionProvider>
    );

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'policy-123' } });
    });

    const evaluateButton = screen.getByText('Evaluate Policy');
    fireEvent.click(evaluateButton);

    await waitFor(() => {
      expect(screen.getByText('Evaluating...')).toBeInTheDocument();
    });
  });
});



