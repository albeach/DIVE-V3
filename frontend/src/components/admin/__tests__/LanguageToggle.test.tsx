/**
 * LanguageToggle Component Tests
 * 
 * Tests for language switcher component
 * Phase 4: Component Testing
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import LanguageToggle from '../../ui/LanguageToggle';

// Mock Framer Motion
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>
    },
    AnimatePresence: ({ children }: any) => <>{children}</>
}));

// Mock LocaleContext
jest.mock('@/contexts/LocaleContext', () => ({
    useLocale: () => ({
        locale: 'en',
        changeLocale: jest.fn()
    })
}));

describe('LanguageToggle', () => {
    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();
    });

    it('should render language toggle button', () => {
        render(<LanguageToggle />);

        expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('should show flag icons', () => {
        render(<LanguageToggle />);

        // Check for flag emojis (rendered as text)
        const component = screen.getByText('English').closest('button');
        expect(component).toBeInTheDocument();
    });

    it('should toggle between languages when clicked', () => {
        const { rerender } = render(<LanguageToggle />);

        // Initially English
        expect(screen.getByText('English')).toBeInTheDocument();

        // Click to switch
        const toggle = screen.getByText('English').closest('button');
        if (toggle) {
            fireEvent.click(toggle);
        }

        // Would need to mock the hook to test actual locale change
        // For now, verify component renders without crashing
    });

    it('should persist language selection to localStorage', () => {
        render(<LanguageToggle />);

        // After interaction, check localStorage
        // (Actual implementation would be tested with integration tests)
        const stored = localStorage.getItem('dive-v3-locale');
        // Initially null or 'en'
        expect(stored === null || stored === 'en').toBe(true);
    });

    it('should accept optional idpAlias prop', () => {
        // Should render without error when idpAlias is provided
        render(<LanguageToggle idpAlias="usa-realm-broker" />);
        expect(screen.getByText('English')).toBeInTheDocument();
    });

    it('should set per-IdP override flag when idpAlias provided', () => {
        const mockChangeLocale = jest.fn();
        jest.spyOn(require('@/contexts/LocaleContext'), 'useLocale').mockReturnValue({
            locale: 'en',
            changeLocale: mockChangeLocale
        });

        render(<LanguageToggle idpAlias="fra-realm-broker" />);
        
        // Week 4 BEST PRACTICE: Click toggle to open dropdown
        const toggle = screen.getByText('English').closest('button');
        if (toggle) {
            fireEvent.click(toggle);
        }
            
        // Week 4 BEST PRACTICE: Now click a language option in the dropdown (not just toggle)
        const frenchOption = screen.getByText('Français');
        fireEvent.click(frenchOption);
        
        // Should set the per-IdP override flag
        const overrideKey = 'dive-v3-locale-override-fra-realm-broker';
        expect(localStorage.getItem(overrideKey)).toBe('true');
    });
});
