/**
 * Admin Onboarding Tour System
 *
 * Interactive 8-step product tour for first-time administrators
 * Features:
 * - Step-by-step guided tour
 * - Progress tracking
 * - Dismissible and resumable
 * - Setup checklist
 * - Role-aware content (hub vs spoke admin)
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Play,
  SkipForward,
  CheckCircle,
  Circle,
  Globe2,
  Network,
  ShieldCheck,
  FileText,
  Key,
  Zap,
  Users,
  Settings,
} from 'lucide-react';
import { adminAnimations, adminZIndex } from '@/components/admin/shared/theme-tokens';

/**
 * Tour step interface
 */
export interface TourStep {
  id: string;
  title: string;
  description: string;
  content: string;
  icon: React.ElementType;
  targetElement?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: {
    label: string;
    href: string;
  };
  hubOnly?: boolean;
  spokeOnly?: boolean;
}

/**
 * Complete admin onboarding tour steps
 */
export const ADMIN_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to DIVE V3 Admin',
    description: 'Complete admin interface for coalition identity and access management',
    content: 'DIVE V3 provides a comprehensive admin dashboard for managing identity providers, federation, policies, and security across NATO partner nations. This tour will guide you through the key features.',
    icon: Settings,
    position: 'center',
  },
  {
    id: 'navigation',
    title: 'Quick Navigation',
    description: 'Access any admin page instantly',
    content: 'Press Cmd+K (Mac) or Ctrl+K (Windows) to open the command palette. You can fuzzy search across all 25 admin pages, view recent pages, and access quick actions.',
    icon: Zap,
    targetElement: 'body',
    position: 'center',
    action: {
      label: 'Try Command Palette',
      href: '#',
    },
  },
  {
    id: 'hub-federation',
    title: 'Hub: Federation Management',
    description: 'Manage spoke instances and policy distribution',
    content: 'As a hub administrator, you control the federation of spoke instances, approve new members, distribute OPA policies via OPAL, and monitor federation health.',
    icon: Network,
    targetElement: '[href="/admin/federation"]',
    position: 'right',
    hubOnly: true,
    action: {
      label: 'View Federation',
      href: '/admin/federation',
    },
  },
  {
    id: 'spoke-status',
    title: 'Spoke: Hub Connectivity',
    description: 'Monitor hub connectivity and failover status',
    content: 'As a spoke administrator, you monitor connectivity to the hub, manage circuit breaker failover, and ensure audit events are queued during outages.',
    icon: Zap,
    targetElement: '[href="/admin/spoke"]',
    position: 'right',
    spokeOnly: true,
    action: {
      label: 'Check Spoke Status',
      href: '/admin/spoke',
    },
  },
  {
    id: 'idp-management',
    title: 'Identity Provider Configuration',
    description: 'Integrate partner nation authentication systems',
    content: 'Configure OIDC and SAML identity providers for partner nations. Each IdP requires protocol mappers to normalize claims (uniqueID, clearance, countryOfAffiliation, acpCOI).',
    icon: Globe2,
    targetElement: '[href="/admin/idp"]',
    position: 'right',
    action: {
      label: 'Manage IdPs',
      href: '/admin/idp',
    },
  },
  {
    id: 'policy-management',
    title: 'OPA Policy Management',
    description: 'Real-time policy editor and testing',
    content: 'Edit and test OPA Rego policies in real-time. Policies control authorization decisions using ABAC (Attribute-Based Access Control) patterns with clearance, releasability, and COI checks.',
    icon: ShieldCheck,
    targetElement: '[href="/admin/opa-policy"]',
    position: 'right',
    action: {
      label: 'Edit Policies',
      href: '/admin/opa-policy',
    },
  },
  {
    id: 'audit-logs',
    title: 'Audit & Compliance',
    description: 'Security event monitoring and compliance',
    content: 'Review authorization decisions, authentication events, policy violations, and security anomalies. All events are logged for 90+ days minimum.',
    icon: FileText,
    targetElement: '[href="/admin/logs"]',
    position: 'right',
    action: {
      label: 'View Audit Logs',
      href: '/admin/logs',
    },
  },
  {
    id: 'certificates',
    title: 'PKI & Certificate Management',
    description: 'Automated certificate rotation and CRL',
    content: 'Manage TLS certificates, SAML signing certificates, and policy bundle signing keys. Automated rotation every 90 days prevents expiry issues.',
    icon: Key,
    targetElement: '[href="/admin/certificates"]',
    position: 'right',
    action: {
      label: 'Manage Certificates',
      href: '/admin/certificates',
    },
  },
  {
    id: 'complete',
    title: 'You\'re Ready!',
    description: 'Complete the setup checklist to finish configuration',
    content: 'You\'ve completed the admin tour! Use the setup checklist below to configure your DIVE V3 instance. Access this tour anytime from the help menu.',
    icon: CheckCircle,
    position: 'center',
  },
];

/**
 * Setup checklist item interface
 */
export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  hubOnly?: boolean;
  spokeOnly?: boolean;
  estimatedTime?: string;
}

/**
 * Admin setup checklist
 */
export const ADMIN_SETUP_CHECKLIST: ChecklistItem[] = [
  {
    id: 'configure-first-idp',
    title: 'Configure First Identity Provider',
    description: 'Add and test your first OIDC or SAML identity provider',
    href: '/admin/idp/new',
    icon: Globe2,
    estimatedTime: '15 min',
  },
  {
    id: 'setup-protocol-mappers',
    title: 'Configure Protocol Mappers',
    description: 'Map IdP claims to DIVE V3 attributes (uniqueID, clearance, etc.)',
    href: '/admin/idp',
    icon: Users,
    estimatedTime: '10 min',
  },
  {
    id: 'approve-first-spoke',
    title: 'Approve First Spoke Instance',
    description: 'Review and approve partner nation spoke registration',
    href: '/admin/federation/spokes',
    icon: Network,
    hubOnly: true,
    estimatedTime: '5 min',
  },
  {
    id: 'test-policy-distribution',
    title: 'Test Policy Distribution',
    description: 'Verify OPAL policy sync to spoke instances',
    href: '/admin/federation/opal',
    icon: ShieldCheck,
    hubOnly: true,
    estimatedTime: '5 min',
  },
  {
    id: 'configure-hub-connectivity',
    title: 'Configure Hub Connectivity',
    description: 'Set up primary and backup hub connections',
    href: '/admin/spoke/failover',
    icon: Zap,
    spokeOnly: true,
    estimatedTime: '10 min',
  },
  {
    id: 'review-policies',
    title: 'Review OPA Authorization Policies',
    description: 'Understand and customize authorization rules',
    href: '/admin/opa-policy',
    icon: ShieldCheck,
    estimatedTime: '20 min',
  },
  {
    id: 'setup-certificate-alerts',
    title: 'Configure Certificate Expiry Alerts',
    description: 'Enable 90/60/30 day certificate expiry notifications',
    href: '/admin/certificates',
    icon: Key,
    estimatedTime: '5 min',
  },
  {
    id: 'review-audit-logs',
    title: 'Review Audit Log Configuration',
    description: 'Verify audit events are being logged correctly',
    href: '/admin/logs',
    icon: FileText,
    estimatedTime: '10 min',
  },
];

/**
 * Admin Onboarding Tour Component
 */
export function AdminOnboardingTour({
  instanceType = 'hub',
  onComplete,
  onSkip,
}: {
  instanceType?: 'hub' | 'spoke';
  onComplete?: () => void;
  onSkip?: () => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  // Filter steps by instance type
  const filteredSteps = ADMIN_TOUR_STEPS.filter((step) => {
    if (step.hubOnly && instanceType !== 'hub') return false;
    if (step.spokeOnly && instanceType !== 'spoke') return false;
    return true;
  });

  const currentStep = filteredSteps[currentStepIndex];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === filteredSteps.length - 1;

  // Load tour state from localStorage
  useEffect(() => {
    const tourState = localStorage.getItem('dive-admin-tour-state');
    if (tourState) {
      const { completed, skipped } = JSON.parse(tourState);
      if (!completed && !skipped) {
        setIsActive(true);
      }
    } else {
      // First time - show tour
      setIsActive(true);
    }
  }, []);

  // Save progress
  const saveProgress = useCallback((completed: boolean, skipped: boolean) => {
    localStorage.setItem('dive-admin-tour-state', JSON.stringify({
      completed,
      skipped,
      lastStep: currentStepIndex,
      completedSteps,
    }));
  }, [currentStepIndex, completedSteps]);

  const handleNext = useCallback(() => {
    if (!isLastStep) {
      setCompletedSteps((prev) => [...new Set([...prev, currentStep.id])]);
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Tour complete
      saveProgress(true, false);
      setIsActive(false);
      onComplete?.();
    }
  }, [isLastStep, currentStep, saveProgress, onComplete]);

  const handlePrevious = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  }, [isFirstStep]);

  const handleSkip = useCallback(() => {
    saveProgress(false, true);
    setIsActive(false);
    onSkip?.();
  }, [saveProgress, onSkip]);

  const handleClose = useCallback(() => {
    saveProgress(false, false);
    setIsActive(false);
  }, [saveProgress]);

  if (!isActive) return null;

  return (
    <AnimatePresence>
      {/* Backdrop with spotlight effect */}
      <motion.div
        {...adminAnimations.fadeIn}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[4999]"
        onClick={handleClose}
      >
        {/* Spotlight on target element */}
        {currentStep.targetElement && currentStep.targetElement !== 'body' && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="relative w-full h-full">
              {/* This would highlight the target element */}
              <div className="absolute inset-0 bg-transparent" />
            </div>
          </div>
        )}
      </motion.div>

      {/* Tour Card */}
      <div
        className={`fixed z-[5000] ${
          currentStep.position === 'center'
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:left-auto md:right-8 md:translate-x-0'
        }`}
      >
        <motion.div
          key={currentStep.id}
          {...adminAnimations.slideUp}
          className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        >
          {/* Header */}
          <div className="relative px-6 py-8 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close tour"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <currentStep.icon className="w-7 h-7" />
              </div>
              <div>
                <div className="text-sm font-medium text-white/80 mb-1">
                  Step {currentStepIndex + 1} of {filteredSteps.length}
                </div>
                <h3 className="text-xl font-bold">{currentStep.title}</h3>
              </div>
            </div>

            <p className="text-white/90 text-sm">
              {currentStep.description}
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
              {currentStep.content}
            </p>

            {/* Action Button */}
            {currentStep.action && (
              <a
                href={currentStep.action.href}
                onClick={(e) => {
                  if (currentStep.action?.href === '#') {
                    e.preventDefault();
                    // Trigger command palette or other action
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors text-sm font-medium mb-6"
              >
                <Play className="w-4 h-4" />
                {currentStep.action.label}
              </a>
            )}

            {/* Progress Indicators */}
            <div className="flex items-center gap-2 mb-6">
              {filteredSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    idx < currentStepIndex
                      ? 'bg-emerald-500 dark:bg-emerald-400'
                      : idx === currentStepIndex
                        ? 'bg-indigo-500 dark:bg-indigo-400'
                        : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors flex items-center gap-2"
              >
                <SkipForward className="w-4 h-4" />
                Skip Tour
              </button>

              <div className="flex items-center gap-2">
                {!isFirstStep && (
                  <button
                    onClick={handlePrevious}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                )}

                <button
                  onClick={handleNext}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
                >
                  {isLastStep ? 'Complete' : 'Next'}
                  {isLastStep ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/**
 * Setup Checklist Component
 */
export function AdminSetupChecklist({
  instanceType = 'hub',
  onAllComplete,
}: {
  instanceType?: 'hub' | 'spoke';
  onAllComplete?: () => void;
}) {
  const [completedItems, setCompletedItems] = useState<string[]>([]);

  // Load completed items from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dive-admin-checklist');
    if (stored) {
      setCompletedItems(JSON.parse(stored));
    }
  }, []);

  // Filter checklist by instance type
  const filteredChecklist = ADMIN_SETUP_CHECKLIST.filter((item) => {
    if (item.hubOnly && instanceType !== 'hub') return false;
    if (item.spokeOnly && instanceType !== 'spoke') return false;
    return true;
  });

  const toggleItem = useCallback((itemId: string) => {
    setCompletedItems((prev) => {
      const updated = prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId];

      localStorage.setItem('dive-admin-checklist', JSON.stringify(updated));

      // Check if all complete
      if (updated.length === filteredChecklist.length) {
        onAllComplete?.();
      }

      return updated;
    });
  }, [filteredChecklist.length, onAllComplete]);

  const progress = (completedItems.length / filteredChecklist.length) * 100;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
            Setup Checklist
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {completedItems.length} of {filteredChecklist.length} completed
          </p>
        </div>
        {progress === 100 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            All done!
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full mb-6 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Checklist Items */}
      <div className="space-y-3">
        {filteredChecklist.map((item) => {
          const isCompleted = completedItems.includes(item.id);
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                isCompleted
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800'
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={() => toggleItem(item.id)}
                className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  isCompleted
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 dark:hover:border-indigo-500'
                }`}
              >
                {isCompleted && <Check className="w-4 h-4" />}
              </button>

              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                isCompleted
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
              }`}>
                <Icon className="w-5 h-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className={`text-sm font-semibold ${
                    isCompleted
                      ? 'text-emerald-900 dark:text-emerald-100 line-through'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}>
                    {item.title}
                  </h4>
                  {item.estimatedTime && !isCompleted && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      {item.estimatedTime}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                  {item.description}
                </p>
                {!isCompleted && (
                  <a
                    href={item.href}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    Get started
                    <ChevronRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AdminOnboardingTour;
