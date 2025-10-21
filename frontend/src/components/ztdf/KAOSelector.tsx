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
        
        // +10 points for matching user's country
        if (kao.kasId.includes(userCountry.toLowerCase())) {
            score += 10;
            reasons.push('National KAS');
        }
        
        // +5 points for matching user's COI
        if (kao.policyBinding.coiRequired) {
            const matchingCOIs = kao.policyBinding.coiRequired.filter(coi => userCOI.includes(coi));
            if (matchingCOIs.length > 0) {
                score += 5 * matchingCOIs.length;
                reasons.push(`COI: ${matchingCOIs.join(', ')}`);
            }
        }
        
        // +2 points for single-country KAO (faster, more direct)
        if (kao.policyBinding.countriesAllowed?.length === 1) {
            score += 2;
            reasons.push('Direct access');
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
                                This document has <strong>{kaos.length} Key Access Objects (KAOs)</strong>, each pointing to a different 
                                KAS endpoint. We've recommended the one that best matches your profile 
                                (<strong>{userCountry}</strong>, COI: <strong>{userCOI.length > 0 ? userCOI.join(', ') : 'None'}</strong>).
                                You can select a different KAO if needed.
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
                    <h4 className="font-bold text-gray-900 text-sm mb-2">How Multi-KAS Works:</h4>
                    <ul className="text-xs text-gray-700 space-y-2">
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">1.</span>
                            <span>Each nation/coalition can host their own <strong>Key Access Service (KAS)</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">2.</span>
                            <span>Documents are encrypted once but have <strong>multiple KAOs</strong> (wrapped keys)</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">3.</span>
                            <span>Your client contacts the <strong>optimal KAS</strong> based on your attributes</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-blue-600 font-bold">4.</span>
                            <span>The KAS re-evaluates the policy and releases the decryption key if authorized</span>
                        </li>
                    </ul>
                    <p className="text-xs text-blue-700 mt-3 pt-3 border-t border-blue-200">
                        <strong>Coalition Benefit:</strong> New partners get instant access to historical data without re-encryption!
                    </p>
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
                                    
                                    {/* KAO ID */}
                                    <p className="text-xs text-gray-600 mb-2 font-mono">
                                        <strong>KAO ID:</strong> {kao.kaoId}
                                    </p>
                                    
                                    {/* KAS Endpoint */}
                                    <p className="text-xs text-gray-600 mb-3">
                                        <strong>Endpoint:</strong> <span className="font-mono">{kao.kasUrl}</span>
                                    </p>
                                    
                                    {/* Policy Binding */}
                                    <div className="flex flex-wrap gap-2 text-xs mb-2">
                                        {kao.policyBinding.coiRequired && kao.policyBinding.coiRequired.length > 0 && (
                                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold">
                                                COI: {kao.policyBinding.coiRequired.join(', ')}
                                            </span>
                                        )}
                                        {kao.policyBinding.countriesAllowed && kao.policyBinding.countriesAllowed.length > 0 && (
                                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-semibold">
                                                {kao.policyBinding.countriesAllowed.join(', ')}
                                            </span>
                                        )}
                                        {kao.policyBinding.clearanceRequired && (
                                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded font-semibold">
                                                {kao.policyBinding.clearanceRequired}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {/* Match Reasons */}
                                    {reasons.length > 0 && (
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-xs text-green-700 font-semibold">
                                                ✓ Match: {reasons.join(' • ')}
                                            </span>
                                        </div>
                                    )}
                                    
                                    {score === 0 && (
                                        <p className="text-xs text-gray-500 mt-2">
                                            Generic KAO - No specific match to your profile
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

