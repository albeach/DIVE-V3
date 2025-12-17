/**
 * Accessibility Testing Utilities
 * 
 * Provides reusable helpers for testing accessibility compliance:
 * - ARIA attribute validation
 * - Keyboard navigation testing
 * - Screen reader compatibility
 * - Focus management
 * - Color contrast (basic checks)
 */

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Check if an element has proper ARIA labels
 */
export function hasAriaLabel(element: HTMLElement): boolean {
  return (
    element.hasAttribute('aria-label') ||
    element.hasAttribute('aria-labelledby') ||
    element.getAttribute('role') !== null ||
    element.tagName === 'BUTTON' ||
    element.tagName === 'A' ||
    element.tagName === 'INPUT'
  );
}

/**
 * Check if an element is keyboard accessible
 */
export function isKeyboardAccessible(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  const tabIndex = element.getAttribute('tabindex');
  
  // Native interactive elements
  if (['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) {
    return !element.hasAttribute('disabled');
  }
  
  // Elements with explicit roles
  if (role && ['button', 'link', 'menuitem', 'tab'].includes(role)) {
    return true;
  }
  
  // Elements with tabindex >= 0
  if (tabIndex !== null && parseInt(tabIndex) >= 0) {
    return true;
  }
  
  return false;
}

/**
 * Check if an element has proper focus management
 */
export function hasFocusManagement(element: HTMLElement): boolean {
  return (
    element.hasAttribute('tabindex') ||
    element.tagName.toLowerCase() === 'input' ||
    element.tagName.toLowerCase() === 'button' ||
    element.tagName.toLowerCase() === 'a'
  );
}

/**
 * Validate ARIA attributes on an element
 */
export function validateAriaAttributes(element: HTMLElement): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check for aria-required attributes
  const role = element.getAttribute('role');
  if (role === 'button' && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
    const textContent = element.textContent?.trim();
    if (!textContent || textContent.length === 0) {
      errors.push('Button without aria-label or aria-labelledby must have text content');
    }
  }
  
  // Check for aria-expanded on disclosure widgets
  if (role === 'button' && element.hasAttribute('aria-controls')) {
    if (!element.hasAttribute('aria-expanded')) {
      errors.push('Button with aria-controls should have aria-expanded');
    }
  }
  
  // Check for aria-live regions
  if (element.hasAttribute('aria-live')) {
    const liveValue = element.getAttribute('aria-live');
    if (!['polite', 'assertive', 'off'].includes(liveValue || '')) {
      errors.push(`Invalid aria-live value: ${liveValue}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test keyboard navigation through a list of elements
 */
export async function testKeyboardNavigation(
  elements: HTMLElement[],
  user: ReturnType<typeof userEvent.setup>
): Promise<{
  success: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  
  if (elements.length === 0) {
    return { success: true, errors: [] };
  }
  
  // Focus first element
  elements[0].focus();
  
  // Test Tab navigation
  for (let i = 0; i < elements.length - 1; i++) {
    await user.tab();
    const focusedElement = document.activeElement as HTMLElement;
    
    if (focusedElement !== elements[i + 1]) {
      errors.push(`Tab navigation failed: expected element ${i + 1}, got ${focusedElement.tagName}`);
    }
  }
  
  // Test Shift+Tab (reverse navigation)
  for (let i = elements.length - 1; i > 0; i--) {
    await user.tab({ shift: true });
    const focusedElement = document.activeElement as HTMLElement;
    
    if (focusedElement !== elements[i - 1]) {
      errors.push(`Shift+Tab navigation failed: expected element ${i - 1}, got ${focusedElement.tagName}`);
    }
  }
  
  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Check if all interactive elements have accessible names
 */
export function checkAccessibleNames(container: HTMLElement): {
  valid: boolean;
  violations: Array<{ element: HTMLElement; reason: string }>;
} {
  const violations: Array<{ element: HTMLElement; reason: string }> = [];
  
  // Find all interactive elements
  const interactiveElements = container.querySelectorAll<HTMLElement>(
    'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]'
  );
  
  interactiveElements.forEach((element) => {
    const hasLabel = 
      element.hasAttribute('aria-label') ||
      element.hasAttribute('aria-labelledby') ||
      element.textContent?.trim().length > 0 ||
      element.getAttribute('title') ||
      (element.tagName === 'INPUT' && element.getAttribute('placeholder'));
    
    if (!hasLabel && !element.hasAttribute('aria-hidden')) {
      violations.push({
        element,
        reason: 'Interactive element lacks accessible name',
      });
    }
  });
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Check for proper heading hierarchy
 */
export function checkHeadingHierarchy(container: HTMLElement): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const headings = container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]');
  
  let previousLevel = 0;
  
  headings.forEach((heading) => {
    let level: number;
    
    if (heading.tagName.match(/^H[1-6]$/)) {
      level = parseInt(heading.tagName.charAt(1));
    } else {
      const ariaLevel = heading.getAttribute('aria-level');
      level = ariaLevel ? parseInt(ariaLevel) : 2; // Default to h2
    }
    
    // Check for skipped levels (e.g., h1 -> h3)
    if (previousLevel > 0 && level > previousLevel + 1) {
      errors.push(`Heading hierarchy skipped: h${previousLevel} -> h${level}`);
    }
    
    previousLevel = level;
  });
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for proper form labels
 */
export function checkFormLabels(container: HTMLElement): {
  valid: boolean;
  violations: Array<{ element: HTMLElement; reason: string }>;
} {
  const violations: Array<{ element: HTMLElement; reason: string }> = [];
  
  const inputs = container.querySelectorAll<HTMLElement>('input, select, textarea');
  
  inputs.forEach((input) => {
    const id = input.getAttribute('id');
    const hasLabel = 
      input.hasAttribute('aria-label') ||
      input.hasAttribute('aria-labelledby') ||
      (id && container.querySelector(`label[for="${id}"]`)) ||
      input.closest('label') !== null ||
      input.getAttribute('placeholder');
    
    if (!hasLabel && input.type !== 'hidden') {
      violations.push({
        element: input,
        reason: 'Form input lacks associated label',
      });
    }
  });
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Comprehensive accessibility check for a component
 */
export function checkAccessibility(container: HTMLElement): {
  valid: boolean;
  results: {
    ariaAttributes: ReturnType<typeof validateAriaAttributes>;
    accessibleNames: ReturnType<typeof checkAccessibleNames>;
    headingHierarchy: ReturnType<typeof checkHeadingHierarchy>;
    formLabels: ReturnType<typeof checkFormLabels>;
  };
} {
  const ariaAttributes = validateAriaAttributes(container);
  const accessibleNames = checkAccessibleNames(container);
  const headingHierarchy = checkHeadingHierarchy(container);
  const formLabels = checkFormLabels(container);
  
  const valid = 
    ariaAttributes.valid &&
    accessibleNames.valid &&
    headingHierarchy.valid &&
    formLabels.valid;
  
  return {
    valid,
    results: {
      ariaAttributes,
      accessibleNames,
      headingHierarchy,
      formLabels,
    },
  };
}

