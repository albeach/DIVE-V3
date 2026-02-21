/**
 * Admin Theme Tokens - Design system tokens for admin interface
 *
 * Single source of truth for colors, effects, animations, and spacing
 *
 * @version 2.0.0
 * @date 2026-01-29
 */

// ============================================
// COLORS
// ============================================

export const adminColors = {
  // Primary (Indigo - admin distinction from user blue)
  primary: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1', // Main
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },

  // Success (Emerald)
  success: {
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981', // Main
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
  },

  // Warning (Amber)
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b', // Main
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
  },

  // Error (Red)
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444', // Main
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
  },

  // Info (Sky)
  info: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9', // Main
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },

  // Neutral (Gray/Slate)
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
};

// ============================================
// STATUS COLOR MAPS
// ============================================

export type EntityStatus = 'active' | 'pending' | 'suspended' | 'disabled' | 'testing' | 'error' | 'online' | 'offline';

export const adminStatusColors: Record<EntityStatus, {
  bg: string;
  bgSubtle: string;
  text: string;
  border: string;
  borderLeft: string;
  dot: string;
  ring: string;
}> = {
  active: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    bgSubtle: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-300 dark:border-emerald-700',
    borderLeft: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500/20',
  },
  online: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    bgSubtle: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-300 dark:border-emerald-700',
    borderLeft: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500/20',
  },
  pending: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    bgSubtle: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-300 dark:border-amber-700',
    borderLeft: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/20',
  },
  suspended: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    bgSubtle: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-300 dark:border-red-700',
    borderLeft: 'border-l-4 border-l-red-500 dark:border-l-red-400',
    dot: 'bg-red-500',
    ring: 'ring-red-500/20',
  },
  disabled: {
    bg: 'bg-gray-100 dark:bg-gray-800/50',
    bgSubtle: 'bg-gray-50 dark:bg-gray-900/30',
    text: 'text-gray-500 dark:text-gray-500',
    border: 'border-gray-300 dark:border-gray-700',
    borderLeft: 'border-l-4 border-l-gray-400 dark:border-l-gray-600',
    dot: 'bg-gray-400',
    ring: 'ring-gray-400/20',
  },
  offline: {
    bg: 'bg-gray-100 dark:bg-gray-800/50',
    bgSubtle: 'bg-gray-50 dark:bg-gray-900/30',
    text: 'text-gray-500 dark:text-gray-500',
    border: 'border-gray-300 dark:border-gray-700',
    borderLeft: 'border-l-4 border-l-gray-400 dark:border-l-gray-600',
    dot: 'bg-gray-400',
    ring: 'ring-gray-400/20',
  },
  testing: {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    bgSubtle: 'bg-sky-50 dark:bg-sky-950/20',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-300 dark:border-sky-700',
    borderLeft: 'border-l-4 border-l-sky-500 dark:border-l-sky-400',
    dot: 'bg-sky-500',
    ring: 'ring-sky-500/20',
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-900/30',
    bgSubtle: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-300 dark:border-red-700',
    borderLeft: 'border-l-4 border-l-red-600 dark:border-l-red-500',
    dot: 'bg-red-600',
    ring: 'ring-red-600/20',
  },
};

/**
 * Get status color classes for a given entity status
 */
export function getStatusColors(status: EntityStatus) {
  return adminStatusColors[status] || adminStatusColors.disabled;
}

// ============================================
// EFFECTS (Glassmorphism, Shadows, etc.)
// ============================================

export const adminEffects = {
  // Glassmorphism patterns - Phase 3.2 Enhancement
  glass: {
    light: 'bg-white/70 backdrop-blur-xl border border-white/20 shadow-lg',
    dark: 'dark:bg-slate-900/70 dark:backdrop-blur-xl dark:border-slate-700/20 dark:shadow-2xl',
    combined: 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/20 dark:border-slate-700/20 shadow-lg dark:shadow-2xl',
    
    // Enhanced glassmorphism presets - Phase 3.2
    card: 'bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700',
    cardLight: 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-xl shadow-lg border border-gray-200 dark:border-gray-700',
    cardHeavy: 'bg-white/95 dark:bg-gray-800/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700',
    panel: 'bg-white/85 dark:bg-gray-800/85 backdrop-blur-xl rounded-xl shadow-lg border border-gray-200 dark:border-gray-700',
    modal: 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700',
    header: 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700',
  },

  // Depth hierarchy - Phase 3.2 Enhancement
  depth: {
    base: 'relative z-0',
    elevated: 'relative z-10 shadow-lg',
    floating: 'relative z-20 shadow-xl',
    overlay: 'relative z-30 shadow-2xl',
    modal: 'relative z-40',
    top: 'relative z-50',
  },

  // 3D hover effects - Phase 3.2 Enhancement
  hover3d: {
    lift: 'hover:scale-[1.02] hover:-translate-y-1 hover:shadow-2xl transition-all duration-300 ease-out',
    liftSmall: 'hover:scale-[1.01] hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 ease-out',
    liftLarge: 'hover:scale-[1.03] hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 ease-out',
    tilt: 'hover:rotate-1 hover:scale-[1.02] transition-all duration-300 ease-out',
    glow: 'hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] dark:hover:shadow-[0_0_30px_rgba(129,140,248,0.4)] transition-all duration-300',
    press: 'active:scale-95 transition-transform duration-100',
  },

  // Gradient patterns
  gradient: {
    primary: 'bg-gradient-to-br from-indigo-500 to-purple-600',
    success: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    warning: 'bg-gradient-to-br from-amber-500 to-orange-600',
    error: 'bg-gradient-to-br from-red-500 to-pink-600',
    info: 'bg-gradient-to-br from-sky-500 to-blue-600',
    ambient: 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800',
    shimmer: 'bg-gradient-to-r from-transparent via-white/10 to-transparent',
  },

  // Border styles
  border: {
    default: 'border border-gray-200 dark:border-slate-700',
    light: 'border border-white/20 dark:border-slate-700/20',
    strong: 'border-2 border-gray-300 dark:border-slate-600',
    accent: 'border-l-4 border-l-indigo-500 dark:border-l-indigo-400',
  },

  // Shadow levels
  shadow: {
    sm: 'shadow-sm hover:shadow-md transition-shadow',
    md: 'shadow-md hover:shadow-lg transition-shadow',
    lg: 'shadow-lg hover:shadow-xl transition-shadow',
    xl: 'shadow-xl hover:shadow-2xl transition-shadow',
    inner: 'shadow-inner',
  },

  // Focus rings
  ring: {
    focus: 'focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
    error: 'focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
    success: 'focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
  },
};

// ============================================
// ANIMATIONS (Framer Motion)
// ============================================

export const adminAnimations = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  },

  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },

  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },

  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },

  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },

  scale: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },

  scaleHover: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { duration: 0.2 },
  },

  pulse: {
    animate: {
      scale: [1, 1.05, 1],
      opacity: [1, 0.8, 1],
    },
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },

  bounce: {
    animate: { y: [0, -10, 0] },
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

// ============================================
// SPACING
// ============================================

export const adminSpacing = {
  card: {
    sm: 'p-3',
    md: 'p-4 md:p-6',
    lg: 'p-6 md:p-8',
  },

  section: {
    sm: 'py-4',
    md: 'py-6 md:py-8',
    lg: 'py-8 md:py-12',
  },

  gap: {
    xs: 'gap-1',
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
    xl: 'gap-8',
  },
};

// ============================================
// TYPOGRAPHY
// ============================================

export const adminTypography = {
  heading: {
    h1: 'text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100',
    h2: 'text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100',
    h3: 'text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-100',
    h4: 'text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100',
    h5: 'text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100',
  },

  body: {
    default: 'text-sm md:text-base text-gray-700 dark:text-gray-300',
    sm: 'text-xs md:text-sm text-gray-600 dark:text-gray-400',
    lg: 'text-base md:text-lg text-gray-700 dark:text-gray-300',
  },

  label: {
    default: 'text-sm font-medium text-gray-700 dark:text-gray-300',
    required: 'text-sm font-medium text-gray-700 dark:text-gray-300 after:content-["*"] after:ml-0.5 after:text-red-500',
  },

  hint: {
    default: 'text-xs text-gray-500 dark:text-gray-400',
    error: 'text-xs text-red-600 dark:text-red-400',
  },
};

// ============================================
// BREAKPOINTS
// ============================================

export const adminBreakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// ============================================
// Z-INDEX LAYERS
// ============================================

export const adminZIndex = {
  dropdown: 50,
  sticky: 100,
  sidebar: 200,
  modal: 1000,
  modalBackdrop: 999,
  toast: 2000,
  tooltip: 3000,
  commandPalette: 4000,
};

// ============================================
// HELPER UTILITIES
// ============================================

/**
 * Get color from theme
 */
export function getAdminColor(color: keyof typeof adminColors, shade: number = 500): string {
  return adminColors[color]?.[shade as keyof typeof adminColors[typeof color]] || adminColors.neutral[500];
}

/**
 * Generate CSS variables for admin theme
 */
export function generateAdminCSSVariables(): Record<string, string> {
  return {
    '--admin-primary': adminColors.primary[500],
    '--admin-success': adminColors.success[500],
    '--admin-warning': adminColors.warning[500],
    '--admin-error': adminColors.error[500],
    '--admin-info': adminColors.info[500],
    '--admin-neutral': adminColors.neutral[500],
  };
}

/**
 * Admin theme hook for use in components
 */
export function useAdminTheme() {
  return {
    colors: adminColors,
    effects: adminEffects,
    animations: adminAnimations,
    spacing: adminSpacing,
    typography: adminTypography,
    breakpoints: adminBreakpoints,
    zIndex: adminZIndex,
  };
}
