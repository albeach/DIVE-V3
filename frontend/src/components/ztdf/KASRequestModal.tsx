'use client';

import { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { useSession } from 'next-auth/react';

// ============================================
// Types
// ============================================

type StepStatus = 'COMPLETE' | 'IN_PROGRESS' | 'PENDING' | 'FAILED';

interface KASRequestStep {
    name: string;
    status: StepStatus;
    timestamp: string | null;
    details: string;
}

interface PolicyCheckDetails {
    clearanceCheck: 'PASS' | 'FAIL';
    releasabilityCheck: 'PASS' | 'FAIL';
    coiCheck: 'PASS' | 'FAIL';
    policyBinding: {
        required: {
            clearance: string;
            countries: string[];
            coi: string[];
        };
        provided: {
            clearance: string;
            country: string;
            coi: string[];
        };
    };
}

interface KASRequestModalProps {
    resourceId: string;
    kaoId: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (content: string) => void;
    onFailure: (reason: string, details?: PolicyCheckDetails) => void;
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
    COMPLETE: 'text-green-600',
    IN_PROGRESS: 'text-yellow-600',
    PENDING: 'text-gray-400',
    FAILED: 'text-red-600'
};

// ============================================
// Component
// ============================================

export default function KASRequestModal({
    resourceId,
    kaoId,
    isOpen,
    onClose,
    onSuccess,
    onFailure
}: KASRequestModalProps) {
    const { data: session } = useSession();
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [steps, setSteps] = useState<KASRequestStep[]>([
        { name: 'Resource Access Request', status: 'PENDING', timestamp: null, details: 'Initiating request...' },
        { name: 'Policy Evaluation', status: 'PENDING', timestamp: null, details: 'Checking OPA authorization...' },
        { name: 'Key Request to KAS', status: 'PENDING', timestamp: null, details: 'Contacting KAS...' },
        { name: 'KAS Policy Re-evaluation', status: 'PENDING', timestamp: null, details: 'Awaiting policy check...' },
        { name: 'Key Release', status: 'PENDING', timestamp: null, details: 'Awaiting key release...' },
        { name: 'Content Decryption', status: 'PENDING', timestamp: null, details: 'Ready to decrypt...' }
    ]);
    const [error, setError] = useState<string | null>(null);
    const [policyCheckDetails, setPolicyCheckDetails] = useState<PolicyCheckDetails | null>(null);
    const [isDismissible, setIsDismissible] = useState<boolean>(false);

    // Update step status helper
    const updateStep = (index: number, status: StepStatus, details: string) => {
        setSteps(prev => {
            const newSteps = [...prev];
            newSteps[index] = {
                ...newSteps[index],
                status,
                timestamp: status === 'COMPLETE' || status === 'FAILED' ? new Date().toISOString() : newSteps[index].timestamp,
                details
            };
            return newSteps;
        });
    };

    // Execute KAS request when modal opens
    useEffect(() => {
        if (!isOpen) return;
        if (!session) return;

        // Reset state
        setCurrentStep(0);
        setError(null);
        setPolicyCheckDetails(null);
        setIsDismissible(false);
        setSteps([
            { name: 'Resource Access Request', status: 'PENDING', timestamp: null, details: 'Initiating request...' },
            { name: 'Policy Evaluation', status: 'PENDING', timestamp: null, details: 'Checking OPA authorization...' },
            { name: 'Key Request to KAS', status: 'PENDING', timestamp: null, details: 'Contacting KAS...' },
            { name: 'KAS Policy Re-evaluation', status: 'PENDING', timestamp: null, details: 'Awaiting policy check...' },
            { name: 'Key Release', status: 'PENDING', timestamp: null, details: 'Awaiting key release...' },
            { name: 'Content Decryption', status: 'PENDING', timestamp: null, details: 'Ready to decrypt...' }
        ]);

        // Start the KAS request flow
        const executeKASRequest = async () => {
            try {
                const token = (session as any)?.accessToken;
                if (!token) {
                    throw new Error('Authentication required');
                }

                // Step 1: Resource Access Request
                setCurrentStep(1);
                updateStep(0, 'IN_PROGRESS', 'Requesting access to encrypted resource...');
                await new Promise(resolve => setTimeout(resolve, 300)); // Simulate delay
                updateStep(0, 'COMPLETE', 'Access request initiated');

                // Step 2: Policy Evaluation
                setCurrentStep(2);
                updateStep(1, 'IN_PROGRESS', 'Evaluating OPA policy...');
                await new Promise(resolve => setTimeout(resolve, 300));
                updateStep(1, 'COMPLETE', 'OPA detected KAS obligation - Decision: ALLOW (requires KAS)');

                // Step 3: Key Request to KAS
                setCurrentStep(3);
                updateStep(2, 'IN_PROGRESS', 'Contacting KAS at localhost:8080...');

                // Make actual KAS request
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
                const response = await fetch(`${backendUrl}/api/resources/request-key`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ resourceId, kaoId })
                });

                const data = await response.json();

                if (!response.ok) {
                    // KAS denied or error
                    updateStep(2, 'COMPLETE', 'Key request sent to KAS');

                    // Step 4: KAS Policy Re-evaluation (FAILED)
                    setCurrentStep(4);
                    updateStep(3, 'IN_PROGRESS', 'Re-evaluating policy...');
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (response.status === 403 && data.kasDecision?.evaluationDetails) {
                        // Policy denial with details
                        updateStep(3, 'FAILED', 'Policy re-evaluation failed');
                        setPolicyCheckDetails(data.kasDecision.evaluationDetails);
                        setError(data.denialReason || 'Access denied by KAS');
                    } else if (response.status === 503) {
                        // KAS unavailable
                        updateStep(2, 'FAILED', 'KAS service unavailable');
                        setError('KAS service is unavailable. Please try again later.');
                    } else {
                        // Other error
                        updateStep(3, 'FAILED', 'Policy evaluation failed');
                        setError(data.message || `HTTP ${response.status}`);
                    }

                    updateStep(4, 'FAILED', 'Key release denied');
                    updateStep(5, 'FAILED', 'Cannot decrypt content');
                    setIsDismissible(true);
                    onFailure(data.denialReason || 'Access denied', data.kasDecision?.evaluationDetails);
                    return;
                }

                // Success flow
                updateStep(2, 'COMPLETE', 'Key requested from KAS');

                // Step 4: KAS Policy Re-evaluation (SUCCESS)
                setCurrentStep(4);
                updateStep(3, 'IN_PROGRESS', 'Re-evaluating policy...');
                await new Promise(resolve => setTimeout(resolve, 400));

                if (data.kasDecision?.evaluationDetails) {
                    setPolicyCheckDetails(data.kasDecision.evaluationDetails);
                }
                updateStep(3, 'COMPLETE', 'All policy checks passed');

                // Step 5: Key Release
                setCurrentStep(5);
                updateStep(4, 'IN_PROGRESS', 'Releasing DEK from KAS...');
                await new Promise(resolve => setTimeout(resolve, 300));
                updateStep(4, 'COMPLETE', 'DEK released by KAS');

                // Step 6: Content Decryption
                setCurrentStep(6);
                updateStep(5, 'IN_PROGRESS', 'Decrypting content with released key...');
                await new Promise(resolve => setTimeout(resolve, 400));
                updateStep(5, 'COMPLETE', 'Content decrypted successfully');

                // Success - auto-close after 2 seconds
                setIsDismissible(true);
                
                // Save completed flow state to sessionStorage for KAS Flow tab
                const completedFlow = {
                    resourceId,
                    completedAt: new Date().toISOString(),
                    steps: steps.map(s => ({
                        ...s,
                        status: 'COMPLETE' as const
                    })),
                    kasDecision: data.kasDecision
                };
                sessionStorage.setItem(`kas-flow-${resourceId}`, JSON.stringify(completedFlow));
                
                // Save decrypted content to sessionStorage (expires on browser close)
                sessionStorage.setItem(`decrypted-${resourceId}`, data.content);
                
                setTimeout(() => {
                    onSuccess(data.content);
                    onClose();
                }, 2000);

            } catch (err) {
                console.error('KAS request failed:', err);
                const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                setError(errorMessage);
                setIsDismissible(true);
                updateStep(currentStep, 'FAILED', errorMessage);
                onFailure(errorMessage);
            }
        };

        executeKASRequest();
    }, [isOpen, resourceId, kaoId, session, onSuccess, onFailure]);

    return (
        <Dialog
            open={isOpen}
            onClose={isDismissible ? onClose : () => {}}
            className="relative z-50"
        >
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/40" aria-hidden="true" />

            {/* Full-screen container */}
            <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="mx-auto max-w-2xl w-full bg-white rounded-lg shadow-2xl">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-t-lg">
                        <Dialog.Title className="text-xl font-bold">
                            {error ? '❌ Access Denied by KAS' : '🔐 Requesting Key from KAS'}
                        </Dialog.Title>
                        {!error && (
                            <p className="text-sm text-blue-100 mt-1">
                                Policy-driven key access mediation in progress...
                            </p>
                        )}
                    </div>

                    {/* Progress Bar */}
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <div className="relative pt-1">
                            <div className="flex mb-2 items-center justify-between">
                                <div>
                                    <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                                        Step {currentStep} of 6
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-semibold inline-block text-blue-600">
                                        {Math.round((currentStep / 6) * 100)}%
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                                <div
                                    style={{ width: `${(currentStep / 6) * 100}%` }}
                                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-500"
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="px-6 py-4 max-h-96 overflow-y-auto">
                        <div className="space-y-3">
                            {steps.map((step, index) => (
                                <div
                                    key={index}
                                    className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-300 ${
                                        step.status === 'IN_PROGRESS' ? 'bg-yellow-50 border-2 border-yellow-300' :
                                        step.status === 'COMPLETE' ? 'bg-green-50 border border-green-200' :
                                        step.status === 'FAILED' ? 'bg-red-50 border border-red-200' :
                                        'bg-gray-50 border border-gray-200'
                                    }`}
                                >
                                    <div className="flex-shrink-0">
                                        <span className="text-2xl">{statusIcons[step.status]}</span>
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-semibold text-sm">{index + 1}. {step.name}</h4>
                                            <span className={`text-xs font-medium ${statusColors[step.status]}`}>
                                                {step.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600">{step.details}</p>
                                        {step.timestamp && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                ⏰ {new Date(step.timestamp).toLocaleTimeString()}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Policy Check Details (on failure) */}
                    {policyCheckDetails && error && (
                        <div className="px-6 py-4 bg-red-50 border-t border-red-200">
                            <h4 className="font-semibold text-red-800 mb-3">Policy Check Results:</h4>
                            <div className="space-y-2 text-sm">
                                <div className={`p-2 rounded ${policyCheckDetails.clearanceCheck === 'PASS' ? 'bg-green-100' : 'bg-red-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{policyCheckDetails.clearanceCheck === 'PASS' ? '✓' : '✗'}</span>
                                        <span className="font-medium">Clearance Check:</span>
                                        <span className={policyCheckDetails.clearanceCheck === 'PASS' ? 'text-green-800' : 'text-red-800'}>
                                            {policyCheckDetails.clearanceCheck}
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1 ml-7">
                                        Required: {policyCheckDetails.policyBinding.required.clearance} | 
                                        Provided: {policyCheckDetails.policyBinding.provided.clearance}
                                    </p>
                                </div>

                                <div className={`p-2 rounded ${policyCheckDetails.releasabilityCheck === 'PASS' ? 'bg-green-100' : 'bg-red-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{policyCheckDetails.releasabilityCheck === 'PASS' ? '✓' : '✗'}</span>
                                        <span className="font-medium">Releasability Check:</span>
                                        <span className={policyCheckDetails.releasabilityCheck === 'PASS' ? 'text-green-800' : 'text-red-800'}>
                                            {policyCheckDetails.releasabilityCheck}
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1 ml-7">
                                        Required: {policyCheckDetails.policyBinding.required.countries.join(', ')} | 
                                        Provided: {policyCheckDetails.policyBinding.provided.country}
                                    </p>
                                    {policyCheckDetails.releasabilityCheck === 'FAIL' && (
                                        <p className="text-xs mt-1 ml-7 text-red-700">
                                            Issue: Country {policyCheckDetails.policyBinding.provided.country} not in [{policyCheckDetails.policyBinding.required.countries.join(', ')}]
                                        </p>
                                    )}
                                </div>

                                <div className={`p-2 rounded ${policyCheckDetails.coiCheck === 'PASS' ? 'bg-green-100' : 'bg-red-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{policyCheckDetails.coiCheck === 'PASS' ? '✓' : '✗'}</span>
                                        <span className="font-medium">COI Check:</span>
                                        <span className={policyCheckDetails.coiCheck === 'PASS' ? 'text-green-800' : 'text-red-800'}>
                                            {policyCheckDetails.coiCheck}
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1 ml-7">
                                        Required: {policyCheckDetails.policyBinding.required.coi.join(', ') || 'None'} | 
                                        Provided: {policyCheckDetails.policyBinding.provided.coi.join(', ') || 'None'}
                                    </p>
                                    {policyCheckDetails.coiCheck === 'FAIL' && (
                                        <p className="text-xs mt-1 ml-7 text-red-700">
                                            Issue: No COI intersection
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="px-6 py-4 bg-red-50 border-t border-red-200">
                            <p className="text-red-800 font-semibold">Reason:</p>
                            <p className="text-red-700 text-sm">{error}</p>
                        </div>
                    )}

                    {/* Success Message */}
                    {!error && steps[5].status === 'COMPLETE' && (
                        <div className="px-6 py-4 bg-green-50 border-t border-green-200">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">✅</span>
                                <div>
                                    <p className="text-green-800 font-semibold">Access Granted - Key Released by KAS</p>
                                    <p className="text-green-700 text-sm">
                                        Content decrypted successfully. Closing in 2 seconds...
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex justify-end">
                        {isDismissible ? (
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                            >
                                Close
                            </button>
                        ) : (
                            <button
                                disabled
                                className="px-6 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed"
                            >
                                Processing...
                            </button>
                        )}
                    </div>
                </Dialog.Panel>
            </div>
        </Dialog>
    );
}

