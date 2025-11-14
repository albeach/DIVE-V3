/**
 * ResultsComparator Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResultsComparator from '@/components/policies-lab/ResultsComparator';

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(() => Promise.resolve()),
  },
});

const mockOPAResult = {
  engine: 'opa' as const,
  decision: 'ALLOW' as const,
  reason: 'All conditions satisfied',
  obligations: [
    {
      type: 'LOG_ACCESS',
      params: { resourceId: 'doc-123', timestamp: '2025-10-27T12:00:00Z' }
    }
  ],
  advice: [],
  evaluation_details: {
    latency_ms: 45,
    policy_version: '1.0',
    trace: [
      { rule: 'is_not_authenticated', result: false, reason: 'Subject is authenticated' },
      { rule: 'allow', result: true, reason: 'No violations found' }
    ]
  },
  policy_metadata: {
    id: 'policy-123',
    type: 'rego' as const,
    packageOrPolicyId: 'dive.lab.clearance',
    name: 'Clearance Policy'
  },
  inputs: {
    unified: {
      subject: { uniqueID: 'test@example.com', clearance: 'SECRET', countryOfAffiliation: 'USA', authenticated: true, aal: 'AAL2' },
      action: 'read' as const,
      resource: { resourceId: 'doc-123', classification: 'SECRET' as const, releasabilityTo: ['USA'] },
      context: { currentTime: '2025-10-27T12:00:00Z', requestId: 'req-123', deviceCompliant: true }
    },
    rego_input: { input: {} },
    xacml_request: '<Request>...</Request>'
  }
};

const mockXACMLResult = {
  ...mockOPAResult,
  engine: 'xacml' as const,
  decision: 'PERMIT' as const,
  advice: [
    {
      type: 'mfa-recommended',
      params: { reason: 'High-value resource' }
    }
  ],
  policy_metadata: {
    ...mockOPAResult.policy_metadata,
    type: 'xacml' as const,
    packageOrPolicyId: 'urn:dive:lab:clearance'
  }
};

describe('ResultsComparator', () => {
  it('renders evaluation results header', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('✅ Evaluation Results')).toBeInTheDocument();
  });

  it('displays policy name and type', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText(/Clearance Policy/i)).toBeInTheDocument();
    // Policy type is rendered inline with policy name, check for it in the text content
    expect(screen.getByText(/\(REGO\)/i)).toBeInTheDocument();
  });

  it('displays OPA decision badge correctly', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('ALLOW')).toBeInTheDocument();
    expect(screen.getByText('OPA Decision')).toBeInTheDocument();
  });

  it('displays XACML decision badge correctly', () => {
    render(<ResultsComparator result={mockXACMLResult} />);

    expect(screen.getByText('PERMIT')).toBeInTheDocument();
    expect(screen.getByText('XACML Decision')).toBeInTheDocument();
  });

  it('displays decision reason', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('All conditions satisfied')).toBeInTheDocument();
  });

  it('displays latency metrics', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('45ms')).toBeInTheDocument();
  });

  it('displays policy version', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('Policy Version')).toBeInTheDocument();
    expect(screen.getByText('1.0')).toBeInTheDocument();
  });

  it('displays obligations when present', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('Obligations (1)')).toBeInTheDocument();
    expect(screen.getByText('LOG_ACCESS')).toBeInTheDocument();
  });

  it('displays advice when present (XACML)', () => {
    render(<ResultsComparator result={mockXACMLResult} />);

    expect(screen.getByText('Advice (1)')).toBeInTheDocument();
    expect(screen.getByText('mfa-recommended')).toBeInTheDocument();
  });

  it('displays evaluation trace accordion', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('Evaluation Trace (2 steps)')).toBeInTheDocument();
  });

  it('expands trace when clicked', async () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const traceButton = screen.getByText('Evaluation Trace (2 steps)');
    fireEvent.click(traceButton);

    await waitFor(() => {
      expect(screen.getByText('is_not_authenticated')).toBeInTheDocument();
      expect(screen.getByText('Subject is authenticated')).toBeInTheDocument();
      expect(screen.getByText('allow')).toBeInTheDocument();
      expect(screen.getByText('No violations found')).toBeInTheDocument();
    });
  });

  it('collapses trace when clicked again', async () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const traceButton = screen.getByText('Evaluation Trace (2 steps)');
    
    // Expand
    fireEvent.click(traceButton);
    await waitFor(() => {
      expect(screen.getByText('is_not_authenticated')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(traceButton);
    await waitFor(() => {
      expect(screen.queryByText('is_not_authenticated')).not.toBeInTheDocument();
    });
  });

  it('displays trace pass/fail indicators correctly', async () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const traceButton = screen.getByText('Evaluation Trace (2 steps)');
    fireEvent.click(traceButton);

    await waitFor(() => {
      expect(screen.getByText('✗ FAIL')).toBeInTheDocument(); // is_not_authenticated result: false
      expect(screen.getByText('✓ PASS')).toBeInTheDocument(); // allow result: true
    });
  });

  it('has copy JSON button', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('Copy JSON')).toBeInTheDocument();
  });

  it('copies JSON to clipboard when copy button clicked', async () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const copyButton = screen.getByText('Copy JSON');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify(mockOPAResult, null, 2)
      );
    });
  });

  it('displays generated inputs accordion', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('🔍 Generated Inputs')).toBeInTheDocument();
  });

  it('expands generated inputs when clicked', async () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const inputsButton = screen.getByText('🔍 Generated Inputs');
    fireEvent.click(inputsButton);

    await waitFor(() => {
      expect(screen.getByText('Unified Input (JSON)')).toBeInTheDocument();
      expect(screen.getByText('OPA Rego Input (JSON)')).toBeInTheDocument();
      expect(screen.getByText('XACML Request (XML)')).toBeInTheDocument();
    });
  });

  it('shows DENY icon for DENY decision', () => {
    const denyResult = { ...mockOPAResult, decision: 'DENY' as const };
    render(<ResultsComparator result={denyResult} />);

    expect(screen.getByText('❌ Evaluation Results')).toBeInTheDocument();
  });

  it('applies correct color to ALLOW badge', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const badge = screen.getByText('ALLOW');
    expect(badge).toHaveClass('bg-green-100', 'text-green-800');
  });

  it('applies correct color to DENY badge', () => {
    const denyResult = { ...mockOPAResult, decision: 'DENY' as const };
    render(<ResultsComparator result={denyResult} />);

    const badge = screen.getByText('DENY');
    expect(badge).toHaveClass('bg-red-100', 'text-red-800');
  });

  it('applies correct color to NOT_APPLICABLE badge', () => {
    const naResult = { ...mockOPAResult, decision: 'NOT_APPLICABLE' as const };
    render(<ResultsComparator result={naResult} />);

    const badge = screen.getByText('NOT_APPLICABLE');
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800');
  });

  it('displays package/policy ID in code format', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const codeElement = screen.getByText('dive.lab.clearance');
    expect(codeElement.tagName).toBe('CODE');
  });

  it('shows obligation parameters in code format', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    const obligationParams = screen.getByText(/"resourceId": "doc-123"/);
    expect(obligationParams).toBeInTheDocument();
  });

  it('handles empty obligations array', () => {
    const noObligationsResult = { ...mockOPAResult, obligations: [] };
    render(<ResultsComparator result={noObligationsResult} />);

    expect(screen.queryByText('Obligations')).not.toBeInTheDocument();
  });

  it('handles empty advice array', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.queryByText('Advice')).not.toBeInTheDocument();
  });

  it('handles empty trace array', () => {
    const noTraceResult = { ...mockOPAResult, evaluation_details: { ...mockOPAResult.evaluation_details, trace: [] } };
    render(<ResultsComparator result={noTraceResult} />);

    expect(screen.queryByText('Evaluation Trace')).not.toBeInTheDocument();
  });

  it('displays engine icon correctly for OPA', () => {
    render(<ResultsComparator result={mockOPAResult} />);

    expect(screen.getByText('📝')).toBeInTheDocument();
  });

  it('displays engine icon correctly for XACML', () => {
    render(<ResultsComparator result={mockXACMLResult} />);

    expect(screen.getByText('📄')).toBeInTheDocument();
  });
});



