"use client";

/**
 * DIVE V3 - PolicyGate Component
 * 
 * Declarative authorization component that shows/hides children
 * based on policy decisions.
 * 
 * Phase 5: DIVE-V3 Enforcement Harmonization
 * 
 * Features:
 * - Declarative authorization in JSX
 * - Loading states with customizable spinner
 * - Fallback content for denied access
 * - Integration with PolicyContext
 * - Debug mode for development
 * 
 * @example
 * ```tsx
 * <PolicyGate 
 *   resourceId="doc-123" 
 *   action="view"
 *   fallback={<AccessDenied />}
 * >
 *   <ClassifiedDocument />
 * </PolicyGate>
 * ```
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import React, { ReactNode } from 'react';
import { usePolicyDecision, IPolicyDecision } from '@/contexts/PolicyContext';

// ============================================
// TYPES
// ============================================

export interface PolicyGateProps {
  /** Resource ID to check access for */
  resourceId: string;
  /** Action to check (default: 'view') */
  action?: 'view' | 'edit' | 'delete' | 'upload';
  /** Content to show when access is granted */
  children: ReactNode;
  /** Content to show when access is denied */
  fallback?: ReactNode;
  /** Content to show while loading */
  loadingFallback?: ReactNode;
  /** Content to show on error */
  errorFallback?: ReactNode | ((error: Error) => ReactNode);
  /** Callback when access is granted */
  onAccessGranted?: (decision: IPolicyDecision) => void;
  /** Callback when access is denied */
  onAccessDenied?: (decision: IPolicyDecision) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Show debug information (development only) */
  debug?: boolean;
  /** Disable the policy check (always show children) */
  disabled?: boolean;
  /** Additional className for wrapper */
  className?: string;
}

// ============================================
// DEFAULT COMPONENTS
// ============================================

function DefaultLoader() {
  return (
    <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
    </div>
  );
}

function DefaultAccessDenied({ reason }: { reason?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
      <svg 
        className="w-12 h-12 text-red-500 mb-3" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
        />
      </svg>
      <h3 className="text-lg font-semibold text-red-700 dark:text-red-300 mb-1">
        Access Denied
      </h3>
      {reason && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-sm">
          {reason}
        </p>
      )}
    </div>
  );
}

function DefaultError({ error }: { error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
      <svg 
        className="w-12 h-12 text-yellow-500 mb-3" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
        />
      </svg>
      <h3 className="text-lg font-semibold text-yellow-700 dark:text-yellow-300 mb-1">
        Policy Check Error
      </h3>
      <p className="text-sm text-yellow-600 dark:text-yellow-400 text-center max-w-sm">
        {error.message}
      </p>
    </div>
  );
}

function DebugPanel({ 
  resourceId, 
  action, 
  decision, 
  isLoading, 
  error,
  cached 
}: {
  resourceId: string;
  action: string;
  decision: IPolicyDecision | null;
  isLoading: boolean;
  error: Error | null;
  cached: boolean;
}) {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-mono">
      <div className="text-slate-500 dark:text-slate-400 mb-2 font-semibold">
        🔐 PolicyGate Debug
      </div>
      <div className="space-y-1 text-slate-600 dark:text-slate-300">
        <div>
          <span className="text-slate-400">Resource:</span> {resourceId}
        </div>
        <div>
          <span className="text-slate-400">Action:</span> {action}
        </div>
        <div>
          <span className="text-slate-400">Status:</span>{' '}
          {isLoading ? (
            <span className="text-blue-500">Loading...</span>
          ) : error ? (
            <span className="text-red-500">Error</span>
          ) : decision?.allow ? (
            <span className="text-green-500">Allowed</span>
          ) : (
            <span className="text-red-500">Denied</span>
          )}
          {cached && <span className="ml-1 text-purple-500">(cached)</span>}
        </div>
        {decision && (
          <>
            <div>
              <span className="text-slate-400">Reason:</span> {decision.reason}
            </div>
            {decision.evaluationDetails && (
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-300">
                  Evaluation Details
                </summary>
                <pre className="mt-1 p-2 bg-slate-900 rounded text-green-400 overflow-x-auto">
                  {JSON.stringify(decision.evaluationDetails, null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
        {error && (
          <div className="text-red-400">
            <span className="text-slate-400">Error:</span> {error.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function PolicyGate({
  resourceId,
  action = 'view',
  children,
  fallback,
  loadingFallback,
  errorFallback,
  onAccessGranted,
  onAccessDenied,
  onError,
  debug = false,
  disabled = false,
  className,
}: PolicyGateProps) {
  // If disabled, just render children
  if (disabled) {
    return <>{children}</>;
  }

  const {
    canAccess,
    decision,
    isLoading,
    error,
    reason,
    cached,
  } = usePolicyDecision(resourceId, action, {
    onSuccess: (dec) => {
      if (dec.allow) {
        onAccessGranted?.(dec);
      } else {
        onAccessDenied?.(dec);
      }
    },
    onError,
  });

  // Debug panel
  const debugPanel = debug && (
    <DebugPanel
      resourceId={resourceId}
      action={action}
      decision={decision}
      isLoading={isLoading}
      error={error}
      cached={cached}
    />
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={className}>
        {loadingFallback || <DefaultLoader />}
        {debugPanel}
      </div>
    );
  }

  // Error state
  if (error) {
    const errorContent = typeof errorFallback === 'function' 
      ? errorFallback(error)
      : errorFallback || <DefaultError error={error} />;
    
    return (
      <div className={className}>
        {errorContent}
        {debugPanel}
      </div>
    );
  }

  // Access denied
  if (!canAccess) {
    return (
      <div className={className}>
        {fallback || <DefaultAccessDenied reason={reason} />}
        {debugPanel}
      </div>
    );
  }

  // Access granted
  return (
    <div className={className}>
      {children}
      {debugPanel}
    </div>
  );
}

// ============================================
// CONVENIENCE COMPONENTS
// ============================================

/**
 * PolicyGate that hides content instead of showing fallback
 */
export function PolicyGateHidden({
  resourceId,
  action = 'view',
  children,
  ...props
}: Omit<PolicyGateProps, 'fallback'>) {
  return (
    <PolicyGate
      resourceId={resourceId}
      action={action}
      fallback={null}
      loadingFallback={null}
      errorFallback={null}
      {...props}
    >
      {children}
    </PolicyGate>
  );
}

/**
 * PolicyGate for edit operations
 */
export function PolicyGateEdit({
  resourceId,
  children,
  ...props
}: Omit<PolicyGateProps, 'action'>) {
  return (
    <PolicyGate resourceId={resourceId} action="edit" {...props}>
      {children}
    </PolicyGate>
  );
}

/**
 * PolicyGate for delete operations
 */
export function PolicyGateDelete({
  resourceId,
  children,
  ...props
}: Omit<PolicyGateProps, 'action'>) {
  return (
    <PolicyGate resourceId={resourceId} action="delete" {...props}>
      {children}
    </PolicyGate>
  );
}

/**
 * PolicyGate for upload operations
 */
export function PolicyGateUpload({
  resourceId,
  children,
  ...props
}: Omit<PolicyGateProps, 'action'>) {
  return (
    <PolicyGate resourceId={resourceId} action="upload" {...props}>
      {children}
    </PolicyGate>
  );
}

export default PolicyGate;
