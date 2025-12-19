'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

// ============================================
// Types
// ============================================

type StepStatus = 'COMPLETE' | 'IN_PROGRESS' | 'PENDING' | 'FAILED';

interface KASFlowStep {
    name: string;
    status: StepStatus;
    timestamp: string | null;
    details: string;
    opaDecision?: {
        allow: boolean;
        obligations: Array<{ type: string; resourceId: string }>;
    };
    kasUrl?: string | null;
    policyCheck?: {
        clearanceCheck: 'PASS' | 'FAIL';
        releasabilityCheck: 'PASS' | 'FAIL';
        coiCheck: 'PASS' | 'FAIL';
    } | null;
}

interface KASFlowData {
    resourceId: string;
    encrypted: boolean;
    kasRequired: boolean;
    flow: {
        step1: KASFlowStep;
        step2: KASFlowStep;
        step3: KASFlowStep;
        step4: KASFlowStep;
        step5: KASFlowStep;
        step6: KASFlowStep;
    };
    kaoDetails: {
        kaoId: string;
        kasUrl: string;
        policyBinding: {
            clearanceRequired: string;
            countriesAllowed: string[];
            coiRequired: string[];
        };
    } | null;
}

interface KASFlowVisualizerProps {
    resourceId: string;
}

// ============================================
// Status Icons and Colors
// ============================================

const statusIcons: Record<StepStatus, string> = {
    COMPLETE: '✅',
    IN_PROGRESS: '⏳',
    PENDING: '⏸️',
    FAILED: '❌'
};

const statusColors: Record<StepStatus, string> = {
    COMPLETE: 'bg-green-50 border-green-200 text-green-800',
    IN_PROGRESS: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    PENDING: 'bg-gray-50 border-gray-200 text-gray-600',
    FAILED: 'bg-red-50 border-red-200 text-red-800'
};

const statusLabels: Record<StepStatus, string> = {
    COMPLETE: 'COMPLETE',
    IN_PROGRESS: 'IN PROGRESS',
    PENDING: 'PENDING',
    FAILED: 'FAILED'
};

// Educational tooltips for each step
const stepTooltips: Record<number, string> = {
    1: 'You clicked to access an encrypted document. This initiates the secure access flow.',
    2: 'The Policy Engine (OPA) checks if you have permission to see this document based on your clearance, country, and COI.',
    3: 'Your browser contacts the Key Access Service (KAS) and requests the decryption key for this specific document.',
    4: 'KAS independently re-checks your permissions (defense in depth). It verifies your clearance ≥ classification, your country is in releasability list, and your COI matches requirements.',
    5: 'KAS releases the Data Encryption Key (DEK) to your browser only if all policy checks pass.',
    6: 'Your browser uses the released DEK to decrypt the encrypted content locally and displays it to you.'
};

// ============================================
// Component
// ============================================

export default function KASFlowVisualizer({ resourceId }: KASFlowVisualizerProps) {
    const { data: session } = useSession();
    const [flowData, setFlowData] = useState<KASFlowData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [polling, setPolling] = useState<boolean>(false);
    const [showingCachedFlow, setShowingCachedFlow] = useState<boolean>(false);

    // Fetch KAS flow data
    const fetchFlowData = async () => {
        // First check sessionStorage for completed flow
        try {
            const cachedFlow = sessionStorage.getItem(`kas-flow-${resourceId}`);
            if (cachedFlow) {
                const parsed = JSON.parse(cachedFlow);
                // Show cached completed flow
                setFlowData({
                    resourceId: parsed.resourceId,
                    encrypted: true,
                    kasRequired: true,
                    flow: {
                        step1: parsed.steps[0] || { name: 'Step 1', status: 'COMPLETE', timestamp: parsed.completedAt, details: 'Completed' },
                        step2: parsed.steps[1] || { name: 'Step 2', status: 'COMPLETE', timestamp: parsed.completedAt, details: 'Completed' },
                        step3: parsed.steps[2] || { name: 'Step 3', status: 'COMPLETE', timestamp: parsed.completedAt, details: 'Completed' },
                        step4: parsed.steps[3] || { name: 'Step 4', status: 'COMPLETE', timestamp: parsed.completedAt, details: 'Completed' },
                        step5: parsed.steps[4] || { name: 'Step 5', status: 'COMPLETE', timestamp: parsed.completedAt, details: 'Completed' },
                        step6: parsed.steps[5] || { name: 'Step 6', status: 'COMPLETE', timestamp: parsed.completedAt, details: 'Completed' }
                    },
                    kaoDetails: null
                });
                setShowingCachedFlow(true);
                setLoading(false);
                return;
            }
        } catch (e) {
            // If parsing fails, continue to fetch from API
            console.warn('Failed to load cached KAS flow:', e);
        }
        try {
            // Call frontend API route - handles auth and federation server-side
            // No need to pass token - session validation done server-side
            const response = await fetch(`/api/resources/${resourceId}/kas-flow`, {
                headers: {
                    'Content-Type': 'application/json'
                },
                cache: 'no-store',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }

            const data: KASFlowData = await response.json();
            setFlowData(data);
            setLoading(false);

            // Check if any step is IN_PROGRESS
            const steps = Object.values(data.flow);
            const hasInProgress = steps.some(step => step.status === 'IN_PROGRESS');
            setPolling(hasInProgress);

        } catch (err) {
            console.error('Failed to fetch KAS flow data:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            setLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchFlowData();
    }, [resourceId, session]);

    // Polling effect (every 2 seconds if in progress)
    useEffect(() => {
        if (!polling) return;

        const interval = setInterval(() => {
            fetchFlowData();
        }, 2000);

        return () => clearInterval(interval);
    }, [polling, resourceId, session]);

    // ============================================
    // Render
    // ============================================

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <p className="ml-4 text-gray-600">Loading KAS flow status...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <p className="text-red-800 font-semibold mb-2">⚠️ Failed to load KAS flow</p>
                <p className="text-red-600 text-sm">{error}</p>
            </div>
        );
    }

    if (!flowData) {
        return (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <p className="text-gray-600">No flow data available</p>
            </div>
        );
    }

    if (!flowData.kasRequired) {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                <p className="text-blue-800 font-semibold mb-2">ℹ️ KAS Not Required</p>
                <p className="text-blue-600 text-sm">
                    This resource does not require KAS mediation (not encrypted).
                </p>
            </div>
        );
    }

    const steps = [
        { key: 'step1', number: 1, data: flowData.flow.step1 },
        { key: 'step2', number: 2, data: flowData.flow.step2 },
        { key: 'step3', number: 3, data: flowData.flow.step3 },
        { key: 'step4', number: 4, data: flowData.flow.step4 },
        { key: 'step5', number: 5, data: flowData.flow.step5 },
        { key: 'step6', number: 6, data: flowData.flow.step6 }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-2">🔐 KAS-Mediated Access Flow</h2>
                <p className="text-blue-100">
                    Zero Trust Data Format (ZTDF) policy-driven key access service mediation
                </p>
            </div>

            {/* Flow Steps */}
            <div className="space-y-4">
                {steps.map(({ key, number, data }) => (
                    <div
                        key={key}
                        className={`border-2 rounded-lg p-5 transition-all duration-300 ${statusColors[data.status]}`}
                    >
                        <div className="flex items-start gap-4">
                            {/* Step Number and Icon */}
                            <div className="flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold">{number}.</span>
                                    <span className="text-3xl">{statusIcons[data.status]}</span>
                                </div>
                            </div>

                            {/* Step Content */}
                            <div className="flex-grow">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-semibold">{data.name}</h3>
                                    <span className="text-sm font-medium px-3 py-1 rounded-full bg-white/50">
                                        {statusLabels[data.status]}
                                    </span>
                                </div>

                                <p className="text-sm mb-2">{data.details}</p>

                                {/* Educational Tooltip */}
                                <div className="mt-2 p-2 bg-blue-50 border-l-4 border-blue-600 text-xs text-blue-800">
                                    <span className="font-semibold">💡 What's happening: </span>
                                    {stepTooltips[number]}
                                </div>

                                {/* Timestamp */}
                                {data.timestamp && (
                                    <p className="text-xs opacity-75">
                                        ⏰ {new Date(data.timestamp).toLocaleTimeString()}
                                    </p>
                                )}

                                {/* OPA Decision (Step 2) */}
                                {data.opaDecision && (
                                    <div className="mt-3 bg-white/50 rounded p-3 text-sm">
                                        <p className="font-medium">OPA Decision:</p>
                                        <p>
                                            Decision: <span className="font-semibold">{data.opaDecision.allow ? 'ALLOW' : 'DENY'}</span>
                                            {data.opaDecision.obligations && data.opaDecision.obligations.length > 0 && (
                                                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                                                    Requires KAS
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                )}

                                {/* KAS URL (Step 3) */}
                                {data.kasUrl && (
                                    <div className="mt-3 bg-white/50 rounded p-3 text-sm">
                                        <p className="font-medium">KAS URL:</p>
                                        <p className="font-mono text-xs">{data.kasUrl}</p>
                                    </div>
                                )}

                                {/* Policy Check Results (Step 4) */}
                                {data.policyCheck && (
                                    <div className="mt-3 bg-white/50 rounded p-3 text-sm space-y-1">
                                        <p className="font-medium mb-2">Policy Re-Evaluation Results:</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <span className={data.policyCheck.clearanceCheck === 'PASS' ? '✓' : '✗'}></span>
                                                <span className="ml-1">Clearance: {data.policyCheck.clearanceCheck}</span>
                                            </div>
                                            <div>
                                                <span className={data.policyCheck.releasabilityCheck === 'PASS' ? '✓' : '✗'}></span>
                                                <span className="ml-1">Releasability: {data.policyCheck.releasabilityCheck}</span>
                                            </div>
                                            <div>
                                                <span className={data.policyCheck.coiCheck === 'PASS' ? '✓' : '✗'}></span>
                                                <span className="ml-1">COI: {data.policyCheck.coiCheck}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* KAO Details */}
            {flowData.kaoDetails && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">🔑 Key Access Object (KAO) Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="font-medium text-gray-600">KAO ID:</p>
                            <p className="font-mono text-xs bg-white px-2 py-1 rounded">
                                {flowData.kaoDetails.kaoId}
                            </p>
                        </div>
                        <div>
                            <p className="font-medium text-gray-600">KAS URL:</p>
                            <p className="font-mono text-xs bg-white px-2 py-1 rounded">
                                {flowData.kaoDetails.kasUrl}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4">
                        <p className="font-medium text-gray-600 mb-2">Policy Binding:</p>
                        <div className="bg-white rounded-lg p-4 space-y-2 text-sm">
                            <div>
                                <span className="font-medium">Clearance Required:</span>
                                <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                                    {flowData.kaoDetails.policyBinding.clearanceRequired}
                                </span>
                            </div>
                            <div>
                                <span className="font-medium">Countries Allowed:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {flowData.kaoDetails.policyBinding.countriesAllowed.map((country) => (
                                        <span
                                            key={country}
                                            className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                                        >
                                            {country}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <span className="font-medium">COI Required:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {flowData.kaoDetails.policyBinding.coiRequired.length > 0 ? (
                                        flowData.kaoDetails.policyBinding.coiRequired.map((coi) => (
                                            <span
                                                key={coi}
                                                className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs"
                                            >
                                                {coi}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-gray-500 text-xs">None</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Cached Flow Notice */}
            {showingCachedFlow && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">✅</span>
                            <div>
                                <p className="text-green-800 font-semibold">Showing Completed Key Request</p>
                                <p className="text-green-700 text-sm">
                                    This shows your most recent successful key request for this resource. 
                                    The flow completed and content was decrypted.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                sessionStorage.removeItem(`kas-flow-${resourceId}`);
                                setShowingCachedFlow(false);
                                fetchFlowData();
                            }}
                            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Clear History
                        </button>
                    </div>
                </div>
            )}

            {/* Polling Indicator */}
            {polling && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                        <p className="text-yellow-800 text-sm font-medium">
                            Live updates enabled - refreshing every 2 seconds
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
