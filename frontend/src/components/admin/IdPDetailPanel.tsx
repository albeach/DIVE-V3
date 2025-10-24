/**
 * IdP Detail Panel - Functional Implementation
 * 
 * Provides actual IdP management:
 * - Enable/Disable IdP
 * - View configuration
 * - Edit display name
 * - Test connection
 * - View basic stats
 */

'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    XMarkIcon,
    CheckCircleIcon,
    XCircleIcon,
    PencilIcon,
    BeakerIcon,
    InformationCircleIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { useIdP, useUpdateIdP, useTestIdP } from '@/lib/api/idp-management';

interface IdPDetailPanelProps {
    idpAlias: string;
    onClose: () => void;
    onUpdate?: () => void;
}

export default function IdPDetailPanel({ idpAlias, onClose, onUpdate }: IdPDetailPanelProps) {
    const { data: idp, isLoading, refetch } = useIdP(idpAlias);
    const updateIdPMutation = useUpdateIdP();
    const testIdPMutation = useTestIdP();
    
    const [isEditing, setIsEditing] = useState(false);
    const [editedDisplayName, setEditedDisplayName] = useState('');
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    React.useEffect(() => {
        if (idp?.displayName) {
            setEditedDisplayName(idp.displayName);
        }
    }, [idp]);

    const handleToggleEnabled = async () => {
        if (!idp) return;
        
        try {
            await updateIdPMutation.mutateAsync({
                alias: idpAlias,
                updates: { enabled: !idp.enabled }
            });
            await refetch();
            if (onUpdate) onUpdate();
        } catch (error) {
            alert('Failed to update IdP status');
        }
    };

    const handleSaveDisplayName = async () => {
        try {
            await updateIdPMutation.mutateAsync({
                alias: idpAlias,
                updates: { displayName: editedDisplayName }
            });
            await refetch();
            setIsEditing(false);
            if (onUpdate) onUpdate();
        } catch (error) {
            alert('Failed to update display name');
        }
    };

    const handleTest = async () => {
        setTestResult(null);
        try {
            const result = await testIdPMutation.mutateAsync(idpAlias);
            setTestResult(result);
        } catch (error) {
            setTestResult({
                success: false,
                message: 'Connection test failed'
            });
        }
    };

    if (isLoading) {
        return (
            <PanelContainer onClose={onClose}>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
                </div>
            </PanelContainer>
        );
    }

    if (!idp) {
        return (
            <PanelContainer onClose={onClose}>
                <div className="text-center py-12">
                    <p className="text-gray-500">IdP not found</p>
                </div>
            </PanelContainer>
        );
    }

    return (
        <PanelContainer onClose={onClose}>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                    {isEditing ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={editedDisplayName}
                                onChange={(e) => setEditedDisplayName(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                            />
                            <button
                                onClick={handleSaveDisplayName}
                                disabled={updateIdPMutation.isPending}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditedDisplayName(idp.displayName);
                                }}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                {idp.displayName}
                            </h2>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title="Edit display name"
                            >
                                <PencilIcon className="h-5 w-5" />
                            </button>
                        </div>
                    )}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Alias: <code className="px-2 py-0.5 bg-gray-100 dark:bg-gray-900 rounded">{idp.alias}</code>
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </div>

            {/* Status Section */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {idp.enabled ? (
                            <CheckCircleIcon className="h-6 w-6 text-green-500" />
                        ) : (
                            <XCircleIcon className="h-6 w-6 text-gray-400" />
                        )}
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                                {idp.enabled ? 'Enabled' : 'Disabled'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {idp.enabled ? 'Users can authenticate' : 'Users cannot authenticate'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleToggleEnabled}
                        disabled={updateIdPMutation.isPending}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                            idp.enabled
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                        }`}
                    >
                        {idp.enabled ? 'Disable' : 'Enable'}
                    </button>
                </div>
            </div>

            {/* Configuration */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <InformationCircleIcon className="h-5 w-5 text-purple-600" />
                    Configuration
                </h3>
                <div className="space-y-3">
                    <ConfigRow label="Protocol" value={idp.protocol?.toUpperCase() || 'N/A'} />
                    <ConfigRow label="Provider ID" value={idp.providerId || 'N/A'} />
                    <ConfigRow 
                        label="Status" 
                        value={idp.status || (idp.enabled ? 'active' : 'disabled')} 
                    />
                    {idp.config?.issuer && (
                        <ConfigRow label="Issuer" value={idp.config.issuer} mono />
                    )}
                    {idp.config?.authorizationUrl && (
                        <ConfigRow label="Authorization URL" value={idp.config.authorizationUrl} mono />
                    )}
                    {idp.config?.tokenUrl && (
                        <ConfigRow label="Token URL" value={idp.config.tokenUrl} mono />
                    )}
                </div>
            </div>

            {/* Connection Test */}
            <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <BeakerIcon className="h-5 w-5 text-purple-600" />
                    Connection Test
                </h3>
                <button
                    onClick={handleTest}
                    disabled={testIdPMutation.isPending}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {testIdPMutation.isPending ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                            Testing Connection...
                        </>
                    ) : (
                        <>
                            <BeakerIcon className="h-5 w-5" />
                            Test Connection
                        </>
                    )}
                </button>

                {testResult && (
                    <div className={`mt-4 p-4 rounded-lg border ${
                        testResult.success
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    }`}>
                        <div className="flex items-start gap-3">
                            {testResult.success ? (
                                <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                            ) : (
                                <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className={`font-semibold ${
                                    testResult.success
                                        ? 'text-green-800 dark:text-green-300'
                                        : 'text-red-800 dark:text-red-300'
                                }`}>
                                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                                </p>
                                <p className={`text-sm mt-1 ${
                                    testResult.success
                                        ? 'text-green-700 dark:text-green-400'
                                        : 'text-red-700 dark:text-red-400'
                                }`}>
                                    {testResult.message}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Advanced Settings Note */}
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                    <Cog6ToothIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                            Advanced Settings
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                            MFA configuration, session management, and theme customization are available through the Keycloak admin console.
                        </p>
                        <a
                            href={`${process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8081'}/admin`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
                        >
                            Open Keycloak Console →
                        </a>
                    </div>
                </div>
            </div>
        </PanelContainer>
    );
}

// Helper Components

function PanelContainer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
        >
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-2xl overflow-y-auto"
            >
                <div className="p-6">
                    {children}
                </div>
            </motion.div>
        </motion.div>
    );
}

function ConfigRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-start justify-between py-2 border-b border-gray-200 dark:border-gray-700 last:border-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
            <span className={`text-sm text-gray-600 dark:text-gray-400 text-right max-w-md break-all ${mono ? 'font-mono text-xs' : ''}`}>
                {value}
            </span>
        </div>
    );
}

