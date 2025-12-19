/**
 * IdP Stats Bar Component
 * 
 * Animated statistics bar with:
 * - Animated number counters (count-up effect)
 * - Click-to-filter functionality
 * - Gradient backgrounds with shimmer effect
 * - Real-time updates
 * - Responsive grid layout
 * 
 * Phase 2.3: Modern UI Components
 */

'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
    ServerIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// ============================================
// Types
// ============================================

export interface IdPStats {
    total: number;
    online: number;
    offline: number;
    warning: number;
}

interface IdPStatsBarProps {
    stats: IdPStats;
    onFilterClick?: (filter: 'all' | 'online' | 'offline' | 'warning') => void;
    activeFilter?: 'all' | 'online' | 'offline' | 'warning';
}

// ============================================
// Component
// ============================================

export default function IdPStatsBar({
    stats,
    onFilterClick,
    activeFilter = 'all'
}: IdPStatsBarProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Total IdPs */}
            <StatCard
                label="Total IdPs"
                value={stats.total}
                icon={ServerIcon}
                gradient="from-purple-500 to-indigo-600"
                active={activeFilter === 'all'}
                onClick={() => onFilterClick?.('all')}
            />

            {/* Online */}
            <StatCard
                label="Online"
                value={stats.online}
                icon={CheckCircleIcon}
                gradient="from-green-500 to-emerald-600"
                active={activeFilter === 'online'}
                onClick={() => onFilterClick?.('online')}
            />

            {/* Offline */}
            <StatCard
                label="Offline"
                value={stats.offline}
                icon={XCircleIcon}
                gradient="from-gray-500 to-gray-600"
                active={activeFilter === 'offline'}
                onClick={() => onFilterClick?.('offline')}
            />

            {/* Warning */}
            <StatCard
                label="Warning"
                value={stats.warning}
                icon={ExclamationTriangleIcon}
                gradient="from-yellow-500 to-orange-600"
                active={activeFilter === 'warning'}
                onClick={() => onFilterClick?.('warning')}
            />
        </div>
    );
}

// ============================================
// Stat Card Component
// ============================================

interface StatCardProps {
    label: string;
    value: number;
    icon: React.ComponentType<any>;
    gradient: string;
    active: boolean;
    onClick: () => void;
}

function StatCard({ label, value, icon: Icon, gradient, active, onClick }: StatCardProps) {
    const [displayValue, setDisplayValue] = useState(0);

    // Animated counter (count-up effect)
    useEffect(() => {
        const duration = 1000; // 1 second
        const steps = 60;
        const stepValue = value / steps;
        const stepDuration = duration / steps;

        let currentStep = 0;

        const interval = setInterval(() => {
            currentStep++;
            if (currentStep >= steps) {
                setDisplayValue(value);
                clearInterval(interval);
            } else {
                setDisplayValue(Math.floor(stepValue * currentStep));
            }
        }, stepDuration);

        return () => clearInterval(interval);
    }, [value]);

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={`
                relative overflow-hidden rounded-xl p-6
                bg-white dark:bg-gray-800
                border-2 transition-all duration-300
                ${active 
                    ? 'border-purple-500 shadow-lg shadow-purple-500/20' 
                    : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700'}
                cursor-pointer group
            `}
        >
            {/* Shimmer Effect */}
            <div className={`
                absolute inset-0 bg-gradient-to-r ${gradient} opacity-10
                group-hover:opacity-20 transition-opacity duration-300
            `}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent shimmer" />
            </div>

            {/* Content */}
            <div className="relative flex items-center justify-between">
                <div className="flex-1">
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                        {label}
                    </div>
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                        <AnimatedNumber value={displayValue} />
                    </div>
                </div>

                {/* Icon */}
                <div className={`
                    p-3 rounded-lg bg-gradient-to-br ${gradient}
                    shadow-lg transform group-hover:scale-110 transition-transform duration-300
                `}>
                    <Icon className="h-6 w-6 text-white" />
                </div>
            </div>

            {/* Active Indicator */}
            {active && (
                <motion.div
                    layoutId="activeIndicator"
                    className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-600"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                />
            )}
        </motion.button>
    );
}

// ============================================
// Animated Number Component
// ============================================

interface AnimatedNumberProps {
    value: number;
}

function AnimatedNumber({ value }: AnimatedNumberProps) {
    return (
        <motion.span
            key={value}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {value}
        </motion.span>
    );
}

// Add shimmer animation to global CSS (or add to component styles)
const shimmerStyles = `
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.shimmer {
  animation: shimmer 2s infinite;
}
`;

// Inject styles (in a real app, this would be in a CSS file)
if (typeof document !== 'undefined') {
    const styleElement = document.getElementById('idp-stats-bar-styles');
    if (!styleElement) {
        const style = document.createElement('style');
        style.id = 'idp-stats-bar-styles';
        style.textContent = shimmerStyles;
        document.head.appendChild(style);
    }
}
