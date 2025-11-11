/**
 * IdP MFA Configuration Panel Component
 * 
 * MFA settings management with:
 * - Toggle switches for MFA requirements
 * - Conditional MFA based on clearance levels
 * - OTP configuration (algorithm, digits, period)
 * - Live preview of MFA rules
 * - Test MFA flow button
 * - Save/Cancel with loading states
 * 
 * Phase 2.7: Modern UI Components
 */

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    ShieldCheckIcon,
    CheckCircleIcon,
    XCircleIcon,
    PlayIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';
import { useMFAConfig, useUpdateMFAConfig } from '@/lib/api/idp-management';

// ============================================
// Types
// ============================================

interface IdPMFAConfigPanelProps {
    idpAlias: string;
}

type OTPAlgorithm = 'HmacSHA1' | 'HmacSHA256' | 'HmacSHA512';
type ClearanceLevel = 'UNCLASSIFIED' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';

interface MFAConfig {
    required: boolean;
    otp: {
        type: 'totp' | 'hotp';
        algorithm: OTPAlgorithm;
        digits: 6 | 8;
        period: number;
    };
    conditionalMFA?: {
        enabled: boolean;
        clearanceLevels: ClearanceLevel[];
    };
}

// ============================================
// Component
// ============================================

export default function IdPMFAConfigPanel({ idpAlias }: IdPMFAConfigPanelProps) {
    const { data: currentConfig, isLoading } = useMFAConfig(idpAlias);
    const updateMFAMutation = useUpdateMFAConfig();

    const [config, setConfig] = useState<MFAConfig>({
        required: false,
        otp: {
            type: 'totp',
            algorithm: 'HmacSHA256',
            digits: 6,
            period: 30
        },
        conditionalMFA: {
            enabled: false,
            clearanceLevels: []
        }
    });

    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        if (currentConfig) {
            setConfig(currentConfig);
        }
    }, [currentConfig]);

    const handleSave = async () => {
        try {
            await updateMFAMutation.mutateAsync({ alias: idpAlias, config });
            setHasChanges(false);
            alert('MFA configuration saved successfully!');
        } catch (error) {
            console.error('Failed to save MFA config:', error);
            alert('Failed to save MFA configuration. Please try again.');
        }
    };

    const handleCancel = () => {
        if (currentConfig) {
            setConfig(currentConfig);
        }
        setHasChanges(false);
    };

    const updateConfig = (updates: Partial<MFAConfig>) => {
        setConfig(prev => ({ ...prev, ...updates }));
        setHasChanges(true);
    };

    const toggleClearanceLevel = (level: ClearanceLevel) => {
        setConfig(prev => {
            const clearanceLevels = prev.conditionalMFA?.clearanceLevels || [];
            const newLevels = clearanceLevels.includes(level)
                ? clearanceLevels.filter(l => l !== level)
                : [...clearanceLevels, level];
            
            return {
                ...prev,
                conditionalMFA: {
                    ...prev.conditionalMFA,
                    enabled: prev.conditionalMFA?.enabled || false,
                    clearanceLevels: newLevels
                }
            };
        });
        setHasChanges(true);
    };

    if (isLoading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <ShieldCheckIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Multi-Factor Authentication
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Configure MFA requirements for this Identity Provider
                    </p>
                </div>
            </div>

            {/* Main MFA Toggle */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <label className="text-sm font-medium text-gray-900 dark:text-white">
                            Require MFA for all users
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            All users must configure and use multi-factor authentication
                        </p>
                    </div>
                    <ToggleSwitch
                        enabled={config.required}
                        onChange={(enabled) => updateConfig({ required: enabled })}
                    />
                </div>
            </div>

            {/* Conditional MFA Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <label className="text-sm font-medium text-gray-900 dark:text-white">
                            Conditional MFA (Clearance-Based)
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Require MFA only for users with specific clearance levels
                        </p>
                    </div>
                    <ToggleSwitch
                        enabled={config.conditionalMFA?.enabled || false}
                        onChange={(enabled) => updateConfig({
                            conditionalMFA: { ...config.conditionalMFA, enabled, clearanceLevels: config.conditionalMFA?.clearanceLevels || [] }
                        })}
                    />
                </div>

                {/* Clearance Level Selector */}
                {config.conditionalMFA?.enabled && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-2"
                    >
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            Select Clearance Levels
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'] as ClearanceLevel[]).map((level) => (
                                <button
                                    key={level}
                                    onClick={() => toggleClearanceLevel(level)}
                                    className={`
                                        px-4 py-2 rounded-lg text-sm font-medium transition-all
                                        ${config.conditionalMFA?.clearanceLevels.includes(level)
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}
                                    `}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* OTP Configuration */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    OTP Settings
                </h4>

                {/* Algorithm */}
                <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Algorithm
                    </label>
                    <select
                        value={config.otp.algorithm}
                        onChange={(e) => updateConfig({
                            otp: { ...config.otp, algorithm: e.target.value as OTPAlgorithm }
                        })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                    >
                        <option value="HmacSHA1">HmacSHA1 (Legacy)</option>
                        <option value="HmacSHA256">HmacSHA256 (Recommended)</option>
                        <option value="HmacSHA512">HmacSHA512 (High Security)</option>
                    </select>
                </div>

                {/* Digits */}
                <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Code Length
                    </label>
                    <div className="flex gap-4">
                        <button
                            onClick={() => updateConfig({ otp: { ...config.otp, digits: 6 } })}
                            className={`
                                flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                                ${config.otp.digits === 6
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}
                            `}
                        >
                            6 Digits
                        </button>
                        <button
                            onClick={() => updateConfig({ otp: { ...config.otp, digits: 8 } })}
                            className={`
                                flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                                ${config.otp.digits === 8
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}
                            `}
                        >
                            8 Digits
                        </button>
                    </div>
                </div>

                {/* Time Period */}
                <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Time Period (seconds): {config.otp.period}
                    </label>
                    <input
                        type="range"
                        min="10"
                        max="60"
                        step="5"
                        value={config.otp.period}
                        onChange={(e) => updateConfig({
                            otp: { ...config.otp, period: parseInt(e.target.value) }
                        })}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>10s</span>
                        <span>30s (Recommended)</span>
                        <span>60s</span>
                    </div>
                </div>
            </div>

            {/* Live Preview */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
                <div className="flex items-start gap-3">
                    <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                        <p className="font-medium mb-1">MFA Rule Preview:</p>
                        <p>
                            {config.required && !config.conditionalMFA?.enabled && (
                                "All users will be required to configure MFA during login."
                            )}
                            {!config.required && config.conditionalMFA?.enabled && config.conditionalMFA.clearanceLevels.length > 0 && (
                                `Users with ${config.conditionalMFA.clearanceLevels.join(', ')} clearance will be prompted for MFA.`
                            )}
                            {!config.required && (!config.conditionalMFA?.enabled || config.conditionalMFA.clearanceLevels.length === 0) && (
                                "MFA is currently optional for all users."
                            )}
                            {config.required && config.conditionalMFA?.enabled && (
                                "Global MFA requirement overrides conditional settings."
                            )}
                        </p>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    onClick={() => alert('MFA test functionality coming soon!')}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                >
                    <PlayIcon className="h-4 w-4" />
                    Test MFA Flow
                </button>

                <div className="flex items-center gap-3">
                    {hasChanges && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Unsaved changes
                        </span>
                    )}
                    <button
                        onClick={handleCancel}
                        disabled={!hasChanges}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasChanges || updateMFAMutation.isPending}
                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {updateMFAMutation.isPending ? (
                            <>
                                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <CheckCircleIcon className="h-4 w-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================
// Toggle Switch Component
// ============================================

interface ToggleSwitchProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
    return (
        <button
            onClick={() => onChange(!enabled)}
            className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}
            `}
        >
            <span
                className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${enabled ? 'translate-x-6' : 'translate-x-1'}
                `}
            />
        </button>
    );
}

// ============================================
// Loading Skeleton Component
// ============================================

function LoadingSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64" />
            <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
    );
}

