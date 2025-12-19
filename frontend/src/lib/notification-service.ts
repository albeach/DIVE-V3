/**
 * DIVE V3 Unified Notification Service
 * 
 * Bridges the gap between:
 * - Sonner toast (ephemeral UI feedback)
 * - Persistent notifications (backend-stored, notification center)
 * 
 * Usage:
 *   import { notify } from '@/lib/notification-service';
 *   
 *   // Just toast (ephemeral)
 *   notify.toast.success('Saved!');
 *   
 *   // Toast + persistent notification
 *   notify.important({
 *     type: 'security',
 *     title: 'Session Terminated',
 *     message: 'Admin terminated a user session'
 *   });
 *   
 *   // Admin-specific with audit
 *   notify.admin.userCreated('john.doe');
 */

import { toast, ExternalToast } from 'sonner';

// ============================================
// Types
// ============================================

export type NotificationType =
  | 'access_granted'
  | 'access_denied'
  | 'document_shared'
  | 'upload_complete'
  | 'system'
  | 'security'
  | 'admin_action';

export interface PersistentNotification {
  type: NotificationType;
  title: string;
  message: string;
  resourceId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

interface NotifyOptions extends ExternalToast {
  /** Also create a persistent notification */
  persist?: boolean;
  /** Notification type for persistent storage */
  persistType?: NotificationType;
  /** Resource ID to link notification to */
  resourceId?: string;
  /** URL to navigate when notification is clicked */
  actionUrl?: string;
}

// ============================================
// Core Toast Functions (from sonner)
// ============================================

const toastFunctions = {
  success: (message: string, options?: ExternalToast) => {
    toast.success(message, { duration: 3000, ...options });
  },

  error: (message: string, error?: unknown, options?: ExternalToast) => {
    const description = error instanceof Error ? error.message : undefined;
    toast.error(message, { duration: 5000, description, ...options });
  },

  warning: (message: string, options?: ExternalToast) => {
    toast.warning(message, { duration: 4000, ...options });
  },

  info: (message: string, options?: ExternalToast) => {
    toast.info(message, { duration: 3000, ...options });
  },

  loading: (message: string, options?: ExternalToast) => {
    return toast.loading(message, options);
  },

  dismiss: (toastId?: string | number) => {
    toast.dismiss(toastId);
  },

  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    },
    options?: ExternalToast
  ) => {
    return toast.promise(promise, messages);
  },
};

// ============================================
// Persistent Notification Functions
// ============================================

/**
 * Create a persistent notification (stored in backend)
 */
async function createPersistentNotification(notification: PersistentNotification): Promise<boolean> {
  try {
    const response = await fetch('/api/notifications/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      console.warn('[NotificationService] Failed to create persistent notification:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[NotificationService] Error creating persistent notification:', error);
    return false;
  }
}

// ============================================
// Unified Notify Functions
// ============================================

/**
 * Show toast AND create persistent notification
 */
async function notifyImportant(
  notification: PersistentNotification,
  toastOptions?: ExternalToast
): Promise<void> {
  // Show immediate toast
  toast.success(notification.title, {
    description: notification.message,
    duration: 4000,
    ...toastOptions,
  });

  // Create persistent notification in background
  createPersistentNotification(notification);
}

/**
 * Show error toast AND create persistent notification
 */
async function notifyError(
  notification: PersistentNotification,
  error?: unknown,
  toastOptions?: ExternalToast
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : notification.message;

  // Show immediate toast
  toast.error(notification.title, {
    description: errorMessage,
    duration: 5000,
    ...toastOptions,
  });

  // Create persistent notification
  createPersistentNotification({
    ...notification,
    message: errorMessage,
    type: 'security',
  });
}

/**
 * Show security alert (always persisted)
 */
async function notifySecurity(
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Show immediate toast
  toast.warning(title, {
    description: message,
    duration: 6000,
    icon: '🛡️',
  });

  // Create persistent notification
  createPersistentNotification({
    type: 'security',
    title,
    message,
    actionUrl: '/admin/logs',
    metadata,
  });
}

// ============================================
// Admin-Specific Notifications
// ============================================

const adminNotifications = {
  // User events
  userCreated: (username: string) => {
    toastFunctions.success(`User "${username}" created`);
    createPersistentNotification({
      type: 'admin_action',
      title: 'User Created',
      message: `New user account created: ${username}`,
      actionUrl: '/admin/users',
    });
  },

  userDeleted: (username: string) => {
    toastFunctions.success(`User "${username}" deleted`);
    createPersistentNotification({
      type: 'admin_action',
      title: 'User Deleted',
      message: `User account deleted: ${username}`,
      actionUrl: '/admin/users',
    });
  },

  // IdP events
  idpCreated: (name: string) => {
    toastFunctions.success(`IdP "${name}" created`);
    createPersistentNotification({
      type: 'admin_action',
      title: 'Identity Provider Created',
      message: `New IdP configured: ${name}`,
      actionUrl: '/admin/idp',
    });
  },

  idpDisabled: (name: string) => {
    toastFunctions.warning(`IdP "${name}" disabled`);
    createPersistentNotification({
      type: 'security',
      title: 'Identity Provider Disabled',
      message: `IdP has been disabled: ${name}`,
      actionUrl: '/admin/idp',
    });
  },

  // Security events
  sessionTerminated: (username: string) => {
    toastFunctions.info(`Session terminated for "${username}"`);
    createPersistentNotification({
      type: 'security',
      title: 'Session Terminated',
      message: `Admin terminated session for: ${username}`,
      actionUrl: '/admin/security/sessions',
    });
  },

  bulkSessionsTerminated: (count: number) => {
    toastFunctions.success(`Terminated ${count} sessions`);
    createPersistentNotification({
      type: 'security',
      title: 'Bulk Sessions Terminated',
      message: `${count} user sessions were terminated by admin`,
      actionUrl: '/admin/security/sessions',
    });
  },

  securityViolation: (subject: string, resource: string) => {
    toastFunctions.error('Security violation detected');
    createPersistentNotification({
      type: 'security',
      title: 'Security Violation',
      message: `Access denied: ${subject} attempted to access ${resource}`,
      actionUrl: '/admin/logs',
    });
  },

  // Policy events
  policyUpdated: (ruleName: string, enabled: boolean) => {
    const action = enabled ? 'enabled' : 'disabled';
    toastFunctions.success(`Rule "${ruleName}" ${action}`);
    createPersistentNotification({
      type: 'admin_action',
      title: 'Policy Rule Updated',
      message: `Policy rule ${action}: ${ruleName}`,
      actionUrl: '/admin/opa-policy',
    });
  },

  // Federation events  
  spokeApproved: (spokeName: string) => {
    toastFunctions.success(`Spoke "${spokeName}" approved`);
    createPersistentNotification({
      type: 'admin_action',
      title: 'Spoke Approved',
      message: `Federation spoke approved: ${spokeName}`,
      actionUrl: '/admin/federation/spokes',
    });
  },

  spokeRejected: (spokeName: string, reason: string) => {
    toastFunctions.warning(`Spoke "${spokeName}" rejected`);
    createPersistentNotification({
      type: 'security',
      title: 'Spoke Rejected',
      message: `Federation spoke rejected: ${spokeName}. Reason: ${reason}`,
      actionUrl: '/admin/federation/spokes',
    });
  },

  // Certificate events
  certificateExpiring: (name: string, daysRemaining: number) => {
    toastFunctions.warning(`Certificate "${name}" expires in ${daysRemaining} days`);
    createPersistentNotification({
      type: 'security',
      title: 'Certificate Expiring Soon',
      message: `${name} certificate expires in ${daysRemaining} days`,
      actionUrl: '/admin/certificates',
    });
  },

  certificateRotated: (name: string) => {
    toastFunctions.success(`Certificate "${name}" rotated`);
    createPersistentNotification({
      type: 'admin_action',
      title: 'Certificate Rotated',
      message: `Certificate successfully rotated: ${name}`,
      actionUrl: '/admin/certificates',
    });
  },
};

// ============================================
// Exported API
// ============================================

export const notify = {
  // Basic toast functions
  toast: toastFunctions,

  // Persistent notification creation
  persist: createPersistentNotification,

  // Combined toast + persistent
  important: notifyImportant,
  error: notifyError,
  security: notifySecurity,

  // Admin-specific (pre-built)
  admin: adminNotifications,
};

export default notify;
