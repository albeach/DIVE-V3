/**
 * SLA Countdown Component
 * 
 * Real-time countdown to SLA deadline with status indicators
 * Phase 2: Fast-track (2hr), Standard (24hr), Detailed (72hr)
 */

'use client';

import React, { useState, useEffect } from 'react';

interface SLACountdownProps {
    slaDeadline: string; // ISO 8601
    slaStatus: 'within' | 'approaching' | 'exceeded';
    action: 'auto-approve' | 'fast-track' | 'standard-review' | 'detailed-review' | 'auto-reject';
}

export default function SLACountdown({ slaDeadline, slaStatus, action }: SLACountdownProps) {
    const [timeRemaining, setTimeRemaining] = useState('');
    const [status, setStatus] = useState(slaStatus);

    useEffect(() => {
        const updateCountdown = () => {
            const deadline = new Date(slaDeadline);
            const now = new Date();
            const diff = deadline.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeRemaining('EXCEEDED');
                setStatus('exceeded');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);

            // Update status based on time remaining
            if (hours < 1) {
                setStatus('approaching');
            } else {
                setStatus('within');
            }
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [slaDeadline]);

    const statusConfig = {
        within: {
            bg: 'bg-green-50',
            text: 'text-green-700',
            border: 'border-green-200',
            icon: '✅',
            label: 'Within SLA'
        },
        approaching: {
            bg: 'bg-yellow-50',
            text: 'text-yellow-700',
            border: 'border-yellow-200',
            icon: '⚠️',
            label: 'SLA Approaching'
        },
        exceeded: {
            bg: 'bg-red-50',
            text: 'text-red-700',
            border: 'border-red-200',
            icon: '🚨',
            label: 'SLA EXCEEDED'
        }
    };

    const config = statusConfig[status];

    // Don't show countdown for auto-approve/auto-reject
    if (action === 'auto-approve' || action === 'auto-reject') {
        return null;
    }

    const actionLabels = {
        'fast-track': '⚡ Fast-Track (2hr SLA)',
        'standard-review': '📋 Standard Review (24hr SLA)',
        'detailed-review': '🔍 Detailed Review (72hr SLA)',
        'auto-approve': '',
        'auto-reject': ''
    };

    return (
        <div className={`rounded-lg border ${config.border} ${config.bg} p-4 space-y-3`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xl">{config.icon}</span>
                    <span className={`font-semibold ${config.text}`}>
                        {config.label}
                    </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {actionLabels[action]}
                </span>
            </div>

            <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                    Time Remaining:
                </span>
                <span className={`text-2xl font-mono font-bold ${config.text}`}>
                    {timeRemaining}
                </span>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
                Deadline: {new Date(slaDeadline).toLocaleString()}
            </div>

            {status === 'exceeded' && (
                <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/20 rounded text-sm text-red-800 dark:text-red-300">
                    🚨 SLA deadline has been exceeded. Immediate action required.
                </div>
            )}
        </div>
    );
}

