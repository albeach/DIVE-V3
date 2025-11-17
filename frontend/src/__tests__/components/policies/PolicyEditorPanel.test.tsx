import { getPolicyInsights, lintPolicySource } from '@/components/policies/PolicyEditorPanel';

describe('PolicyEditorPanel helpers', () => {
  it('identifies missing mandatory structures', () => {
    const issues = lintPolicySource(`default allow := false`);
    expect(issues).toEqual(
      expect.arrayContaining([
        'Missing package declaration',
        'No allow rule defined',
      ]),
    );
  });

  it('passes lint for well-formed policies', () => {
    const policy = `package dive.test

import rego.v1

default allow := false

allow if {
  true
}

reason := "ok"

obligations := []
`;
    const issues = lintPolicySource(policy);
    expect(issues).toHaveLength(0);
  });

  it('returns useful insights', () => {
    const policy = `package dive.test

default allow := false

allow if { true }

reason := "allowed"

obligations := []
`;
    const insights = getPolicyInsights(policy);
    expect(insights.lineCount).toBeGreaterThan(0);
    expect(insights.ruleCount).toBeGreaterThanOrEqual(2);
    expect(insights.hasDefaultDeny).toBe(true);
    expect(insights.hasAllowRule).toBe(true);
  });
});

