/**
 * Resources Components Index
 * 
 * Centralized exports for all resource-related components.
 * Import from '@/components/resources' for cleaner imports.
 */

// ============================================
// Core Components
// ============================================

export { default as AdvancedResourceCard, ResourceCardSkeleton } from './advanced-resource-card';
export type { IResourceCardData, ViewMode } from './advanced-resource-card';

export { default as ResourceFilters } from './resource-filters';
export type { ResourceFiltersState } from './resource-filters';

export { default as AdvancedSearch } from './advanced-search';

export { default as CategoryBrowser } from './category-browser';

export { default as SavedFilters } from './saved-filters';

export { default as ViewModeSwitcher } from './view-mode-switcher';

export { default as Pagination } from './pagination';

export { default as ContentViewer } from './content-viewer';

// ============================================
// New 2025 Components (Phase 1 + Phase 2)
// ============================================

// Document Search Palette with Phase 2 enhancements:
// - "/" shortcut activation (industry standard: GitHub, Notion, Linear)
// - Server-side search with debouncing
// - Advanced search syntax (AND/OR/NOT/field:value)
// - Pinned/starred searches
// - Syntax help (type ? for help)
// NOTE: ⌘K is reserved for global CommandPalette in /navigation/
export {
  default as CommandPaletteSearch,
  DocumentSearchTrigger,
  CommandPaletteSearchTrigger // Legacy alias
} from './command-palette-search';

export { default as FacetedFilters, MobileFilterDrawer, FilterTriggerButton } from './faceted-filters';

export { default as ResourcePreviewModal, useResourcePreview } from './resource-preview-modal';

export {
  Skeleton,
  ShimmerSkeleton,
  ResourceCardSkeletonGrid,
  ResourceCardSkeletonList,
  ResourceCardSkeletonCompact,
  ResourceGridSkeleton,
  FilterPanelSkeleton,
  CategoryBrowserSkeleton,
  ToolbarSkeleton,
  PaginationSkeleton,
  ResourcesPageSkeleton,
  LoadingOverlay,
} from './skeleton-loading';

export { default as VirtualResourceList, ResourceGrid } from './virtual-resource-list';
export type { VirtualResourceListRef } from './virtual-resource-list';

// ============================================
// Specialized Components
// ============================================

export { default as FederatedResourceSearch } from './federated-search';

export { PolicyDecisionReplay } from './policy-decision-replay';

export { default as MultiKASBadge } from './multi-kas-badge';

// ============================================
// Phase 3: Power User Features (2025)
// ============================================

export { default as BulkActionsToolbar, SelectionIndicator } from './bulk-actions-toolbar';

export { default as ResourceComparisonView } from './resource-comparison-view';

export { default as DateRangePicker, DateRangeDisplay } from './date-range-picker';
export type { DateRange } from './date-range-picker';

export {
  default as BookmarksPanel,
  BookmarkButton,
  BookmarksTrigger
} from './bookmarks-panel';

export {
  default as ColumnCustomizer,
  ColumnCustomizerTrigger,
  useColumnCustomizer,
  DEFAULT_RESOURCE_COLUMNS,
  DEFAULT_COLUMN_PRESETS,
  type ColumnConfig,
  type ColumnPreset,
  type ColumnCustomizerState,
} from './column-customizer';

// ============================================
// Phase 4: Visual Polish & Accessibility (2025)
// ============================================

// Bento Grid Dashboard - Striking visual header with stats
export {
  default as BentoDashboard,
  BentoDashboardSkeleton
} from './bento-dashboard';

// Animated Resource Card - Micro-interactions with Framer Motion
export {
  default as AnimatedResourceCard,
  AnimatedResourceGrid
} from './animated-card';

// Empty & Error States - Beautiful illustrations
export {
  EmptySearchResults,
  EmptyFilterResults,
  ErrorState,
  AccessDeniedState,
  NetworkErrorState,
  EmptyBookmarks,
  FederationUnavailable,
} from './empty-states';

// Mobile Resource Drawer - Mobile-first bottom sheet
export {
  default as MobileResourceDrawer,
  useSwipeToOpen
} from './mobile-resource-drawer';

