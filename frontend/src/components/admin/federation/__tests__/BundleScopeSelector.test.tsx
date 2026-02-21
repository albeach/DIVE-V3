/**
 * DIVE V3 - BundleScopeSelector Tests
 *
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BundleScopeSelector } from '../BundleScopeSelector';
import { POLICY_SCOPES } from '@/types/federation.types';

describe('BundleScopeSelector', () => {
  const defaultProps = {
    selectedScopes: ['policy:base'],
    onScopesChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the component with header', () => {
      render(<BundleScopeSelector {...defaultProps} />);

      expect(screen.getByText('Select Policy Scopes')).toBeInTheDocument();
    });

    it('renders all policy scopes', () => {
      render(<BundleScopeSelector {...defaultProps} />);

      POLICY_SCOPES.forEach((scope) => {
        expect(screen.getByText(scope.label)).toBeInTheDocument();
      });
    });

    it('shows Core Policies section', () => {
      render(<BundleScopeSelector {...defaultProps} />);

      expect(screen.getByText('Core Policies')).toBeInTheDocument();
    });

    it('shows Tenant Policies section', () => {
      render(<BundleScopeSelector {...defaultProps} />);

      expect(screen.getByText('Tenant Policies')).toBeInTheDocument();
    });

    it('shows required badge for base guardrails', () => {
      render(<BundleScopeSelector {...defaultProps} />);

      expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('displays selection count', () => {
      render(<BundleScopeSelector {...defaultProps} selectedScopes={['policy:base', 'policy:usa']} />);

      expect(screen.getByText(/2/)).toBeInTheDocument();
      expect(screen.getByText(/of/)).toBeInTheDocument();
    });
  });

  describe('Scope Selection', () => {
    it('calls onScopesChange when selecting optional scope', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={['policy:base']}
          onScopesChange={onScopesChange}
        />
      );

      // Click on USA scope (optional)
      const usaScope = screen.getByText('USA Tenant');
      fireEvent.click(usaScope.closest('button')!);

      expect(onScopesChange).toHaveBeenCalledWith(['policy:base', 'policy:usa']);
    });

    it('calls onScopesChange when deselecting optional scope', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={['policy:base', 'policy:usa']}
          onScopesChange={onScopesChange}
        />
      );

      // Click on USA scope to deselect
      const usaScope = screen.getByText('USA Tenant');
      fireEvent.click(usaScope.closest('button')!);

      expect(onScopesChange).toHaveBeenCalledWith(['policy:base']);
    });

    it('does not allow deselecting required scopes', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={['policy:base']}
          onScopesChange={onScopesChange}
        />
      );

      // Try to click on Base Guardrails (required)
      const baseScope = screen.getByText('Base Guardrails');
      fireEvent.click(baseScope.closest('button')!);

      // Should not be called because it's required
      expect(onScopesChange).not.toHaveBeenCalled();
    });
  });

  describe('Quick Actions', () => {
    it('selects all scopes when clicking Select All', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={['policy:base']}
          onScopesChange={onScopesChange}
        />
      );

      fireEvent.click(screen.getByText('Select All'));

      expect(onScopesChange).toHaveBeenCalledWith(POLICY_SCOPES.map((s) => s.id));
    });

    it('selects only required scopes when clicking Required Only', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={POLICY_SCOPES.map((s) => s.id)}
          onScopesChange={onScopesChange}
        />
      );

      fireEvent.click(screen.getByText('Required Only'));

      const requiredScopes = POLICY_SCOPES.filter((s) => s.required).map((s) => s.id);
      expect(onScopesChange).toHaveBeenCalledWith(requiredScopes);
    });
  });

  describe('Disabled State', () => {
    it('does not allow selection when disabled', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={['policy:base']}
          onScopesChange={onScopesChange}
          disabled
        />
      );

      // Click on USA scope
      const usaScope = screen.getByText('USA Tenant');
      fireEvent.click(usaScope.closest('button')!);

      expect(onScopesChange).not.toHaveBeenCalled();
    });

    it('does not allow Select All when disabled', () => {
      const onScopesChange = jest.fn();
      render(
        <BundleScopeSelector
          selectedScopes={['policy:base']}
          onScopesChange={onScopesChange}
          disabled
        />
      );

      fireEvent.click(screen.getByText('Select All'));

      expect(onScopesChange).not.toHaveBeenCalled();
    });
  });

  describe('Descriptions', () => {
    it('shows descriptions when showDescriptions is true', () => {
      render(
        <BundleScopeSelector
          {...defaultProps}
          showDescriptions
        />
      );

      expect(screen.getByText(/Core security guardrails/)).toBeInTheDocument();
    });
  });
});

