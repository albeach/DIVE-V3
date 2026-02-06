/**
 * Admin Shared Components
 * 
 * Central export for all shared admin UI components
 */

// Loading States
export {
  PageLoader,
  FullPageLoader,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonStats,
  Spinner,
  LoadingDots,
  LoadingButton,
  ProgressBar,
  TransitionOverlay,
  RefreshButton,
  LoadingWrapper,
} from './loading-states';

// Responsive Table
export { ResponsiveTable } from './responsive-table';
export type { Column, ResponsiveTableProps } from './responsive-table';

// Empty States
export {
  EmptyState,
  NoDataEmptyState,
  NoSearchResultsEmptyState,
  ErrorEmptyState,
  NoUsersEmptyState,
  NoLogsEmptyState,
  NoPoliciesEmptyState,
  NoIdPsEmptyState,
  NoSpokesEmptyState,
  NoServersEmptyState,
  FirstTimeSetupEmptyState,
  ComingSoonEmptyState,
} from './empty-states';

// Theme Utilities
export {
  AdminThemeProvider,
  useAdminTheme,
  ThemeToggle,
  ThemedCard,
  ThemedSection,
  tw,
  gradients,
} from './theme-utils';

// Session Management
export {
  SessionCountdown,
  SessionBar,
} from './session-countdown';

// Bulk Operations
export {
  BulkOperationsToolbar,
  commonBulkActions,
  useBulkSelection,
  type BulkAction,
  type BulkOperationResult,
} from './bulk-operations';

// Virtual Table
export {
  VirtualTable,
  type VirtualColumn,
} from './virtual-table';

// Pagination
export {
  Pagination,
  usePagination,
  useServerPagination,
  type PaginationProps,
  type PaginationState,
} from './pagination';

// Glass Components (Phase 3.2)
export {
  GlassCard,
  GlassHeader,
  GlassSection,
  GlassGrid,
  withGlassEffect,
  type GlassCardProps,
  type GlassHeaderProps,
  type GlassSectionProps,
  type GlassGridProps,
} from './GlassCard';

// Theme Tokens (Phase 3.2)
export {
  adminColors,
  adminStatusColors,
  adminEffects,
  adminAnimations,
  adminSpacing,
  adminTypography,
  adminBreakpoints,
  adminZIndex,
  getStatusColors,
  getAdminColor,
  generateAdminCSSVariables,
  useAdminTheme as useAdminThemeTokens,
  type EntityStatus,
} from './theme-tokens';

// Accordion Components (Phase 3.7)
export {
  AccordionWrapper,
  AccordionItem,
  AccordionControls,
  type AccordionWrapperProps,
  type AccordionItemProps,
  type AccordionControlsProps,
} from './AccordionWrapper';

// Page Transitions (Phase 3.4)
export {
  AdminPageTransition,
  AdminSectionTransition,
  useReducedMotion,
  type AdminPageTransitionProps,
} from './AdminPageTransition';

// Animated Buttons (Phase 3.4)
export {
  AnimatedButton,
  AnimatedIconButton,
  AnimatedLinkButton,
  AnimatedCardButton,
  type AnimatedButtonProps,
} from './AnimatedButton';
