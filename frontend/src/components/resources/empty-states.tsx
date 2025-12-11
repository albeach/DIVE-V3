/**
 * Empty & Error State Components - Phase 4 Visual Polish
 * 
 * Beautiful, animated empty and error states with:
 * - Custom SVG illustrations
 * - Framer Motion animations
 * - Contextual messaging
 * - Action buttons
 * 
 * Inspired by Linear, Notion, and Vercel's empty states
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  FileQuestion, 
  ShieldAlert,
  Globe2,
  WifiOff,
  Lock,
  Bookmark,
  Inbox,
} from 'lucide-react';

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    },
  },
};

const floatAnimation = {
  y: [0, -8, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: 'easeInOut',
  },
};

// ============================================
// Illustration Components
// ============================================

function EmptySearchIllustration() {
  return (
    <motion.svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={floatAnimation}
    >
      {/* Background circles */}
      <circle cx="100" cy="80" r="60" className="fill-slate-100 dark:fill-slate-800" />
      <circle cx="100" cy="80" r="45" className="fill-slate-50 dark:fill-slate-700/50" />
      
      {/* Document stack */}
      <motion.g
        initial={{ rotate: -5 }}
        animate={{ rotate: [-5, -3, -5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <rect x="60" y="50" width="50" height="65" rx="4" className="fill-white dark:fill-slate-600 stroke-slate-200 dark:stroke-slate-500" strokeWidth="2" />
        <rect x="68" y="60" width="30" height="3" rx="1" className="fill-slate-200 dark:fill-slate-500" />
        <rect x="68" y="68" width="25" height="3" rx="1" className="fill-slate-200 dark:fill-slate-500" />
        <rect x="68" y="76" width="28" height="3" rx="1" className="fill-slate-200 dark:fill-slate-500" />
      </motion.g>
      
      {/* Magnifying glass */}
      <motion.g
        initial={{ x: 0, y: 0 }}
        animate={{ x: [0, 10, 0], y: [0, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
      >
        <circle cx="130" cy="70" r="22" className="fill-white dark:fill-slate-700 stroke-blue-400 dark:stroke-blue-500" strokeWidth="4" />
        <line x1="146" y1="86" x2="165" y2="105" className="stroke-blue-400 dark:stroke-blue-500" strokeWidth="6" strokeLinecap="round" />
        <circle cx="130" cy="70" r="12" className="fill-blue-50 dark:fill-blue-900/30" />
      </motion.g>
      
      {/* Question marks */}
      <motion.text
        x="125"
        y="75"
        className="fill-blue-300 dark:fill-blue-600 text-lg font-bold"
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ?
      </motion.text>
    </motion.svg>
  );
}

function EmptyFilterIllustration() {
  return (
    <motion.svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={floatAnimation}
    >
      {/* Background */}
      <circle cx="100" cy="80" r="55" className="fill-amber-50 dark:fill-amber-900/20" />
      
      {/* Funnel */}
      <motion.path
        d="M60 50 L140 50 L110 90 L110 120 L90 130 L90 90 Z"
        className="fill-white dark:fill-slate-700 stroke-amber-400 dark:stroke-amber-500"
        strokeWidth="3"
        initial={{ rotate: 0 }}
        animate={{ rotate: [0, 3, -3, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '100px 80px' }}
      />
      
      {/* Filtered items - crossed out */}
      <motion.g
        animate={{ opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <rect x="70" y="55" width="12" height="8" rx="2" className="fill-red-300 dark:fill-red-700" />
        <line x1="70" y1="55" x2="82" y2="63" className="stroke-red-500 dark:stroke-red-400" strokeWidth="2" />
        
        <rect x="90" y="55" width="12" height="8" rx="2" className="fill-red-300 dark:fill-red-700" />
        <line x1="90" y1="55" x2="102" y2="63" className="stroke-red-500 dark:stroke-red-400" strokeWidth="2" />
        
        <rect x="110" y="55" width="12" height="8" rx="2" className="fill-red-300 dark:fill-red-700" />
        <line x1="110" y1="55" x2="122" y2="63" className="stroke-red-500 dark:stroke-red-400" strokeWidth="2" />
      </motion.g>
      
      {/* Empty output */}
      <circle cx="100" cy="140" r="8" className="fill-slate-100 dark:fill-slate-600 stroke-slate-300 dark:stroke-slate-500" strokeWidth="2" strokeDasharray="4 2" />
    </motion.svg>
  );
}

function ErrorIllustration() {
  return (
    <motion.svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={floatAnimation}
    >
      {/* Background */}
      <circle cx="100" cy="80" r="55" className="fill-red-50 dark:fill-red-900/20" />
      
      {/* Shield */}
      <motion.path
        d="M100 30 L140 50 L140 90 C140 115 120 135 100 145 C80 135 60 115 60 90 L60 50 Z"
        className="fill-white dark:fill-slate-700 stroke-red-400 dark:stroke-red-500"
        strokeWidth="3"
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '100px 85px' }}
      />
      
      {/* Exclamation mark */}
      <motion.g
        animate={{ opacity: [1, 0.6, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <rect x="95" y="60" width="10" height="40" rx="5" className="fill-red-500 dark:fill-red-400" />
        <circle cx="100" cy="115" r="6" className="fill-red-500 dark:fill-red-400" />
      </motion.g>
      
      {/* Lightning bolts */}
      <motion.path
        d="M45 70 L55 55 L50 65 L60 50"
        className="stroke-red-300 dark:stroke-red-600"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
      />
      <motion.path
        d="M155 70 L145 55 L150 65 L140 50"
        className="stroke-red-300 dark:stroke-red-600"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay: 1 }}
      />
    </motion.svg>
  );
}

function NoAccessIllustration() {
  return (
    <motion.svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={floatAnimation}
    >
      {/* Background */}
      <circle cx="100" cy="80" r="55" className="fill-orange-50 dark:fill-orange-900/20" />
      
      {/* Lock body */}
      <motion.rect
        x="70"
        y="70"
        width="60"
        height="50"
        rx="8"
        className="fill-white dark:fill-slate-700 stroke-orange-400 dark:stroke-orange-500"
        strokeWidth="3"
        animate={{ y: [70, 68, 70] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* Lock shackle */}
      <motion.path
        d="M80 70 L80 55 C80 40 120 40 120 55 L120 70"
        className="stroke-orange-400 dark:stroke-orange-500"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      
      {/* Keyhole */}
      <circle cx="100" cy="90" r="6" className="fill-orange-400 dark:fill-orange-500" />
      <rect x="97" y="90" width="6" height="15" rx="3" className="fill-orange-400 dark:fill-orange-500" />
      
      {/* Denied X */}
      <motion.g
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '150px 50px' }}
      >
        <circle cx="150" cy="50" r="18" className="fill-red-500 dark:fill-red-600" />
        <line x1="142" y1="42" x2="158" y2="58" className="stroke-white" strokeWidth="3" strokeLinecap="round" />
        <line x1="158" y1="42" x2="142" y2="58" className="stroke-white" strokeWidth="3" strokeLinecap="round" />
      </motion.g>
    </motion.svg>
  );
}

function NetworkErrorIllustration() {
  return (
    <motion.svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={floatAnimation}
    >
      {/* Background */}
      <circle cx="100" cy="80" r="55" className="fill-slate-100 dark:fill-slate-800" />
      
      {/* WiFi waves - crossed out */}
      <motion.g
        animate={{ opacity: [0.3, 0.7, 0.3] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <path d="M60 70 C60 45 140 45 140 70" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M70 85 C70 65 130 65 130 85" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M80 100 C80 85 120 85 120 100" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="100" cy="115" r="6" className="fill-slate-300 dark:fill-slate-600" />
      </motion.g>
      
      {/* X overlay */}
      <motion.g
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
      >
        <line x1="70" y1="55" x2="130" y2="125" className="stroke-red-500 dark:stroke-red-400" strokeWidth="6" strokeLinecap="round" />
        <line x1="130" y1="55" x2="70" y2="125" className="stroke-red-500 dark:stroke-red-400" strokeWidth="6" strokeLinecap="round" />
      </motion.g>
    </motion.svg>
  );
}

function EmptyBookmarksIllustration() {
  return (
    <motion.svg
      width="200"
      height="160"
      viewBox="0 0 200 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      animate={floatAnimation}
    >
      {/* Background */}
      <circle cx="100" cy="80" r="55" className="fill-amber-50 dark:fill-amber-900/20" />
      
      {/* Bookmark */}
      <motion.path
        d="M70 30 L130 30 L130 130 L100 110 L70 130 Z"
        className="fill-white dark:fill-slate-700 stroke-amber-400 dark:stroke-amber-500"
        strokeWidth="3"
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '100px 80px' }}
      />
      
      {/* Star outline */}
      <motion.path
        d="M100 50 L104 62 L117 62 L107 71 L111 83 L100 75 L89 83 L93 71 L83 62 L96 62 Z"
        className="stroke-amber-300 dark:stroke-amber-600"
        strokeWidth="2"
        strokeDasharray="4 2"
        fill="none"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      
      {/* Plus sign suggestion */}
      <motion.g
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <circle cx="150" cy="110" r="15" className="fill-amber-500 dark:fill-amber-600" />
        <line x1="143" y1="110" x2="157" y2="110" className="stroke-white" strokeWidth="3" strokeLinecap="round" />
        <line x1="150" y1="103" x2="150" y2="117" className="stroke-white" strokeWidth="3" strokeLinecap="round" />
      </motion.g>
    </motion.svg>
  );
}

// ============================================
// Empty State Components
// ============================================

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

function EmptyStateWrapper({ 
  children, 
  title, 
  description, 
  action,
  secondaryAction,
}: EmptyStateProps & { children: React.ReactNode }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
    >
      <motion.div variants={itemVariants} className="mb-6">
        {children}
      </motion.div>
      
      <motion.h3 
        variants={itemVariants}
        className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2"
      >
        {title}
      </motion.h3>
      
      <motion.p 
        variants={itemVariants}
        className="text-gray-600 dark:text-gray-400 max-w-md mb-6"
      >
        {description}
      </motion.p>
      
      {(action || secondaryAction) && (
        <motion.div variants={itemVariants} className="flex gap-3">
          {action && (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {action.icon}
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg font-semibold text-sm transition-colors"
            >
              {secondaryAction.label}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================
// Exported Components
// ============================================

export function EmptySearchResults({ 
  query, 
  onClearSearch 
}: { 
  query: string; 
  onClearSearch: () => void; 
}) {
  return (
    <EmptyStateWrapper
      title="No results found"
      description={`We couldn't find any documents matching "${query}". Try adjusting your search terms or filters.`}
      action={{
        label: 'Clear search',
        onClick: onClearSearch,
        icon: <Search className="w-4 h-4" />,
      }}
    >
      <EmptySearchIllustration />
    </EmptyStateWrapper>
  );
}

export function EmptyFilterResults({ 
  onClearFilters 
}: { 
  onClearFilters: () => void; 
}) {
  return (
    <EmptyStateWrapper
      title="No matching documents"
      description="Your current filters don't match any documents. Try relaxing your filter criteria."
      action={{
        label: 'Clear filters',
        onClick: onClearFilters,
        icon: <Filter className="w-4 h-4" />,
      }}
    >
      <EmptyFilterIllustration />
    </EmptyStateWrapper>
  );
}

export function ErrorState({ 
  message, 
  onRetry 
}: { 
  message: string; 
  onRetry: () => void; 
}) {
  return (
    <EmptyStateWrapper
      title="Something went wrong"
      description={message || "We encountered an error while loading documents. Please try again."}
      action={{
        label: 'Try again',
        onClick: onRetry,
        icon: <RefreshCw className="w-4 h-4" />,
      }}
    >
      <ErrorIllustration />
    </EmptyStateWrapper>
  );
}

export function AccessDeniedState({ 
  reason,
  onBack,
}: { 
  reason?: string;
  onBack?: () => void;
}) {
  return (
    <EmptyStateWrapper
      title="Access Denied"
      description={reason || "You don't have sufficient clearance or permissions to access these documents."}
      action={onBack ? {
        label: 'Go back',
        onClick: onBack,
        icon: <ShieldAlert className="w-4 h-4" />,
      } : undefined}
    >
      <NoAccessIllustration />
    </EmptyStateWrapper>
  );
}

export function NetworkErrorState({ 
  onRetry 
}: { 
  onRetry: () => void; 
}) {
  return (
    <EmptyStateWrapper
      title="Connection lost"
      description="Unable to connect to the server. Please check your internet connection and try again."
      action={{
        label: 'Reconnect',
        onClick: onRetry,
        icon: <WifiOff className="w-4 h-4" />,
      }}
    >
      <NetworkErrorIllustration />
    </EmptyStateWrapper>
  );
}

export function EmptyBookmarks({ 
  onBrowse 
}: { 
  onBrowse?: () => void; 
}) {
  return (
    <EmptyStateWrapper
      title="No bookmarks yet"
      description="Bookmark documents to quickly access them later. Click the bookmark icon on any document to save it."
      action={onBrowse ? {
        label: 'Browse documents',
        onClick: onBrowse,
        icon: <Inbox className="w-4 h-4" />,
      } : undefined}
    >
      <EmptyBookmarksIllustration />
    </EmptyStateWrapper>
  );
}

export function FederationUnavailable({ 
  instance,
  onRetry,
}: { 
  instance: string;
  onRetry: () => void;
}) {
  return (
    <EmptyStateWrapper
      title={`${instance} instance unavailable`}
      description="This federated instance is currently unreachable. Results from other instances will still be displayed."
      action={{
        label: 'Retry connection',
        onClick: onRetry,
        icon: <Globe2 className="w-4 h-4" />,
      }}
    >
      <NetworkErrorIllustration />
    </EmptyStateWrapper>
  );
}

// ============================================
// Default Export
// ============================================

export default {
  EmptySearchResults,
  EmptyFilterResults,
  ErrorState,
  AccessDeniedState,
  NetworkErrorState,
  EmptyBookmarks,
  FederationUnavailable,
};









