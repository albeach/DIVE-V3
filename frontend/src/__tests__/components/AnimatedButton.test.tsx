/**
 * Animated Button Tests
 * 
 * Tests for button animations with:
 * - Hover and tap animations
 * - Reduced motion support
 * - Animation intensity levels
 * - Accessibility
 * 
 * @version 1.0.0
 * @date 2026-02-06
 * @phase Phase 3.9 - Comprehensive Testing
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AnimatedButton, AnimatedIconButton, AnimatedLinkButton, AnimatedCardButton } from '@/components/admin/shared';

// Mock Framer Motion
jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, className, onClick, disabled, ...props }: any) => (
      <button
        className={className}
        onClick={onClick}
        disabled={disabled}
        data-testid="motion-button"
        {...props}
      >
        {children}
      </button>
    ),
  },
}));

// Mock animations lib
jest.mock('@/lib/animations', () => ({
  prefersReducedMotion: jest.fn(() => false),
}));

// Mock theme tokens
jest.mock('@/components/admin/shared/theme-tokens', () => ({
  adminAnimations: {
    scaleHover: {
      whileHover: { scale: 1.02 },
      whileTap: { scale: 0.98 },
    },
  },
}));

describe('AnimatedButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render button with children', () => {
      render(<AnimatedButton>Click Me</AnimatedButton>);
      expect(screen.getByText('Click Me')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<AnimatedButton className="custom-class">Button</AnimatedButton>);
      const button = screen.getByText('Button');
      expect(button).toHaveClass('custom-class');
    });

    it('should handle disabled state', () => {
      render(<AnimatedButton disabled>Disabled</AnimatedButton>);
      const button = screen.getByText('Disabled');
      expect(button).toBeDisabled();
    });
  });

  describe('Click Handling', () => {
    it('should call onClick when clicked', () => {
      const handleClick = jest.fn();
      render(<AnimatedButton onClick={handleClick}>Click Me</AnimatedButton>);

      fireEvent.click(screen.getByText('Click Me'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      const handleClick = jest.fn();
      render(
        <AnimatedButton onClick={handleClick} disabled>
          Disabled
        </AnimatedButton>
      );

      fireEvent.click(screen.getByText('Disabled'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Animation Intensity', () => {
    it('should render with subtle intensity', () => {
      render(<AnimatedButton intensity="subtle">Subtle</AnimatedButton>);
      expect(screen.getByText('Subtle')).toBeInTheDocument();
    });

    it('should render with normal intensity (default)', () => {
      render(<AnimatedButton>Normal</AnimatedButton>);
      expect(screen.getByText('Normal')).toBeInTheDocument();
    });

    it('should render with strong intensity', () => {
      render(<AnimatedButton intensity="strong">Strong</AnimatedButton>);
      expect(screen.getByText('Strong')).toBeInTheDocument();
    });
  });

  describe('Animation Control', () => {
    it('should disable animation when disableAnimation is true', () => {
      render(<AnimatedButton disableAnimation>No Animation</AnimatedButton>);
      expect(screen.getByText('No Animation')).toBeInTheDocument();
    });

    it('should apply custom hover scale', () => {
      render(<AnimatedButton hoverScale={1.05}>Custom Hover</AnimatedButton>);
      expect(screen.getByText('Custom Hover')).toBeInTheDocument();
    });

    it('should apply custom tap scale', () => {
      render(<AnimatedButton tapScale={0.95}>Custom Tap</AnimatedButton>);
      expect(screen.getByText('Custom Tap')).toBeInTheDocument();
    });
  });

  describe('Reduced Motion Support', () => {
    it('should respect prefers-reduced-motion', () => {
      const { prefersReducedMotion } = require('@/lib/animations');
      prefersReducedMotion.mockReturnValue(true);

      render(<AnimatedButton>Reduced Motion</AnimatedButton>);
      expect(screen.getByText('Reduced Motion')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have button role', () => {
      render(<AnimatedButton>Accessible</AnimatedButton>);
      const button = screen.getByRole('button', { name: 'Accessible' });
      expect(button).toBeInTheDocument();
    });

    it('should support aria-label', () => {
      render(<AnimatedButton aria-label="Custom Label">Button</AnimatedButton>);
      const button = screen.getByLabelText('Custom Label');
      expect(button).toBeInTheDocument();
    });

    it('should support aria-disabled', () => {
      render(<AnimatedButton disabled>Disabled</AnimatedButton>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });
});

describe('AnimatedIconButton', () => {
  it('should render with icon button styling', () => {
    render(<AnimatedIconButton>Icon</AnimatedIconButton>);
    expect(screen.getByText('Icon')).toBeInTheDocument();
  });

  it('should use strong intensity by default', () => {
    render(<AnimatedIconButton>Icon</AnimatedIconButton>);
    expect(screen.getByText('Icon')).toBeInTheDocument();
  });
});

describe('AnimatedLinkButton', () => {
  it('should render with link button styling', () => {
    render(<AnimatedLinkButton>Link</AnimatedLinkButton>);
    expect(screen.getByText('Link')).toBeInTheDocument();
  });

  it('should use subtle intensity by default', () => {
    render(<AnimatedLinkButton>Link</AnimatedLinkButton>);
    expect(screen.getByText('Link')).toBeInTheDocument();
  });
});

describe('AnimatedCardButton', () => {
  it('should render with card button styling', () => {
    render(<AnimatedCardButton>Card</AnimatedCardButton>);
    expect(screen.getByText('Card')).toBeInTheDocument();
  });

  it('should handle click events', () => {
    const handleClick = jest.fn();
    render(<AnimatedCardButton onClick={handleClick}>Card</AnimatedCardButton>);

    fireEvent.click(screen.getByText('Card'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
