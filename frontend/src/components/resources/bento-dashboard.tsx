/**
 * Bento Dashboard Component - Phase 4 Visual Polish
 * 
 * A compact, visually striking stats header for the resources page.
 * Redesigned for better layout consistency and visual balance.
 * 
 * @version 2.0.0 - Simplified layout
 */

'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Shield,
  Globe2,
  Lock,
  Zap,
  Server,
  Bookmark,
  Eye,
} from 'lucide-react';

// ============================================
// Types
// ============================================

interface BentoDashboardProps {
  totalDocuments: number;
  encryptedCount: number;
  classificationBreakdown: {
    UNCLASSIFIED: number;
    CONFIDENTIAL: number;
    SECRET: number;
    TOP_SECRET: number;
  };
  activeInstances: string[];
  federatedMode: boolean;
  timing?: {
    searchMs: number;
    facetMs: number;
  };
  userAttributes: {
    clearance?: string;
    country?: string;
    coi?: string[];
  };
  bookmarkCount: number;
  isLoading: boolean;
}

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

// ============================================
// Animated Counter
// ============================================

function AnimatedCounter({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startValue + (value - startValue) * easeOut);
      
      setDisplayValue(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{displayValue.toLocaleString()}</span>;
}

// ============================================
// Classification Colors
// ============================================

const classificationColors = {
  UNCLASSIFIED: 'text-emerald-600 dark:text-emerald-400',
  CONFIDENTIAL: 'text-amber-600 dark:text-amber-400',
  SECRET: 'text-orange-600 dark:text-orange-400',
  TOP_SECRET: 'text-red-600 dark:text-red-400',
};

const instanceFlags: Record<string, string> = {
  USA: '🇺🇸',
  FRA: '🇫🇷',
  GBR: '🇬🇧',
  DEU: '🇩🇪',
  CAN: '🇨🇦',
};

// ============================================
// Main Component
// ============================================

export default function BentoDashboard({
  totalDocuments,
  encryptedCount,
  classificationBreakdown,
  activeInstances,
  federatedMode,
  timing,
  userAttributes,
  bookmarkCount,
  isLoading,
}: BentoDashboardProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="mb-6"
    >
      {/* Main Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
        {/* Total Documents - Hero Card */}
        <motion.div
          variants={itemVariants}
          className="col-span-2 relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-4 text-white shadow-lg"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
          
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-white/70" />
                <span className="text-xs font-medium text-white/70">Total Documents</span>
              </div>
              <div className="text-3xl sm:text-4xl font-black tracking-tight">
                {isLoading ? (
                  <div className="h-10 w-24 bg-white/20 rounded animate-pulse" />
                ) : (
                  <AnimatedCounter value={totalDocuments} />
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/60">
                {federatedMode ? `${activeInstances.length} instances` : 'Local'}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 p-3 text-white shadow-lg"
        >
          <Lock className="w-4 h-4 mb-1 text-white/70" />
          <div className="text-2xl font-bold">
            {isLoading ? '—' : encryptedCount}
          </div>
          <div className="text-[10px] text-white/70">ZTDF Encrypted</div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="relative overflow-hidden rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 p-3 text-white shadow-lg"
        >
          <Zap className="w-4 h-4 mb-1 text-white/70" />
          <div className="text-2xl font-bold">
            {timing ? `${timing.searchMs}` : '—'}
            <span className="text-sm font-normal">ms</span>
          </div>
          <div className="text-[10px] text-white/70">Search Time</div>
        </motion.div>

        {/* Federation Status */}
        <motion.div
          variants={itemVariants}
          className="col-span-2 rounded-xl bg-white dark:bg-gray-800 p-3 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              {federatedMode ? (
                <Globe2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <Server className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              )}
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {federatedMode ? 'Federated' : 'Local'}
              </span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">
              {activeInstances.length} active
            </span>
          </div>
          <div className="flex gap-1">
            {['USA', 'FRA', 'GBR', 'DEU'].map((inst) => (
              <span
                key={inst}
                className={`text-xs px-1.5 py-0.5 rounded font-medium transition-all ${
                  activeInstances.includes(inst)
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                }`}
              >
                {instanceFlags[inst]} {inst}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Classification Breakdown */}
        <motion.div
          variants={itemVariants}
          className="col-span-2 sm:col-span-2 rounded-xl bg-white dark:bg-gray-800 p-3 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Classification</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center">
            {(Object.entries(classificationBreakdown) as [keyof typeof classificationColors, number][]).map(([level, count]) => (
              <div key={level} className="min-w-0">
                <div className={`text-lg font-bold ${classificationColors[level]}`}>
                  {count}
                </div>
                <div className="text-[9px] text-gray-500 dark:text-gray-400 truncate">
                  {level === 'UNCLASSIFIED' ? 'UNCLAS' : 
                   level === 'CONFIDENTIAL' ? 'CONF' :
                   level === 'TOP_SECRET' ? 'TS' : level}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* User Access */}
        <motion.div
          variants={itemVariants}
          className="col-span-2 sm:col-span-2 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 p-3 text-white shadow-lg"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Eye className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-300">Your Access</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className={`text-sm font-bold ${
                userAttributes.clearance === 'TOP_SECRET' ? 'text-red-400' :
                userAttributes.clearance === 'SECRET' ? 'text-orange-400' :
                userAttributes.clearance === 'CONFIDENTIAL' ? 'text-amber-400' :
                'text-emerald-400'
              }`}>
                {userAttributes.clearance?.replace('_', ' ').substring(0, 6) || '—'}
              </div>
              <div className="text-[9px] text-slate-400">Clearance</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                {userAttributes.country ? `${instanceFlags[userAttributes.country] || ''} ${userAttributes.country}` : '—'}
              </div>
              <div className="text-[9px] text-slate-400">Country</div>
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                {userAttributes.coi?.length || 0}
              </div>
              <div className="text-[9px] text-slate-400">COIs</div>
            </div>
          </div>
        </motion.div>

        {/* Bookmarks */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 p-3 text-white shadow-lg"
        >
          <Bookmark className="w-4 h-4 mb-1 text-white/70" />
          <div className="text-2xl font-bold">{bookmarkCount}</div>
          <div className="text-[10px] text-white/70">Bookmarks</div>
        </motion.div>

        {/* Status */}
        <motion.div
          variants={itemVariants}
          className="rounded-xl bg-white dark:bg-gray-800 p-3 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <div className={`w-4 h-4 mb-1 rounded-full ${isLoading ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
          <div className="text-sm font-bold text-gray-900 dark:text-white">
            {isLoading ? 'Loading' : 'Ready'}
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">Status</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ============================================
// Skeleton Loader
// ============================================

export function BentoDashboardSkeleton() {
  return (
    <div className="mb-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
        <div className="col-span-2 h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="col-span-2 h-24 rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="col-span-2 h-20 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="col-span-2 h-20 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-20 rounded-xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-20 rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  );
}
