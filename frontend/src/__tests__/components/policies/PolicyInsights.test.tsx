import { render, screen } from '@testing-library/react';
import { PolicyInsights } from '@/components/policies/PolicyInsights';

describe('PolicyInsights', () => {
  it('displays policy metrics correctly', () => {
    render(
      <PolicyInsights
        lineCount={50}
        ruleCount={5}
        hasDefaultDeny={true}
        hasAllowRule={true}
      />
    );

    expect(screen.getByText(/Lines: 50/i)).toBeInTheDocument();
    expect(screen.getByText(/Rules: 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Default deny ✅/i)).toBeInTheDocument();
    expect(screen.getByText(/Allow rule ✅/i)).toBeInTheDocument();
  });

  it('shows warnings when fail-secure patterns are missing', () => {
    render(
      <PolicyInsights
        lineCount={20}
        ruleCount={1}
        hasDefaultDeny={false}
        hasAllowRule={false}
      />
    );

    expect(screen.getByText(/Default deny ⚠️/i)).toBeInTheDocument();
    expect(screen.getByText(/Allow rule ⚠️/i)).toBeInTheDocument();
  });

  it('applies dark mode classes correctly', () => {
    const { container } = render(
      <PolicyInsights
        lineCount={10}
        ruleCount={2}
        hasDefaultDeny={true}
        hasAllowRule={true}
      />
    );

    // Check that dark mode classes are present
    const spans = container.querySelectorAll('span');
    const hasDarkClasses = Array.from(spans).some((span) => 
      span.className.includes('dark:bg-') || span.className.includes('dark:text-')
    );

    expect(hasDarkClasses).toBe(true);
  });

  it('provides accessible labels for screen readers', () => {
    render(
      <PolicyInsights
        lineCount={10}
        ruleCount={2}
        hasDefaultDeny={true}
        hasAllowRule={false}
      />
    );

    expect(screen.getByLabelText('Default deny present')).toBeInTheDocument();
    expect(screen.getByLabelText('Allow rule missing')).toBeInTheDocument();
  });
});
