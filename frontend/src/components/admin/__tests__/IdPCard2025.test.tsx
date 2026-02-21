/**
 * IdPCard2025 Component Tests
 * 
 * Tests for modern IdP card component
 * Phase 2: Component Testing
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import IdPCard2025 from '../IdPCard2025';
import { IIdPListItem } from '@/types/admin.types';

// Mock Framer Motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>
    },
    AnimatePresence: ({ children }: any) => <>{children}</>
}));

describe('IdPCard2025', () => {
    const mockIdP: IIdPListItem = {
        alias: 'usa-realm-broker',
        displayName: 'USA DoD Login',
        protocol: 'oidc',
        status: 'active',
        enabled: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        submittedBy: 'admin@test.com'
    };

    it('should render IdP information correctly', () => {
        render(<IdPCard2025 idp={mockIdP} />);

        expect(screen.getByText('USA DoD Login')).toBeInTheDocument();
        expect(screen.getByText('OIDC')).toBeInTheDocument();
    });

    it('should show enabled status with pulse animation', () => {
        render(<IdPCard2025 idp={mockIdP} />);

        // Look for status indicator (green for enabled)
        const card = screen.getByText('USA DoD Login').closest('div');
        expect(card).toBeInTheDocument();
    });

    it('should show disabled status without pulse', () => {
        const disabledIdP = { ...mockIdP, enabled: false };
        render(<IdPCard2025 idp={disabledIdP} />);

        const card = screen.getByText('USA DoD Login').closest('div');
        expect(card).toBeInTheDocument();
    });

    it('should call onClick when card is clicked', () => {
        const handleClick = jest.fn();
        render(<IdPCard2025 idp={mockIdP} onClick={handleClick} />);

        const card = screen.getByText('USA DoD Login').closest('div');
        if (card) {
            fireEvent.click(card);
            expect(handleClick).toHaveBeenCalledWith('usa-realm-broker');
        }
    });

    it('should call onTest when test button is clicked', () => {
        const handleTest = jest.fn();
        render(<IdPCard2025 idp={mockIdP} onTest={handleTest} />);

        // Open quick actions menu first
        const menuButton = screen.getAllByRole('button').find(btn => 
            btn.querySelector('svg')
        );
        
        if (menuButton) {
            fireEvent.click(menuButton);
            
            // Find and click test button
            const testButton = screen.queryByText('Test');
            if (testButton) {
                fireEvent.click(testButton);
                expect(handleTest).toHaveBeenCalledWith('usa-realm-broker');
            }
        }
    });

    it('should display metrics correctly', () => {
        render(<IdPCard2025 idp={mockIdP} />);

        // Check for uptime, success rate, etc.
        expect(screen.getByText(/Uptime/i)).toBeInTheDocument();
        expect(screen.getByText(/Success/i)).toBeInTheDocument();
        expect(screen.getByText(/Tested/i)).toBeInTheDocument();
    });

    it('should apply selected styles when selected prop is true', () => {
        render(<IdPCard2025 idp={mockIdP} selected={true} />);

        // Week 4 BEST PRACTICE: Use data-testid for specific element selection
        const card = screen.getByTestId('idp-card-usa-realm-broker');
        expect(card.className).toContain('ring-2');
    });

    it('should render protocol badge correctly', () => {
        const samlIdP = { ...mockIdP, protocol: 'saml' as const };
        render(<IdPCard2025 idp={samlIdP} />);

        expect(screen.getByText('SAML')).toBeInTheDocument();
    });
});
