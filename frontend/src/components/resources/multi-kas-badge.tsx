/**
 * Multi-KAS Badge Component
 * 
 * Displays KAS architecture information on resources list
 * Shows tooltip with available KAS endpoints on hover
 */

'use client';

import { useState } from 'react';

interface MultiKASBadgeProps {
    kaoCount: number;
    kaos?: Array<{
        kaoId: string;
        kasId: string;
        policyBinding?: {
            coiRequired?: string[];
            countriesAllowed?: string[];
        };
    }>;
    userCountry?: string;
    userCOI?: string[];
}

export default function MultiKASBadge({ 
    kaoCount, 
    kaos = [], 
    userCountry, 
    userCOI = [] 
}: MultiKASBadgeProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    
    // Determine KAS display name
    const getKASDisplayName = (kasId: string) => {
        if (kasId.includes('fvey')) return 'FVEY';
        if (kasId.includes('nato')) return 'NATO';
        if (kasId.includes('usa')) return 'USA';
        if (kasId.includes('gbr')) return 'GBR';
        if (kasId.includes('fra')) return 'FRA';
        if (kasId.includes('can')) return 'CAN';
        if (kasId.includes('aus')) return 'AUS';
        if (kasId.includes('nzl')) return 'NZL';
        return kasId.toUpperCase().replace('-KAS', '');
    };
    
    // Check if user has a matching KAO
    const hasMatchingKAO = kaos.some(kao => {
        const matchesCountry = kao.kasId.includes(userCountry?.toLowerCase() || '');
        const matchesCOI = kao.policyBinding?.coiRequired?.some(coi => userCOI.includes(coi));
        return matchesCountry || matchesCOI;
    });
    
    if (kaoCount === 1) {
        return (
            <span 
                className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300"
                title="Single KAS endpoint"
            >
                <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
                Single KAS
            </span>
        );
    }
    
    return (
        <div 
            className="relative inline-block"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <div className="flex items-center gap-1">
                <span 
                    className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold border cursor-help ${
                        hasMatchingKAO
                            ? 'bg-green-100 text-green-800 border-green-300'
                            : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}
                >
                    <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                    </svg>
                    {kaoCount} KAS
                </span>
                {hasMatchingKAO && (
                    <span 
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-green-500 text-white"
                        title="Has a KAO matching your profile"
                    >
                        ✓
                    </span>
                )}
            </div>
            
            {/* Tooltip */}
            {showTooltip && kaos.length > 0 && (
                <div className="absolute z-50 left-0 top-full mt-2 w-72 bg-white rounded-lg shadow-xl border-2 border-blue-300 p-4 animate-fade-in">
                    <div className="space-y-3">
                        <div className="border-b border-gray-200 pb-2">
                            <p className="text-xs font-bold text-gray-900 flex items-center gap-2">
                                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Multi-KAS Architecture
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                {kaoCount} Key Access Objects available
                            </p>
                        </div>
                        
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-gray-700">Available KAS Endpoints:</p>
                            <div className="space-y-1.5">
                                {kaos.map((kao) => {
                                    const matchesUser = 
                                        kao.kasId.includes(userCountry?.toLowerCase() || '') ||
                                        kao.policyBinding?.coiRequired?.some(coi => userCOI.includes(coi));
                                    
                                    return (
                                        <div 
                                            key={kao.kaoId} 
                                            className={`flex items-center justify-between text-xs p-2 rounded ${
                                                matchesUser ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
                                            }`}
                                        >
                                            <span className="font-mono font-semibold text-gray-900">
                                                {getKASDisplayName(kao.kasId)}
                                            </span>
                                            {matchesUser && (
                                                <span className="text-green-700 font-bold">
                                                    ✓ Matches You
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        
                        {hasMatchingKAO && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-2">
                                <p className="text-xs text-blue-900">
                                    <strong>💡 Optimized:</strong> This resource has a KAO matching your profile for faster access.
                                </p>
                            </div>
                        )}
                    </div>
                    
                    {/* Arrow pointer */}
                    <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l-2 border-t-2 border-blue-300 transform rotate-45"></div>
                </div>
            )}
        </div>
    );
}

