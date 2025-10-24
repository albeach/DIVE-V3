/**
 * IdP Health Indicator Component
 * 
 * Real-time status monitoring with:
 * - Pulse animations for online status
 * - Sparkline charts for uptime trends
 * - Error rate indicators
 * - Last checked timestamp with countdown
 * - Expandable detailed metrics
 * 
 * Phase 2.2: Modern UI Components
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    ChevronDownIcon,
    ChevronUpIcon
} from '@heroicons/react/24/outline';

// ============================================
// Types
// ============================================

export type HealthStatus = 'online' | 'offline' | 'degraded';

interface IdPHealthIndicatorProps {
    alias: string;
    status: HealthStatus;
    uptime: number; // percentage
    lastChecked?: Date;
    nextCheckIn?: number; // seconds
    errorRate?: number; // percentage
    responseTime?: number; // milliseconds
    uptimeHistory?: number[]; // last 24 hours (array of percentages)
    onRefresh?: () => void;
}

// ============================================
// Component
// ============================================

export default function IdPHealthIndicator({
    alias,
    status,
    uptime,
    lastChecked,
    nextCheckIn = 300, // 5 minutes default
    errorRate = 0,
    responseTime = 0,
    uptimeHistory = [],
    onRefresh
}: IdPHealthIndicatorProps) {
    const [expanded, setExpanded] = useState(false);
    const [countdown, setCountdown] = useState(nextCheckIn);

    // Countdown timer
    useEffect(() => {
        const interval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    if (onRefresh) onRefresh();
                    return nextCheckIn;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [nextCheckIn, onRefresh]);

    const statusConfig = {
        online: {
            color: 'text-green-500',
            bgColor: 'bg-green-500',
            label: 'Online',
            icon: CheckCircleIcon
        },
        offline: {
            color: 'text-red-500',
            bgColor: 'bg-red-500',
            label: 'Offline',
            icon: XCircleIcon
        },
        degraded: {
            color: 'text-yellow-500',
            bgColor: 'bg-yellow-500',
            label: 'Degraded',
            icon: ExclamationTriangleIcon
        }
    };

    const config = statusConfig[status];
    const StatusIcon = config.icon;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            layout
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
        >
            {/* Header - Always Visible */}
            <div className="p-4">
                <div className="flex items-center justify-between">
                    {/* Status Indicator */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <StatusIcon className={`h-8 w-8 ${config.color}`} />
                            {/* Pulse animation for online status */}
                            {status === 'online' && (
                                <span className="absolute inset-0 animate-ping">
                                    <StatusIcon className={`h-8 w-8 ${config.color} opacity-75`} />
                                </span>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${config.color}`}>
                                    {config.label}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {uptime.toFixed(1)}% uptime
                                </span>
                            </div>
                            {lastChecked && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    <ClockIcon className="h-3 w-3" />
                                    <span>
                                        Last checked: {lastChecked.toLocaleTimeString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Uptime Sparkline */}
                    {uptimeHistory.length > 0 && (
                        <div className="hidden sm:block">
                            <Sparkline data={uptimeHistory} width={100} height={40} color={config.bgColor} />
                        </div>
                    )}

                    {/* Countdown & Expand Button */}
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Next check</div>
                            <div className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-300">
                                {formatTime(countdown)}
                            </div>
                        </div>
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            {expanded ? (
                                <ChevronUpIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            ) : (
                                <ChevronDownIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-gray-200 dark:border-gray-700"
                    >
                        <div className="p-4 bg-gray-50 dark:bg-gray-900/50">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {/* Error Rate */}
                                <div className="text-center p-3 rounded-lg bg-white dark:bg-gray-800">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        Error Rate
                                    </div>
                                    <div className={`text-xl font-bold ${
                                        errorRate > 5 ? 'text-red-600' : errorRate > 1 ? 'text-yellow-600' : 'text-green-600'
                                    }`}>
                                        {errorRate.toFixed(2)}%
                                    </div>
                                </div>

                                {/* Response Time */}
                                <div className="text-center p-3 rounded-lg bg-white dark:bg-gray-800">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        Avg Response
                                    </div>
                                    <div className={`text-xl font-bold ${
                                        responseTime > 1000 ? 'text-red-600' : responseTime > 500 ? 'text-yellow-600' : 'text-green-600'
                                    }`}>
                                        {responseTime}ms
                                    </div>
                                </div>

                                {/* Uptime Percentage */}
                                <div className="text-center p-3 rounded-lg bg-white dark:bg-gray-800 col-span-2 sm:col-span-1">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        24h Uptime
                                    </div>
                                    <div className="text-xl font-bold text-blue-600">
                                        {uptime.toFixed(3)}%
                                    </div>
                                </div>
                            </div>

                            {/* Error Log Preview */}
                            {errorRate > 0 && (
                                <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                    <div className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2">
                                        Recent Errors
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-xs text-red-600 dark:text-red-300 font-mono">
                                            • Connection timeout (5 min ago)
                                        </div>
                                        <div className="text-xs text-red-600 dark:text-red-300 font-mono">
                                            • SSL handshake failed (12 min ago)
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ============================================
// Sparkline Component
// ============================================

interface SparklineProps {
    data: number[];
    width: number;
    height: number;
    color: string;
}

function Sparkline({ data, width, height, color }: SparklineProps) {
    if (data.length === 0) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="opacity-75">
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={color.replace('bg-', 'text-')}
            />
            {/* Fill area under line */}
            <polygon
                points={`0,${height} ${points} ${width},${height}`}
                className={`${color.replace('bg-', 'text-')} opacity-20`}
            />
        </svg>
    );
}

