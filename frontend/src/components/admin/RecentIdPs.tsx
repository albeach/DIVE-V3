/**
 * Recent IdPs Widget
 * 
 * Shows last 5 IdPs viewed by the user
 * Stored in localStorage for persistence
 * 
 * Phase 1.3: Cross-Page Navigation
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { ClockIcon } from '@heroicons/react/24/outline';
import { useIdPManagement } from '@/contexts/IdPManagementContext';
import { useIdPs } from '@/lib/api/idp-management';
import { IIdPListItem } from '@/types/admin.types';

// ============================================
// Component
// ============================================

export default function RecentIdPs() {
    const { recentIdPs, selectIdP } = useIdPManagement();
    const { data: idps } = useIdPs();
    
    // Get full IdP details for recent aliases
    const recentIdPDetails = React.useMemo(() => {
        if (!idps || !recentIdPs.length) return [];
        
        // Ensure idps is an array
        const idpsList = Array.isArray(idps) ? idps : [];
        
        return recentIdPs
            .map(alias => idpsList.find((idp: IIdPListItem) => idp.alias === alias))
            .filter(Boolean) as IIdPListItem[];
    }, [idps, recentIdPs]);
    
    if (!recentIdPDetails.length) {
        return null;
    }
    
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-3">
                <ClockIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Recently Viewed
                </h3>
            </div>
            
            <ul className="space-y-2">
                {recentIdPDetails.map((idp) => (
                    <li key={idp.alias}>
                        <Link
                            href={`/admin/idp?selected=${idp.alias}`}
                            onClick={() => selectIdP(idp.alias)}
                            className="block px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{idp.displayName}</span>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                                        idp.protocol === 'oidc' 
                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    }`}>
                                        {idp.protocol.toUpperCase()}
                                    </span>
                                </div>
                                <div className={`h-2 w-2 rounded-full ${
                                    idp.enabled 
                                        ? 'bg-green-500' 
                                        : 'bg-gray-400'
                                }`} />
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
