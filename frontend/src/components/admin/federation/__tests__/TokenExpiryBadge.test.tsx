/**
 * DIVE V3 - TokenExpiryBadge Unit Tests
 * 
 * Tests for the TokenExpiryBadge component that displays token status.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TokenExpiryBadge, getTokenStatus, useExpiringTokens } from '../TokenExpiryBadge';
import { ISpoke } from '@/types/federation.types';
import { renderHook } from '@testing-library/react';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe('TokenExpiryBadge', () => {
  const mockSpoke: ISpoke = {
    spokeId: 'spoke-nzl-001',
    instanceCode: 'NZL',
    name: 'New Zealand',
    status: 'active',
    baseUrl: 'https://nzl.dive25.com',
    apiUrl: 'https://api.nzl.dive25.com',
    idpUrl: 'https://idp.nzl.dive25.com',
    trustLevel: 'bilateral',
    allowedPolicyScopes: ['policy:base', 'policy:fvey'],
    maxClassificationAllowed: 'SECRET',
    dataIsolationLevel: 'filtered',
    registeredAt: '2025-01-01T00:00:00Z',
    contactEmail: 'admin@nzl.gov',
    tokenScopes: ['policy:base', 'policy:fvey'],
  };

  describe('getTokenStatus', () => {
    it('returns "none" status when no expiry date', () => {
      const result = getTokenStatus(undefined);
      expect(result.status).toBe('none');
    });

    it('returns "expired" status when token is expired', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = getTokenStatus(pastDate);
      expect(result.status).toBe('expired');
      expect(result.daysUntilExpiry).toBeLessThanOrEqual(0);
    });

    it('returns "expiring" status when less than 7 days remaining', () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      const result = getTokenStatus(futureDate);
      expect(result.status).toBe('expiring');
      expect(result.daysUntilExpiry).toBeLessThanOrEqual(7);
    });

    it('returns "valid" status when more than 7 days remaining', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = getTokenStatus(futureDate);
      expect(result.status).toBe('valid');
      expect(result.daysUntilExpiry).toBeGreaterThan(7);
    });
  });

  describe('Minimal Variant', () => {
    it('renders just an icon', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="minimal" />);
      
      // Should render a small icon container
      const container = document.querySelector('.rounded');
      expect(container).toBeInTheDocument();
    });

    it('applies valid status styling', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { container } = render(<TokenExpiryBadge expiresAt={futureDate} variant="minimal" />);
      
      expect(container.innerHTML).toContain('emerald');
    });

    it('applies expired status styling', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { container } = render(<TokenExpiryBadge expiresAt={pastDate} variant="minimal" />);
      
      expect(container.innerHTML).toContain('red');
    });
  });

  describe('Compact Variant', () => {
    it('renders countdown text', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="compact" />);
      
      expect(screen.getByText(/\d+ days/)).toBeInTheDocument();
    });

    it('shows "Expired" for expired tokens', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={pastDate} variant="compact" />);
      
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('shows "No token" when no expiry', () => {
      render(<TokenExpiryBadge variant="compact" />);
      
      expect(screen.getByText('No token')).toBeInTheDocument();
    });

    it('shows hours when less than a day remaining', () => {
      const futureDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="compact" />);
      
      expect(screen.getByText(/\d+h/)).toBeInTheDocument();
    });
  });

  describe('Badge Variant', () => {
    it('renders status label and countdown', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="badge" />);
      
      expect(screen.getByText('Valid')).toBeInTheDocument();
      expect(screen.getByText(/\d+ days/)).toBeInTheDocument();
    });

    it('shows Expiring Soon for expiring tokens', () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="badge" />);
      
      expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
    });

    it('shows Expired for expired tokens', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={pastDate} variant="badge" />);
      
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('shows No Token when no expiry', () => {
      render(<TokenExpiryBadge variant="badge" />);
      
      expect(screen.getByText('No Token')).toBeInTheDocument();
    });
  });

  describe('Full Variant', () => {
    it('renders complete token status card', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="full" />);
      
      expect(screen.getByText('Token Status')).toBeInTheDocument();
      expect(screen.getByText('Valid')).toBeInTheDocument();
      expect(screen.getByText('Expires')).toBeInTheDocument();
      expect(screen.getByText('Time Remaining')).toBeInTheDocument();
    });

    it('shows token scopes when spoke is provided', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      render(
        <TokenExpiryBadge
          expiresAt={futureDate}
          variant="full"
          spoke={{ ...mockSpoke, tokenScopes: ['scope:one', 'scope:two'] }}
        />
      );
      
      expect(screen.getByText('Scopes')).toBeInTheDocument();
      expect(screen.getByText('scope:one')).toBeInTheDocument();
      expect(screen.getByText('scope:two')).toBeInTheDocument();
    });

    it('shows warning badge for expiring tokens', () => {
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      render(<TokenExpiryBadge expiresAt={futureDate} variant="full" />);
      
      expect(screen.getByText(/left/)).toBeInTheDocument();
    });

    it('shows message for no token', () => {
      render(<TokenExpiryBadge variant="full" />);
      
      expect(screen.getByText('No token has been issued for this spoke.')).toBeInTheDocument();
    });
  });

  describe('Icon Display', () => {
    it('hides icon when showIcon is false', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { container } = render(
        <TokenExpiryBadge expiresAt={futureDate} variant="badge" showIcon={false} />
      );
      
      // Check that lucide icon SVG is not rendered
      expect(container.querySelectorAll('svg').length).toBe(0);
    });

    it('shows icon by default', () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { container } = render(
        <TokenExpiryBadge expiresAt={futureDate} variant="badge" />
      );
      
      expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
    });
  });

  describe('Click Handler', () => {
    it('calls onClick when provided', () => {
      const handleClick = jest.fn();
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { container } = render(
        <TokenExpiryBadge expiresAt={futureDate} variant="badge" onClick={handleClick} />
      );
      
      const badge = container.firstChild as Element;
      badge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      
      expect(handleClick).toHaveBeenCalled();
    });

    it('applies cursor pointer when onClick is provided', () => {
      const handleClick = jest.fn();
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { container } = render(
        <TokenExpiryBadge expiresAt={futureDate} variant="badge" onClick={handleClick} />
      );
      
      expect(container.innerHTML).toContain('cursor-pointer');
    });
  });
});

describe('useExpiringTokens', () => {
  const createSpoke = (expiresAt?: string): ISpoke => ({
    spokeId: `spoke-${Math.random()}`,
    instanceCode: 'NZL',
    name: 'Test Spoke',
    status: 'active',
    baseUrl: 'https://test.dive25.com',
    apiUrl: 'https://api.test.dive25.com',
    idpUrl: 'https://idp.test.dive25.com',
    trustLevel: 'bilateral',
    allowedPolicyScopes: ['policy:base'],
    maxClassificationAllowed: 'SECRET',
    dataIsolationLevel: 'filtered',
    registeredAt: '2025-01-01T00:00:00Z',
    contactEmail: 'admin@test.gov',
    tokenExpiresAt: expiresAt,
  });

  it('counts expiring tokens', () => {
    const expiringDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const spokes = [
      createSpoke(expiringDate),
      createSpoke(validDate),
      createSpoke(expiringDate),
    ];

    const { result } = renderHook(() => useExpiringTokens(spokes));
    
    expect(result.current.expiringCount).toBe(2);
    expect(result.current.expiringSpokes).toHaveLength(2);
  });

  it('counts expired tokens', () => {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const spokes = [
      createSpoke(expiredDate),
      createSpoke(validDate),
    ];

    const { result } = renderHook(() => useExpiringTokens(spokes));
    
    expect(result.current.expiringCount).toBe(1);
    expect(result.current.expiringSpokes).toHaveLength(1);
  });

  it('returns 0 when no expiring tokens', () => {
    const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const spokes = [
      createSpoke(validDate),
      createSpoke(validDate),
    ];

    const { result } = renderHook(() => useExpiringTokens(spokes));
    
    expect(result.current.expiringCount).toBe(0);
    expect(result.current.expiringSpokes).toHaveLength(0);
  });

  it('handles empty spoke array', () => {
    const { result } = renderHook(() => useExpiringTokens([]));
    
    expect(result.current.expiringCount).toBe(0);
    expect(result.current.expiringSpokes).toHaveLength(0);
  });
});
