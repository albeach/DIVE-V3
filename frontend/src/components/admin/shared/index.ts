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

