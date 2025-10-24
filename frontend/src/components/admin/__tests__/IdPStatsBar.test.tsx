/**
 * IdPStatsBar Component Tests
 * 
 * Tests for animated statistics bar
 * Phase 2: Component Testing
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import IdPStatsBar, { IdPStats } from '../IdPStatsBar';

// Mock Framer Motion
jest.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
        button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
        span: ({ children, ...props }: any) => <span {...props}>{children}</span>
    }
}));

describe('IdPStatsBar', () => {
    const mockStats: IdPStats = {
        total: 10,
        online: 8,
        offline: 1,
        warning: 1
    };

    it('should render all stat cards', () => {
        render(<IdPStatsBar stats={mockStats} />);

        expect(screen.getByText('Total IdPs')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(screen.getByText('Warning')).toBeInTheDocument();
    });

    it('should display correct values', async () => {
        render(<IdPStatsBar stats={mockStats} />);

        // Wait for animated counters to complete
        await waitFor(() => {
            expect(screen.getByText('10')).toBeInTheDocument();
            expect(screen.getByText('8')).toBeInTheDocument();
            expect(screen.getByText('1')).toBeInTheDocument();
        }, { timeout: 2000 });
    });

    it('should call onFilterClick when card is clicked', () => {
        const handleFilterClick = jest.fn();
        render(<IdPStatsBar stats={mockStats} onFilterClick={handleFilterClick} />);

        const totalCard = screen.getByText('Total IdPs').closest('button');
        if (totalCard) {
            fireEvent.click(totalCard);
            expect(handleFilterClick).toHaveBeenCalledWith('all');
        }

        const onlineCard = screen.getByText('Online').closest('button');
        if (onlineCard) {
            fireEvent.click(onlineCard);
            expect(handleFilterClick).toHaveBeenCalledWith('online');
        }
    });

    it('should highlight active filter', () => {
        render(<IdPStatsBar stats={mockStats} activeFilter="online" />);

        const onlineCard = screen.getByText('Online').closest('button');
        expect(onlineCard?.className).toContain('border-purple-500');
    });

    it('should handle zero values', () => {
        const emptyStats: IdPStats = {
            total: 0,
            online: 0,
            offline: 0,
            warning: 0
        };

        render(<IdPStatsBar stats={emptyStats} />);

        expect(screen.getByText('Total IdPs')).toBeInTheDocument();
    });
});

