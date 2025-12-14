/**
 * DIVE V3 Admin Toast Utility
 * 
 * Provides standardized toast notifications for admin operations.
 * Uses sonner for beautiful, accessible toast notifications.
 * 
 * Usage:
 *   import { adminToast } from '@/lib/admin-toast';
 *   
 *   // Success messages
 *   adminToast.success('User created successfully');
 *   
 *   // Error with details
 *   adminToast.error('Failed to save', error);
 *   
 *   // Async operations with promise
 *   adminToast.promise(saveUser(), {
 *     loading: 'Saving user...',
 *     success: 'User saved!',
 *     error: 'Failed to save user'
 *   });
 */

import { toast, ExternalToast } from 'sonner';

// Standard durations for different message types
const DURATIONS = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
} as const;

// Icons for different toast types
const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  loading: '⏳',
  idp: '🔐',
  user: '👤',
  policy: '📋',
  federation: '🌍',
  security: '🛡️',
  certificate: '🔏',
  spoke: '🔗',
  audit: '📝',
} as const;

interface AdminToastOptions extends ExternalToast {
  /** Show technical details in description */
  showDetails?: boolean;
}

/**
 * Admin-specific toast notifications with consistent styling
 */
export const adminToast = {
  /**
   * Show success toast
   */
  success: (message: string, options?: AdminToastOptions) => {
    toast.success(message, {
      duration: DURATIONS.success,
      icon: ICONS.success,
      ...options,
    });
  },

  /**
   * Show error toast with optional error details
   */
  error: (message: string, error?: unknown, options?: AdminToastOptions) => {
    const description = options?.showDetails !== false && error 
      ? error instanceof Error ? error.message : String(error)
      : undefined;
    
    toast.error(message, {
      duration: DURATIONS.error,
      icon: ICONS.error,
      description,
      ...options,
    });
  },

  /**
   * Show warning toast
   */
  warning: (message: string, options?: AdminToastOptions) => {
    toast.warning(message, {
      duration: DURATIONS.warning,
      icon: ICONS.warning,
      ...options,
    });
  },

  /**
   * Show info toast
   */
  info: (message: string, options?: AdminToastOptions) => {
    toast.info(message, {
      duration: DURATIONS.info,
      icon: ICONS.info,
      ...options,
    });
  },

  /**
   * Show loading toast (returns dismiss function)
   */
  loading: (message: string, options?: AdminToastOptions) => {
    return toast.loading(message, {
      icon: ICONS.loading,
      ...options,
    });
  },

  /**
   * Handle async operations with loading/success/error states
   */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    },
    options?: AdminToastOptions
  ) => {
    return toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
      ...options,
    });
  },

  /**
   * Dismiss a specific toast or all toasts
   */
  dismiss: (toastId?: string | number) => {
    toast.dismiss(toastId);
  },

  // ============================================
  // Domain-Specific Toast Helpers
  // ============================================

  /**
   * IdP-related toasts
   */
  idp: {
    created: (name: string) => adminToast.success(`IdP "${name}" created successfully`, { icon: ICONS.idp }),
    updated: (name: string) => adminToast.success(`IdP "${name}" updated`, { icon: ICONS.idp }),
    deleted: (name: string) => adminToast.success(`IdP "${name}" deleted`, { icon: ICONS.idp }),
    enabled: (name: string) => adminToast.success(`IdP "${name}" enabled`, { icon: ICONS.idp }),
    disabled: (name: string) => adminToast.warning(`IdP "${name}" disabled`, { icon: ICONS.idp }),
    testSuccess: (name: string) => adminToast.success(`IdP "${name}" connectivity test passed`, { icon: ICONS.idp }),
    testFailed: (name: string, error?: unknown) => adminToast.error(`IdP "${name}" connectivity test failed`, error, { icon: ICONS.idp }),
  },

  /**
   * User-related toasts
   */
  user: {
    created: (username: string) => adminToast.success(`User "${username}" created`, { icon: ICONS.user }),
    updated: (username: string) => adminToast.success(`User "${username}" updated`, { icon: ICONS.user }),
    deleted: (username: string) => adminToast.success(`User "${username}" deleted`, { icon: ICONS.user }),
    roleAssigned: (username: string, role: string) => adminToast.success(`Role "${role}" assigned to "${username}"`, { icon: ICONS.user }),
    passwordReset: (username: string) => adminToast.success(`Password reset for "${username}"`, { icon: ICONS.user }),
  },

  /**
   * Policy-related toasts
   */
  policy: {
    updated: () => adminToast.success('Policy updated successfully', { icon: ICONS.policy }),
    published: () => adminToast.success('Policy bundle published', { icon: ICONS.policy }),
    ruleToggled: (ruleName: string, enabled: boolean) => 
      adminToast.success(`Rule "${ruleName}" ${enabled ? 'enabled' : 'disabled'}`, { icon: ICONS.policy }),
    syncStarted: () => adminToast.info('Policy sync started', { icon: ICONS.policy }),
    syncComplete: () => adminToast.success('Policy sync complete', { icon: ICONS.policy }),
  },

  /**
   * Federation-related toasts
   */
  federation: {
    spokeApproved: (name: string) => adminToast.success(`Spoke "${name}" approved`, { icon: ICONS.federation }),
    spokeRejected: (name: string) => adminToast.warning(`Spoke "${name}" rejected`, { icon: ICONS.federation }),
    spokeSuspended: (name: string) => adminToast.warning(`Spoke "${name}" suspended`, { icon: ICONS.federation }),
    tokenRotated: (name: string) => adminToast.success(`Token rotated for "${name}"`, { icon: ICONS.federation }),
  },

  /**
   * Security-related toasts
   */
  security: {
    violationDetected: (count: number) => adminToast.warning(`${count} security violation${count > 1 ? 's' : ''} detected`, { icon: ICONS.security }),
    threatBlocked: () => adminToast.success('Threat blocked successfully', { icon: ICONS.security }),
    sessionTerminated: (username: string) => adminToast.info(`Session terminated for "${username}"`, { icon: ICONS.security }),
  },

  /**
   * Certificate-related toasts
   */
  certificate: {
    rotated: (type: string) => adminToast.success(`${type} certificate rotated`, { icon: ICONS.certificate }),
    expiringSoon: (type: string, days: number) => 
      adminToast.warning(`${type} certificate expires in ${days} days`, { icon: ICONS.certificate }),
    revoked: (serial: string) => adminToast.warning(`Certificate ${serial} revoked`, { icon: ICONS.certificate }),
  },

  /**
   * Audit-related toasts
   */
  audit: {
    exported: (format: string) => adminToast.success(`Audit logs exported as ${format}`, { icon: ICONS.audit }),
    syncComplete: () => adminToast.success('Audit sync complete', { icon: ICONS.audit }),
  },
};

export default adminToast;

// Re-export notification service for convenience
export { notify } from './notification-service';

