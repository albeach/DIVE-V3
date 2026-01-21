/**
 * Validation Toast System - 2026 Modern UX
 *
 * Integrates with Sonner toast library for real-time validation feedback:
 * - Critical warnings (upload will fail)
 * - Inline suggestions with quick-fix actions
 * - Color-coded severity levels
 * - Progressive error recovery suggestions
 * - Full accessibility support
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { toast, Toaster, ExternalToast } from 'sonner';
import { AlertTriangle, Info, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Validation warning types
export interface ValidationWarning {
  id: string;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'success';
  action?: () => void;
  actionLabel?: string;
  dismissible?: boolean;
}

// Hook for managing validation toasts
export function useValidationToasts() {
  const activeToasts = useRef<Set<string>>(new Set());

  const showWarning = useCallback((warning: ValidationWarning) => {
    // Don't show duplicate toasts
    if (activeToasts.current.has(warning.id)) {
      return;
    }

    activeToasts.current.add(warning.id);

    const toastOptions: ExternalToast = {
      id: warning.id,
      duration: warning.severity === 'error' ? Infinity : 5000,
      dismissible: warning.dismissible !== false,
      onDismiss: () => {
        activeToasts.current.delete(warning.id);
      },
      onAutoClose: () => {
        activeToasts.current.delete(warning.id);
      },
    };

    const toastContent = (
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium">{warning.message}</p>
        </div>
        {warning.action && warning.actionLabel && (
          <button
            onClick={() => {
              warning.action?.();
              toast.dismiss(warning.id);
              activeToasts.current.delete(warning.id);
            }}
            className={cn(
              'flex-shrink-0 px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1',
              'bg-white/20 hover:bg-white/30 text-white'
            )}
          >
            {warning.actionLabel}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    );

    switch (warning.severity) {
      case 'error':
        toast.error(toastContent, toastOptions);
        break;
      case 'warning':
        toast.warning(toastContent, toastOptions);
        break;
      case 'info':
        toast.info(toastContent, toastOptions);
        break;
      case 'success':
        toast.success(toastContent, toastOptions);
        break;
    }
  }, []);

  const dismissWarning = useCallback((id: string) => {
    toast.dismiss(id);
    activeToasts.current.delete(id);
  }, []);

  const dismissAll = useCallback(() => {
    toast.dismiss();
    activeToasts.current.clear();
  }, []);

  const showUploadProgress = useCallback(
    (
      id: string,
      {
        progress,
        step,
      }: {
        progress: number;
        step: string;
      }
    ) => {
      toast.loading(
        <div className="w-full">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{step}</span>
            <span className="text-xs text-gray-500">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>,
        {
          id,
          duration: Infinity,
        }
      );
    },
    []
  );

  const showUploadSuccess = useCallback((resourceId: string) => {
    toast.success(
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
        <div>
          <p className="font-medium">Upload Complete!</p>
          <p className="text-xs text-gray-500">Redirecting to document...</p>
        </div>
      </div>,
      {
        duration: 2000,
      }
    );
  }, []);

  const showUploadError = useCallback((message: string, retryAction?: () => void) => {
    toast.error(
      <div className="flex items-start gap-3">
        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">Upload Failed</p>
          <p className="text-xs text-gray-500 mt-1">{message}</p>
        </div>
        {retryAction && (
          <button
            onClick={retryAction}
            className="flex-shrink-0 px-3 py-1 text-xs font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800/30"
          >
            Retry
          </button>
        )}
      </div>,
      {
        duration: Infinity,
        dismissible: true,
      }
    );
  }, []);

  return {
    showWarning,
    dismissWarning,
    dismissAll,
    showUploadProgress,
    showUploadSuccess,
    showUploadError,
  };
}

// Validation rules engine
export interface ValidationRules {
  userClearance: string;
  userCountry: string;
  userCOI: string[];
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  caveats: string[];
}

const CLASSIFICATION_HIERARCHY: Record<string, number> = {
  UNCLASSIFIED: 0,
  RESTRICTED: 1,
  CONFIDENTIAL: 2,
  SECRET: 3,
  TOP_SECRET: 4,
};

export function validateUploadForm(rules: ValidationRules): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Classification above user clearance
  if (
    CLASSIFICATION_HIERARCHY[rules.classification] >
    CLASSIFICATION_HIERARCHY[rules.userClearance]
  ) {
    warnings.push({
      id: 'clearance-exceeded',
      message: `Classification ${rules.classification} is above your clearance level (${rules.userClearance})`,
      severity: 'error',
      actionLabel: `Set to ${rules.userClearance}`,
    });
  }

  // No countries selected for classified document
  if (rules.releasabilityTo.length === 0 && rules.classification !== 'UNCLASSIFIED') {
    warnings.push({
      id: 'no-countries',
      message: 'Classified documents require at least one country in releasability',
      severity: 'error',
      actionLabel: `Add ${rules.userCountry}`,
    });
  }

  // NOFORN with foreign countries
  if (
    rules.caveats.includes('NOFORN') &&
    rules.releasabilityTo.some((c) => c !== rules.userCountry)
  ) {
    warnings.push({
      id: 'noforn-conflict',
      message: 'NOFORN caveat is incompatible with foreign country releasability',
      severity: 'warning',
      actionLabel: 'Remove NOFORN',
    });
  }

  // User country not included
  if (!rules.releasabilityTo.includes(rules.userCountry) && rules.releasabilityTo.length > 0) {
    warnings.push({
      id: 'user-country-missing',
      message: `Your country (${rules.userCountry}) is not included - you won't be able to access this document`,
      severity: 'warning',
      actionLabel: `Add ${rules.userCountry}`,
    });
  }

  // COI membership validation
  if (rules.COI.length > 0) {
    if (rules.userCOI.length === 0) {
      warnings.push({
        id: 'no-coi-membership',
        message: 'You are not a member of any COI. Remove COI selection to proceed.',
        severity: 'error',
        actionLabel: 'Remove COI',
      });
    } else {
      const invalidCOIs = rules.COI.filter((coi) => !rules.userCOI.includes(coi));
      if (invalidCOIs.length > 0) {
        warnings.push({
          id: 'invalid-coi',
          message: `You are not a member of: ${invalidCOIs.join(', ')}`,
          severity: 'error',
          actionLabel: 'Remove invalid COIs',
        });
      }
    }
  }

  return warnings;
}

// Custom Toaster component with 2026 styling
export function ValidationToaster() {
  return (
    <Toaster
      position="top-right"
      expand={true}
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'var(--toast-bg, white)',
          border: '1px solid var(--toast-border, #e5e7eb)',
          borderRadius: '1rem',
          padding: '1rem',
          boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
        },
        classNames: {
          toast: 'group',
          title: 'text-sm font-semibold',
          description: 'text-xs text-gray-500',
          actionButton: 'bg-blue-500 text-white',
          cancelButton: 'bg-gray-200 text-gray-800',
          error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
          warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
          info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
          success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
        },
      }}
    />
  );
}

// Quick toast helper functions
export const uploadToast = {
  error: (message: string, options?: ExternalToast) =>
    toast.error(message, { duration: Infinity, ...options }),

  warning: (message: string, options?: ExternalToast) =>
    toast.warning(message, { duration: 5000, ...options }),

  info: (message: string, options?: ExternalToast) =>
    toast.info(message, { duration: 4000, ...options }),

  success: (message: string, options?: ExternalToast) =>
    toast.success(message, { duration: 3000, ...options }),

  loading: (message: string, options?: ExternalToast) =>
    toast.loading(message, { duration: Infinity, ...options }),

  draftSaved: () =>
    toast.info('Draft saved', {
      duration: 2000,
      icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    }),

  draftRestored: () =>
    toast.success('Draft restored', {
      duration: 2000,
    }),

  coiAutoSync: (coi: string, countries: string[]) =>
    toast.info(
      <div>
        <p className="font-medium">Countries auto-added for {coi}</p>
        <p className="text-xs text-gray-500 mt-1">{countries.join(', ')}</p>
      </div>,
      {
        duration: 3000,
        icon: <Info className="w-4 h-4 text-blue-500" />,
      }
    ),

  classificationChanged: (from: string, to: string) =>
    toast.info(`Classification changed from ${from} to ${to}`, {
      duration: 2000,
    }),

  undone: (action: string) =>
    toast.info(`Undone: ${action}`, {
      duration: 2000,
    }),

  redone: (action: string) =>
    toast.info(`Redone: ${action}`, {
      duration: 2000,
    }),
};

export default ValidationToaster;
