'use client';

/**
 * KAS Grid Component
 * 
 * Responsive grid layout for KAS cards with virtualization support
 * for large numbers of KAS instances (32+ NATO members).
 */

import { useMemo } from 'react';
import { Server } from 'lucide-react';
import { KASCard } from './kas-card';
import { IKASEndpoint } from '@/lib/api/kas';

interface KASGridProps {
  kasEndpoints: IKASEndpoint[];
  selectedKasId: string | null;
  onSelectKas: (kasId: string | null) => void;
  isLoading?: boolean;
  showHeader?: boolean;
  title?: string;
  subtitle?: string;
}

// Skeleton loader for loading state
function KASCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-6 border-2 border-gray-200 shadow-md animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-200 rounded-xl" />
          <div>
            <div className="h-5 w-32 bg-gray-200 rounded mb-1" />
            <div className="h-3 w-16 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="h-8 w-full bg-gray-200 rounded mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-16 bg-gray-200 rounded-lg" />
        <div className="h-16 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

export function KASGrid({
  kasEndpoints,
  selectedKasId,
  onSelectKas,
  isLoading = false,
  showHeader = true,
  title = 'KAS Federation Registry',
  subtitle = 'Click any endpoint to view detailed metrics'
}: KASGridProps) {
  // Sort KAS instances: active first, then by country code
  const sortedKasEndpoints = useMemo(() => {
    return [...kasEndpoints].sort((a, b) => {
      // Active status priority
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      // Then by country code
      return a.country.localeCompare(b.country);
    });
  }, [kasEndpoints]);

  const handleSelectKas = (kasId: string) => {
    // Toggle selection
    onSelectKas(kasId === selectedKasId ? null : kasId);
  };

  // Loading state with skeletons
  if (isLoading) {
    return (
      <div className="mb-8">
        {showHeader && (
          <div className="mb-4">
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <KASCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (kasEndpoints.length === 0) {
    return (
      <div className="mb-8">
        {showHeader && (
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            <Server className="w-7 h-7 text-blue-600" />
            {title}
          </h2>
        )}
        <div className="bg-gray-50 rounded-xl p-12 text-center border-2 border-dashed border-gray-300">
          <Server className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">
            No KAS Instances Found
          </h3>
          <p className="text-gray-500">
            No KAS instances are currently registered in the MongoDB registry.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      {showHeader && (
        <>
          <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Server className="w-7 h-7 text-blue-600" />
            {title}
            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {kasEndpoints.length} instances
            </span>
          </h2>
          <p className="text-sm text-gray-600 mb-4">{subtitle}</p>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sortedKasEndpoints.map((kas) => (
          <KASCard
            key={kas.id}
            kas={kas}
            isSelected={selectedKasId === kas.id}
            onSelect={handleSelectKas}
          />
        ))}
      </div>
    </div>
  );
}

export default KASGrid;
