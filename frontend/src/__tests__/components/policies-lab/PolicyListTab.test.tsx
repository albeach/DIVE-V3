/**
 * PolicyListTab Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import PolicyListTab from '@/components/policies-lab/PolicyListTab';

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
    type: 'rego' as const,
    filename: 'test-policy.rego',
    validated: true,
    metadata: {
      name: 'Test Rego Policy',
      packageOrPolicyId: 'dive.lab.test',
      rulesCount: 3,
      createdAt: '2025-10-27T12:00:00Z'
    }
  },
  {
    policyId: 'policy-456',
    type: 'xacml' as const,
    filename: 'test-policy.xml',
    validated: true,
    metadata: {
      name: 'Test XACML Policy',
      packageOrPolicyId: 'urn:dive:lab:test',
      rulesCount: 2,
      createdAt: '2025-10-27T13:00:00Z'
    }
  }
];

describe('PolicyListTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  it('shows loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('fetches and displays policies', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
      expect(screen.getByText('Test XACML Policy')).toBeInTheDocument();
    });
  });

  it('displays policy type badges correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('REGO')).toBeInTheDocument();
      expect(screen.getByText('XACML')).toBeInTheDocument();
    });
  });

  it('displays validated status badges', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      const validatedBadges = screen.getAllByText('✓ Validated');
      expect(validatedBadges.length).toBe(2);
    });
  });

  it('displays package/policy IDs', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('dive.lab.test')).toBeInTheDocument();
      expect(screen.getByText('urn:dive:lab:test')).toBeInTheDocument();
    });
  });

  it('shows empty state when no policies', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: [], count: 0 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/No policies yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Get started by uploading/i)).toBeInTheDocument();
    });
  });

  it('expands policy details when View button clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
    });

    const viewButton = screen.getAllByText('View')[0];
    fireEvent.click(viewButton);

    await waitFor(() => {
      // Use getAllByText since "Policy ID:" appears multiple times in the DOM
      const policyIdTexts = screen.getAllByText(/Policy ID:/i);
      expect(policyIdTexts.length).toBeGreaterThan(0);
      expect(screen.getByText(/Use this policy ID in the/i)).toBeInTheDocument();
    });
  });

  it('collapses policy details when Hide button clicked', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
    });

    // Expand first
    const viewButton = screen.getAllByText('View')[0];
    fireEvent.click(viewButton);

    await waitFor(() => {
      // Use getAllByText since "Policy ID:" appears multiple times
      const policyIdTexts = screen.getAllByText(/Policy ID:/i);
      expect(policyIdTexts.length).toBeGreaterThan(0);
    });

    // Then collapse
    const hideButton = screen.getByText('Hide');
    fireEvent.click(hideButton);

    await waitFor(() => {
      expect(screen.queryByText(/Use this policy ID in the/i)).not.toBeInTheDocument();
    });
  });

  it('confirms before deleting policy', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    // Mock window.confirm
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
    });

    const deleteButton = screen.getAllByText('Delete')[0];
    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this policy?');
    confirmSpy.mockRestore();
  });

  it('deletes policy when confirmed', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies, count: 2 })
      })
      .mockResolvedValueOnce({ ok: true }) // DELETE request
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: [mockPolicies[1]], count: 1 })
      }); // Refresh list

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
    });

    const deleteButton = screen.getAllByText('Delete')[0];
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/policies-lab/policy-123',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    confirmSpy.mockRestore();
  });

  it('displays error message on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/❌.*Network error/i)).toBeInTheDocument();
    });
  });

  it('shows refresh button', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
  });

  it('refetches policies when refresh button clicked', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies, count: 2 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies, count: 2 })
      });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
    });

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it('shows upload limit warning when approaching limit', async () => {
    const manyPolicies = Array.from({ length: 9 }, (_, i) => ({
      ...mockPolicies[0],
      policyId: `policy-${i}`,
      metadata: { ...mockPolicies[0].metadata, name: `Policy ${i}` }
    }));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: manyPolicies, count: 9 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/⚠️ You have 9\/10 policies uploaded/i)).toBeInTheDocument();
      expect(screen.getByText(/1 remaining/i)).toBeInTheDocument();
    });
  });

  it('displays policy count correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ policies: mockPolicies, count: 2 })
    });

    render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('2 policies uploaded (max 10)')).toBeInTheDocument();
    });
  });

  it('refetches when refreshTrigger changes', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies, count: 2 })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ policies: mockPolicies, count: 2 })
      });

    const { rerender } = render(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={0} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Test Rego Policy')).toBeInTheDocument();
    });

    rerender(
      <SessionProvider session={mockSession}>
        <PolicyListTab refreshTrigger={1} />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
