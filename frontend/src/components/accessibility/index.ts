/**
 * Accessibility Components Index
 * 
 * Centralized exports for accessibility components.
 * Phase 4: Visual Polish & Accessibility
 * 
 * Import from '@/components/accessibility' for cleaner imports.
 */

// Skip Links - WCAG 2.1 SC 2.4.1 (Bypass Blocks)
export { default as SkipLinks, useSkipLinkTarget } from './skip-links';

// Live Region - WCAG 2.1 SC 4.1.3 (Status Messages)
export {
    LiveRegionProvider,
    useLiveRegion,
    AnnounceOnMount,
    announcements,
} from './live-region';
