/**
 * KAO (Key Access Object) Selector Component
 *
 * Shows users which KAS endpoint will be contacted for decryption
 * Displays Multiple KAOs when available (Multi-KAS architecture)
 * Recommends optimal KAO based on user's country and COI membership
 *
 * ACP-240 Section 5.3: Multi-KAS Coalition Architecture
 */

'use client';

import { useState } from 'react';
import { Key, Server, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface KAOSelectorProps {
    kaos: Array<{
        kaoId: string;
        kasId: string;
        kasUrl: string;
        policyBinding: {
            coiRequired?: string[];
            countriesAllowed?: string[];
            clearanceRequired?: string;
        };
        wrappingAlgorithm: string;
        createdAt: string;
    }>;
    selectedKaoId?: string;
    onSelect: (kaoId: string) => void;
    userCountry: string;
    userCOI: string[];
    userClearance: string;
}

export default function KAOSelector({
    kaos,
    selectedKaoId,
    onSelect,
    userCountry,
    userCOI,
    userClearance
}: KAOSelectorProps) {
    const [showDetails, setShowDetails] = useState(false);

    // Determine which KAO is optimal for this user
    const getKAOScore = (kao: typeof kaos[0]) => {
        let score = 0;
        const reasons: string[] = [];

        // +15 points for exact COI match (all required COIs)
        if (kao.policyBinding.coiRequired && kao.policyBinding.coiRequired.length > 0) {
            const hasAllRequired = kao.policyBinding.coiRequired.every(coi => userCOI.includes(coi));
            if (hasAllRequired) {
                score += 15;
                reasons.push('Perfect COI match');
            } else {
                const matchingCOIs = kao.policyBinding.coiRequired.filter(coi => userCOI.includes(coi));
                if (matchingCOIs.length > 0) {
                    score += 5 * matchingCOIs.length;
                    reasons.push(`Partial COI: ${matchingCOIs.join(', ')}`);
                }
            }
        } else {
            // +10 points for no COI required (open access)
            score += 10;
            reasons.push('Open access');
        }

        // +8 points for matching user's country
        if (kao.kasId.includes(userCountry.toLowerCase())) {
            score += 8;
            reasons.push('National KAS');
        }

        // +3 points for single-country KAO (more focused access control)
        if (kao.policyBinding.countriesAllowed?.length === 1) {
            score += 3;
            reasons.push('Focused access');
        }

        return { score, reasons };
    };

    const kaoScores = kaos.map(kao => ({
        kao,
        ...getKAOScore(kao)
    }));

    const rankedKAOs = kaoScores.sort((a, b) => b.score - a.score);
    const recommendedKAO = rankedKAOs[0];

    // Auto-select recommended KAO if none selected
    if (!selectedKaoId && kaos.length > 0) {
        onSelect(recommendedKAO.kao.kaoId);
    }

    // Determine KAS endpoint name for display
    const getKASDisplayName = (kasId: string) => {
        if (kasId.includes('fvey')) return 'Five Eyes KAS';
        if (kasId.includes('nato')) return 'NATO KAS';
        if (kasId.includes('usa')) return '🇺🇸 United States KAS';
        if (kasId.includes('gbr')) return '🇬🇧 United Kingdom KAS';
        if (kasId.includes('fra')) return '🇫🇷 France KAS';
        if (kasId.includes('can')) return '🇨🇦 Canada KAS';
        if (kasId.includes('aus')) return '🇦🇺 Australia KAS';
        if (kasId.includes('nzl')) return '🇳🇿 New Zealand KAS';
        return kasId.toUpperCase().replace('-KAS', ' KAS');
    };

    if (kaos.length === 0) {
        return (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-red-900">No Key Access Objects Available</h4>
                        <p className="text-sm text-red-800 mt-1">
                            This resource has no KAOs configured. Contact the administrator.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl p-6 border-2 border-blue-200 shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Key className="w-5 h-5 text-blue-600" />
                    Key Access Service (KAS) Selection
                </h3>
                {kaos.length > 1 && (
                    <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full">
                        Multi-KAS: {kaos.length} Available
                    </span>
                )}
            </div>

            {/* Multi-KAS Info Banner */}
            {kaos.length > 1 && (
                <div className="mb-4 bg-blue-100 border border-blue-300 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-700 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm text-blue-900 font-semibold mb-1">
                                🌐 Multi-KAS Architecture Enabled
                            </p>
                            <p className="text-xs text-blue-800">
                                This document has <strong>{kaos.length} Key Access Objects (KAOs)</strong> for redundancy and coalition flexibility.
                                Each KAO points to a different KAS server and may have different access requirements.
                                We've automatically selected the best match for your profile
                                (<strong>{userCountry}</strong>, COI: <strong>{userCOI.length > 0 ? userCOI.join(', ') : 'None'}</strong>).
                            </p>
                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                className="text-xs text-blue-700 font-semibold mt-2 hover:underline"
                            >
                                {showDetails ? '▼ Hide Details' : '▶ Learn More About Multi-KAS'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Multi-KAS Details (Collapsible) */}
            {showDetails && kaos.length > 1 && (
                <div className="mb-4 bg-white border border-blue-200 rounded-lg p-4 animate-fade-in">
                    <h4 className="font-bold text-gray-900 text-sm mb-2">Why Multiple KAOs?</h4>
                    <ul className="text-xs text-gray-700 space-y-2">
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <span><strong>Redundancy:</strong> Multiple KAS servers prevent single points of failure</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <span><strong>Policy Flexibility:</strong> Different KAOs may have different access requirements</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <span><strong>Geographic Distribution:</strong> Choose the closest or most appropriate KAS</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">•</span>
                            <span><strong>Community Access:</strong> Some KAOs serve specific coalition communities</span>
                        </li>
                    </ul>
                    <div className="text-xs text-blue-700 mt-3 pt-3 border-t border-blue-200">
                        <p className="mb-1"><strong>How to Choose:</strong></p>
                        <p>• Look for "Perfect COI match" or "National KAS" indicators</p>
                        <p>• Consider geographic proximity for performance</p>
                        <p>• The recommended option is automatically selected for you</p>
                    </div>
                </div>
            )}

            {/* KAO Selection Cards */}
            <div className="space-y-3">
                {rankedKAOs.map(({ kao, score, reasons }, index) => {
                    const isSelected = kao.kaoId === selectedKaoId;
                    const isRecommended = kao.kaoId === recommendedKAO.kao.kaoId;
                    const displayName = getKASDisplayName(kao.kasId);

                    return (
                        <button
                            key={kao.kaoId}
                            onClick={() => onSelect(kao.kaoId)}
                            className={`w-full text-left p-4 rounded-lg border-2 transition-all transform hover:scale-102 ${
                                isSelected
                                    ? 'border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-300'
                                    : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 hover:shadow-md'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    {/* KAS Name and Status */}
                                    <div className="flex items-center gap-2 mb-2">
                                        <Server className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                                        <span className="font-bold text-sm text-gray-900">
                                            {displayName}
                                        </span>
                                        {isRecommended && (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded-full flex items-center gap-1">
                                                ⭐ Recommended
                                            </span>
                                        )}
                                        {isSelected && (
                                            <CheckCircle className="w-4 h-4 text-blue-600" />
                                        )}
                                    </div>

                                    {/* KAO ID and Purpose */}
                                    <p className="text-xs text-gray-600 mb-2">
                                        <strong>Purpose:</strong> {kao.kaoId.includes('Alpha') ? 'Alpha Community Access' :
                                                                   kao.kaoId.includes('Beta') ? 'Beta Community Access' :
                                                                   kao.kaoId.includes('Gamma') ? 'Gamma Community Access' :
                                                                   kao.kaoId.includes('FVEY') ? 'Five Eyes Coalition' :
                                                                   kao.kaoId.includes('NATO') ? 'NATO Alliance' :
                                                                   'General Access'}
                                    </p>

                                    {/* KAS Server Location */}
                                    <p className="text-xs text-gray-600 mb-3">
                                        <strong>KAS Server:</strong> {getKASDisplayName(kao.kasId)}
                                    </p>

                                    {/* Policy Binding */}
                                    <div className="flex flex-wrap gap-2 text-xs mb-2">
                                        {kao.policyBinding.clearanceRequired && (
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded font-semibold">
                                                {kao.policyBinding.clearanceRequired}
                                            </span>
                                        )}
                                        {kao.policyBinding.coiRequired && kao.policyBinding.coiRequired.length > 0 ? (
                                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold">
                                                COI: {kao.policyBinding.coiRequired.join(', ')}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded font-semibold">
                                                No COI Required
                                            </span>
                                        )}
                                        {kao.policyBinding.countriesAllowed && kao.policyBinding.countriesAllowed.length > 0 && (
                                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-semibold">
                                                Countries: {kao.policyBinding.countriesAllowed.join(', ')}
                                            </span>
                                        )}
                                    </div>

                                    {/* KAO Description */}
                                    <p className="text-xs text-gray-700 mb-2">
                                        {kao.policyBinding.coiRequired && kao.policyBinding.coiRequired.length > 0
                                            ? `Requires membership in: ${kao.policyBinding.coiRequired.join(', ')}`
                                            : 'No community membership required - open access'
                                        }
                                    </p>

                                    {/* Match Reasons */}
                                    {reasons.length > 0 && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-green-700 font-semibold">
                                                ✓ {reasons.join(' • ')}
                                            </span>
                                        </div>
                                    )}

                                    {score === 0 && (
                                        <p className="text-xs text-amber-600 mt-2 bg-amber-50 p-2 rounded">
                                            ⚠️ Limited compatibility - may require additional clearances
                                        </p>
                                    )}
                                </div>

                                {/* Selection Indicator */}
                                <div className="flex-shrink-0">
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                        isSelected
                                            ? 'border-blue-500 bg-blue-500'
                                            : 'border-gray-300 bg-white'
                                    }`}>
                                        {isSelected && (
                                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Single KAO Info */}
            {kaos.length === 1 && (
                <p className="text-xs text-gray-600 mt-3 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Single KAO configuration - This resource uses one KAS endpoint.
                </p>
            )}

            {/* Selected KAO Summary */}
            {selectedKaoId && (
                <div className="mt-4 pt-4 border-t border-blue-200">
                    <div className="bg-green-50 border border-green-300 rounded-lg p-3">
                        <p className="text-sm text-green-900 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <strong>Ready to request key from:</strong>
                        </p>
                        <p className="text-xs text-green-800 mt-1 ml-6">
                            {getKASDisplayName(kaos.find(k => k.kaoId === selectedKaoId)?.kasId || '')}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
