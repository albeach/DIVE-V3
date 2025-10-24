/**
 * DIVE V3 Resources Page - 2025 UI/UX Revamp
 * Design System Documentation
 */

export const DIVE_DESIGN_TOKENS = {
    // Color Palette
    colors: {
        primary: {
            blue: '#2563EB',
            indigo: '#4F46E5',
            gradient: 'from-blue-600 to-indigo-600',
        },
        classification: {
            unclassified: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', emoji: '🟢' },
            confidential: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300', emoji: '🟡' },
            secret: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', emoji: '🟠' },
            top_secret: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', emoji: '🔴' },
        },
        metadata: {
            country: 'bg-blue-50 text-blue-700 border-blue-200',
            coi: 'bg-purple-50 text-purple-700 border-purple-200',
            encryption: 'from-purple-600 to-indigo-600',
        },
    },

    // Spacing
    spacing: {
        cardPadding: 'p-5',
        sectionGap: 'gap-6',
        itemGap: 'gap-4',
    },

    // Borders
    borders: {
        standard: 'border-2 border-gray-200',
        hover: 'hover:border-blue-400',
        rounded: 'rounded-xl',
    },

    // Shadows
    shadows: {
        card: 'shadow-sm',
        cardHover: 'hover:shadow-2xl',
        dropdown: 'shadow-2xl',
    },

    // Typography
    typography: {
        heroTitle: 'text-4xl font-black',
        cardTitle: 'text-lg font-bold',
        sectionTitle: 'text-sm font-bold uppercase tracking-wide',
        body: 'text-sm',
        metadata: 'text-xs',
    },

    // Animations
    animations: {
        cardHover: 'hover:-translate-y-1 transition-all duration-300',
        button: 'transition-colors duration-200',
        slideIn: 'animate-in slide-in-from-top duration-300',
    },
};

/**
 * Component Design Patterns
 */
export const DESIGN_PATTERNS = {
    // Card Component
    card: {
        base: 'bg-white border-2 border-gray-200 rounded-xl shadow-sm',
        hover: 'hover:shadow-2xl hover:border-blue-400 hover:-translate-y-1 transition-all duration-300',
        padding: 'p-5',
    },

    // Button Component
    button: {
        primary: 'bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm',
        secondary: 'bg-white text-gray-700 border-2 border-gray-200 rounded-xl font-semibold hover:border-blue-300 hover:text-blue-600 transition-all',
        icon: 'p-2.5 rounded-lg hover:bg-gray-100 transition-colors',
    },

    // Badge Component
    badge: {
        base: 'inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold',
        classification: 'px-3 py-1.5 rounded-lg border-2',
        metadata: 'px-2 py-0.5 rounded-md border',
    },

    // Input Component
    input: {
        base: 'block w-full px-3 py-2 border-2 border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all',
        search: 'block w-full pl-11 pr-12 py-3 border-2 border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all',
    },

    // Layout
    layout: {
        sidebar: 'lg:col-span-3',
        main: 'lg:col-span-9',
        grid: {
            default: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4',
            list: 'space-y-3',
            compact: 'space-y-2',
        },
    },

    // Loading States
    loading: {
        spinner: 'animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600',
        skeleton: 'animate-pulse bg-gray-200 rounded',
    },
};

/**
 * Accessibility Guidelines
 */
export const A11Y_GUIDELINES = {
    // Minimum touch target size (mobile)
    touchTarget: '44px',

    // Keyboard navigation
    keyboard: {
        focusRing: 'focus:ring-2 focus:ring-blue-500 focus:outline-none',
        activeState: 'active:scale-95',
    },

    // Color contrast
    contrast: {
        text: 'WCAG AA compliant (4.5:1 minimum)',
        interactive: 'WCAG AA compliant (4.5:1 minimum)',
    },

    // Screen reader support
    screenReader: {
        hideVisually: 'sr-only',
        showOnFocus: 'sr-only focus:not-sr-only',
    },
};

/**
 * Component Usage Examples
 */
export const USAGE_EXAMPLES = {
    card: `
    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-2xl hover:border-blue-400 hover:-translate-y-1 transition-all duration-300">
      <h3 className="text-lg font-bold text-gray-900 mb-3">Card Title</h3>
      <p className="text-sm text-gray-600">Card content...</p>
    </div>
  `,

    badge: `
    <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-200">
      Badge Text
    </span>
  `,

    button: `
    <button className="px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm">
      Button Text
    </button>
  `,
};

/**
 * Responsive Breakpoints
 */
export const BREAKPOINTS = {
    mobile: '< 640px',
    tablet: '640px - 1024px',
    desktop: '> 1024px',
    wide: '> 1536px',
};

/**
 * Performance Best Practices
 */
export const PERFORMANCE = {
    images: 'Use next/image with proper sizing and lazy loading',
    lists: 'Implement virtual scrolling for lists > 100 items',
    animations: 'Use CSS transforms (translate, scale) over position changes',
    localStorage: 'Debounce writes to localStorage (500ms recommended)',
    memoization: 'Use useMemo for expensive calculations, useCallback for stable function references',
};

/**
 * Component Checklist
 */
export const COMPONENT_CHECKLIST = [
    '✅ TypeScript interfaces defined',
    '✅ PropTypes or TypeScript types',
    '✅ Responsive design (mobile, tablet, desktop)',
    '✅ Loading states',
    '✅ Empty states',
    '✅ Error states',
    '✅ Keyboard navigation',
    '✅ Screen reader support',
    '✅ Focus management',
    '✅ Hover/active states',
    '✅ Animations are smooth (60fps)',
    '✅ No layout shift (CLS)',
    '✅ Accessible color contrast',
    '✅ Touch targets min 44px',
];

