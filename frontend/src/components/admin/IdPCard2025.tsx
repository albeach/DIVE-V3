/**
 * IdPCard2025 Component
 * 
 * Modern 2025 design with:
 * - Glassmorphism effects
 * - Smooth animations (Framer Motion)
 * - Hover interactions
 * - Quick actions radial menu
 * - Live status indicators
 * - Risk tier badges
 * 
 * Phase 2.1: Modern UI Components
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ServerIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
    EllipsisVerticalIcon,
    PlayIcon,
    EyeIcon,
    PencilIcon,
    TrashIcon,
    ChartBarIcon
} from '@heroicons/react/24/outline';
import { IIdPListItem } from '@/types/admin.types';

// ============================================
// Types
// ============================================

interface IdPCard2025Props {
    idp: IIdPListItem;
    onTest?: (alias: string) => void;
    onView?: (alias: string) => void;
    onEdit?: (alias: string) => void;
    onDelete?: (alias: string) => void;
    onViewAnalytics?: (alias: string) => void;
    selected?: boolean;
    onClick?: (alias: string) => void;
}

// ============================================
// Component
// ============================================

export default function IdPCard2025({
    idp,
    onTest,
    onView,
    onEdit,
    onDelete,
    onViewAnalytics,
    selected = false,
    onClick
}: IdPCard2025Props) {
    const [isHovered, setIsHovered] = useState(false);
    const [showActions, setShowActions] = useState(false);

    // Mock metrics (in real app, fetch from backend)
    const metrics = {
        uptime: 99.8,
        successRate: 98.5,
        lastTested: '2 hours ago'
    };

    // Mock risk tier (would come from backend)
    const riskTier = idp.alias.includes('usa') ? 'gold' : idp.alias.includes('fra') ? 'silver' : 'bronze';

    const tierColors = {
        gold: 'from-yellow-400 to-yellow-600',
        silver: 'from-gray-300 to-gray-500',
        bronze: 'from-orange-400 to-orange-600',
        fail: 'from-red-400 to-red-600'
    };

    const tierTextColors = {
        gold: 'text-yellow-700 dark:text-yellow-400',
        silver: 'text-gray-700 dark:text-gray-400',
        bronze: 'text-orange-700 dark:text-orange-400',
        fail: 'text-red-700 dark:text-red-400'
    };

    const handleCardClick = () => {
        if (onClick) {
            onClick(idp.alias);
        }
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.2 }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            className={`
                relative group cursor-pointer
                ${selected ? 'ring-2 ring-purple-500' : ''}
            `}
            onClick={handleCardClick}
            data-testid={`idp-card-${idp.alias}`}
        >
            {/* Glassmorphism Card */}
            <div className={`
                relative overflow-hidden rounded-xl
                bg-white/70 dark:bg-gray-800/70
                backdrop-blur-xl
                border border-gray-200/50 dark:border-gray-700/50
                shadow-lg hover:shadow-2xl
                transition-all duration-300
                ${isHovered ? 'shadow-purple-500/20' : ''}
            `}>
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Content */}
                <div className="relative p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3">
                            {/* Icon */}
                            <div className={`
                                p-3 rounded-lg
                                bg-gradient-to-br ${tierColors[riskTier]}
                                shadow-lg
                            `}>
                                <ServerIcon className="h-6 w-6 text-white" />
                            </div>

                            {/* Info */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                                    {idp.displayName}
                                </h3>
                                <div className="flex items-center gap-2">
                                    {/* Protocol Badge */}
                                    <span className={`
                                        px-2 py-1 text-xs font-medium rounded-full
                                        ${idp.protocol === 'oidc' 
                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}
                                    `}>
                                        {idp.protocol.toUpperCase()}
                                    </span>

                                    {/* Risk Tier Badge */}
                                    <span className={`
                                        px-2 py-1 text-xs font-medium rounded-full
                                        bg-gradient-to-r ${tierColors[riskTier]}
                                        text-white
                                    `}>
                                        {riskTier.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Status Indicator with Pulse */}
                        <div className="relative">
                            {idp.enabled ? (
                                <>
                                    <CheckCircleIcon className="h-6 w-6 text-green-500" />
                                    {/* Pulse Animation */}
                                    <span className="absolute inset-0 animate-ping">
                                        <CheckCircleIcon className="h-6 w-6 text-green-500 opacity-75" />
                                    </span>
                                </>
                            ) : (
                                <XCircleIcon className="h-6 w-6 text-gray-400" />
                            )}
                        </div>
                    </div>

                    {/* Metrics Bar */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Uptime</div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                {metrics.uptime}%
                            </div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Success</div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                {metrics.successRate}%
                            </div>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tested</div>
                            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {metrics.lastTested}
                            </div>
                        </div>
                    </div>

                    {/* Footer - Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                            {idp.createdAt ? new Date(idp.createdAt).toLocaleDateString() : 'N/A'}
                        </div>

                        {/* Quick Actions Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowActions(!showActions);
                            }}
                            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            <EllipsisVerticalIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Radial Quick Actions Menu */}
                <AnimatePresence>
                    {showActions && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                            className="absolute bottom-16 right-6 z-10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="relative">
                                {/* Action Buttons in Radial Layout */}
                                <div className="flex flex-col gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 p-2">
                                    {onTest && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onTest(idp.alias);
                                                setShowActions(false);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 transition-colors text-sm"
                                        >
                                            <PlayIcon className="h-4 w-4" />
                                            <span>Test</span>
                                        </button>
                                    )}
                                    {onView && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onView(idp.alias);
                                                setShowActions(false);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-400 transition-colors text-sm"
                                        >
                                            <EyeIcon className="h-4 w-4" />
                                            <span>View</span>
                                        </button>
                                    )}
                                    {onViewAnalytics && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onViewAnalytics(idp.alias);
                                                setShowActions(false);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-400 transition-colors text-sm"
                                        >
                                            <ChartBarIcon className="h-4 w-4" />
                                            <span>Analytics</span>
                                        </button>
                                    )}
                                    {onEdit && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEdit(idp.alias);
                                                setShowActions(false);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors text-sm"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                            <span>Edit</span>
                                        </button>
                                    )}
                                    {onDelete && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(idp.alias);
                                                setShowActions(false);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 transition-colors text-sm"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                            <span>Delete</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
