/**
 * Dashboard Components Index
 *
 * Export all dashboard-related components for easy importing.
 */

// Main dashboard component
export { DashboardModern } from './dashboard-modern';
export type { default as DashboardModernDefault } from './dashboard-modern';

// Tab components
export { DashboardTabs, TABS } from './dashboard-tabs';
export type { DashboardTab } from './dashboard-tabs';

// Tab view components
export { DashboardOverview } from './dashboard-overview';
export { DashboardFederation } from './dashboard-federation';
export { DashboardAuthorization } from './dashboard-authorization';
export { DashboardResources } from './dashboard-resources';
export { DashboardActivity } from './dashboard-activity';

// Feature components
export { FeatureShowcaseCard } from './feature-showcase-card';
export type { FeatureCardProps } from './feature-showcase-card';

// Educational components
export {
  EducationalTooltip,
  GlossaryPopover,
  GLOSSARY
} from './educational-tooltip';

export {
  FeatureExplainer,
  AuthorizationFlowExplainer,
  FederationFlowExplainer,
  EncryptionFlowExplainer,
} from './feature-explainer';

// Notification components
export {
  NotificationCenter,
  NotificationToasts
} from './dashboard-notifications';
