/**
 * IdP Detail Modal Component
 * 
 * Comprehensive IdP details with tabbed interface:
 * - Overview Tab: Health, metrics, config summary
 * - MFA Tab: MFA configuration panel
 * - Sessions Tab: Active session viewer
 * - Theme Tab: Theme editor
 * - Activity Tab: Timeline of recent events
 * 
 * Phase 3.2: Enhanced Detail Modal
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XMarkIcon,
    InformationCircleIcon,
    ShieldCheckIcon,
    UsersIcon,
    SwatchIcon,
    ClockIcon
} from '@heroicons/react/24/outline';
import IdPHealthIndicator from './IdPHealthIndicator';
import IdPMFAConfigPanel from './IdPMFAConfigPanel';
import IdPSessionViewer from './IdPSessionViewer';
import IdPThemeEditor from './IdPThemeEditor';
import { useIdP } from '@/lib/api/idp-management';

// ============================================
// Types
// ============================================

interface IdPDetailModalProps {
    idpAlias: string;
    onClose: () => void;
}

type TabId = 'overview' | 'mfa' | 'sessions' | 'theme' | 'activity';

interface Tab {
    id: TabId;
    label: string;
    icon: React.ComponentType<any>;
}

// ============================================
// Component
// ============================================

export default function IdPDetailModal({ idpAlias, onClose }: IdPDetailModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const { data: idp, isLoading } = useIdP(idpAlias);

    const tabs: Tab[] = [
        { id: 'overview', label: 'Overview', icon: InformationCircleIcon },
        { id: 'mfa', label: 'MFA', icon: ShieldCheckIcon },
        { id: 'sessions', label: 'Sessions', icon: UsersIcon },
        { id: 'theme', label: 'Theme', icon: SwatchIcon },
        { id: 'activity', label: 'Activity', icon: ClockIcon }
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {idp?.displayName || idpAlias}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {idpAlias} • {idp?.protocol?.toUpperCase() || 'Loading...'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <nav className="flex px-6">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                                        ${isActive
                                            ? 'text-purple-600 dark:text-purple-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}
                                    `}
                                >
                                    <Icon className="h-5 w-5" />
                                    {tab.label}
                                    
                                    {/* Active Indicator */}
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400"
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <LoadingSkeleton />
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                {activeTab === 'overview' && (
                                    <OverviewTab idp={idp} idpAlias={idpAlias} />
                                )}

                                {activeTab === 'mfa' && (
                                    <IdPMFAConfigPanel idpAlias={idpAlias} />
                                )}

                                {activeTab === 'sessions' && (
                                    <IdPSessionViewer idpAlias={idpAlias} />
                                )}

                                {activeTab === 'theme' && (
                                    <IdPThemeEditor idpAlias={idpAlias} />
                                )}

                                {activeTab === 'activity' && (
                                    <ActivityTab idpAlias={idpAlias} />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ============================================
// Overview Tab
// ============================================

interface OverviewTabProps {
    idp: any;
    idpAlias: string;
}

function OverviewTab({ idp, idpAlias }: OverviewTabProps) {
    return (
        <div className="space-y-6">
            {/* Health Indicator */}
            <IdPHealthIndicator
                alias={idpAlias}
                status="online"
                uptime={99.8}
                lastChecked={new Date()}
                nextCheckIn={300}
                errorRate={0.2}
                responseTime={145}
                uptimeHistory={[98, 99, 99.5, 99.8, 99.9, 99.8, 99.7, 99.8]}
            />

            {/* Protocol Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Protocol Configuration
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Protocol</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {idp?.protocol?.toUpperCase() || 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {idp?.enabled ? '✅ Enabled' : '⭕ Disabled'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Created</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {idp?.createdAt ? new Date(idp.createdAt).toLocaleDateString() : 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Submitted By</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {idp?.submittedBy || 'N/A'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Attribute Mappings */}
            {idp?.attributeMappings && (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Attribute Mappings
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(idp.attributeMappings).map(([key, value]: [string, any]) => (
                            <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {key}
                                </span>
                                <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                                    {value?.claim || value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// Activity Tab
// ============================================

function ActivityTab({ idpAlias }: { idpAlias: string }) {
    const events = [
        { time: '2 hours ago', type: 'test', message: 'IdP connection test passed' },
        { time: '5 hours ago', type: 'login', message: 'User authentication successful' },
        { time: '1 day ago', type: 'config', message: 'MFA configuration updated' },
        { time: '2 days ago', type: 'login', message: 'User authentication successful' },
        { time: '3 days ago', type: 'test', message: 'IdP connection test passed' }
    ];

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Recent Activity
            </h3>

            <div className="space-y-3">
                {events.map((event, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
                    >
                        <div className={`
                            p-2 rounded-full
                            ${event.type === 'test' ? 'bg-blue-100 dark:bg-blue-900/30' : ''}
                            ${event.type === 'login' ? 'bg-green-100 dark:bg-green-900/30' : ''}
                            ${event.type === 'config' ? 'bg-purple-100 dark:bg-purple-900/30' : ''}
                        `}>
                            <div className={`h-2 w-2 rounded-full
                                ${event.type === 'test' ? 'bg-blue-600' : ''}
                                ${event.type === 'login' ? 'bg-green-600' : ''}
                                ${event.type === 'config' ? 'bg-purple-600' : ''}
                            `} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-900 dark:text-white font-medium">
                                {event.message}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {event.time}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

// ============================================
// Loading Skeleton
// ============================================

function LoadingSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
    );
}
