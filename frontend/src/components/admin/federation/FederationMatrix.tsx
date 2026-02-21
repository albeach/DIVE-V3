/**
 * DIVE V3 - Federation Matrix Visualization Component
 *
 * Interactive visual grid showing trust relationships between nations.
 * Hub administrators can toggle trust relationships.
 *
 * Features:
 * - Visual grid of trust relationships
 * - Color-coded cells (trusted/not trusted/self)
 * - Click to toggle (hub_admin only)
 * - Country flags and codes
 * - Export matrix data
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Grid3X3,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Download,
  Info,
} from 'lucide-react';
import {
  useFederationMatrix,
  useAddFederationTrust,
  useRemoveFederationTrust,
  useForceSync,
} from '@/lib/api/admin-queries';
import { hasFederationWriteAccess } from '@/types/admin.types';

interface FederationMatrixProps {
  /** User's admin roles for permission checking */
  userRoles?: string[];
  /** Compact mode for embedding in other components */
  compact?: boolean;
}

// Country data
interface CountryInfo {
  code: string;
  name: string;
  flag: string;
}

// All possible countries in the federation
const COUNTRIES: CountryInfo[] = [
  { code: 'USA', name: 'United States', flag: '🇺🇸' },
  { code: 'FRA', name: 'France', flag: '🇫🇷' },
  { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪' },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'ITA', name: 'Italy', flag: '🇮🇹' },
  { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
  { code: 'NLD', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'POL', name: 'Poland', flag: '🇵🇱' },
];

export function FederationMatrix({ userRoles = [], compact = false }: FederationMatrixProps) {
  // Query hooks
  const { data: matrixData, isLoading, error, refetch } = useFederationMatrix();
  const addTrustMutation = useAddFederationTrust();
  const removeTrustMutation = useRemoveFederationTrust();
  const forceSyncMutation = useForceSync();

  // Local state
  const [hoveredCell, setHoveredCell] = useState<{ source: string; target: string } | null>(null);
  const [pendingChange, setPendingChange] = useState<{ source: string; target: string } | null>(
    null
  );

  // Permission check
  const canModify = hasFederationWriteAccess(userRoles);

  // Build trust matrix from API data
  const matrix = matrixData?.federation_matrix || {};

  // Get countries that have at least one trust relationship
  const activeCountries = new Set<string>();
  Object.keys(matrix).forEach((source) => {
    activeCountries.add(source);
    (matrix[source] || []).forEach((target: string) => activeCountries.add(target));
  });

  // Use active countries or default to major NATO partners
  const displayCountries =
    activeCountries.size > 0
      ? COUNTRIES.filter((c) => activeCountries.has(c.code))
      : COUNTRIES.slice(0, 5); // Default to first 5

  // Check if trust exists
  const hasTrust = (source: string, target: string): boolean => {
    return (matrix[source] || []).includes(target);
  };

  // Handle cell click
  const handleCellClick = async (source: string, target: string) => {
    if (!canModify || source === target) return;

    setPendingChange({ source, target });

    try {
      if (hasTrust(source, target)) {
        await removeTrustMutation.mutateAsync({ source, target });
      } else {
        await addTrustMutation.mutateAsync({ sourceCountry: source, targetCountry: target });
      }
    } catch (err) {
      console.error('Failed to update trust:', err);
    } finally {
      setPendingChange(null);
    }
  };

  // Handle force sync
  const handleForceSync = async () => {
    try {
      await forceSyncMutation.mutateAsync();
    } catch (err) {
      console.error('Failed to force sync:', err);
    }
  };

  // Export matrix as JSON
  const handleExport = () => {
    const data = JSON.stringify(matrix, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `federation-matrix-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center justify-center py-12">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="h-8 w-8 rounded-full border-3 border-indigo-500 border-t-transparent"
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-center gap-3 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          <span>Failed to load federation matrix</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg border border-slate-200"
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
              <Grid3X3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Federation Trust Matrix</h3>
              <p className="text-sm text-slate-500">
                {Object.keys(matrix).length} countries with trust relationships
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Export Button */}
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>

            {/* Sync Button */}
            <button
              onClick={handleForceSync}
              disabled={forceSyncMutation.isPending}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${forceSyncMutation.isPending ? 'animate-spin' : ''}`}
              />
              Sync
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-emerald-500" />
            <span>Trusted</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-slate-200" />
            <span>Not Trusted</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-slate-400" />
            <span>Self</span>
          </div>
          {canModify && (
            <div className="flex items-center gap-1 ml-4">
              <Info className="w-3 h-3" />
              <span>Click to toggle trust</span>
            </div>
          )}
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="p-6 overflow-x-auto">
        {displayCountries.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Grid3X3 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No federation relationships configured</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-medium text-slate-500">From \ To</th>
                {displayCountries.map((country) => (
                  <th
                    key={country.code}
                    className="p-2 text-center text-xs font-medium text-slate-700"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg">{country.flag}</span>
                      <span>{country.code}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayCountries.map((sourceCountry) => (
                <tr key={sourceCountry.code}>
                  <td className="p-2 text-sm font-medium text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{sourceCountry.flag}</span>
                      <span>{sourceCountry.code}</span>
                    </div>
                  </td>
                  {displayCountries.map((targetCountry) => {
                    const isSelf = sourceCountry.code === targetCountry.code;
                    const trusted = hasTrust(sourceCountry.code, targetCountry.code);
                    const isHovered =
                      hoveredCell?.source === sourceCountry.code &&
                      hoveredCell?.target === targetCountry.code;
                    const isPending =
                      pendingChange?.source === sourceCountry.code &&
                      pendingChange?.target === targetCountry.code;

                    return (
                      <td
                        key={targetCountry.code}
                        className="p-2 text-center"
                        onMouseEnter={() =>
                          !isSelf &&
                          setHoveredCell({
                            source: sourceCountry.code,
                            target: targetCountry.code,
                          })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <motion.button
                          whileHover={canModify && !isSelf ? { scale: 1.1 } : {}}
                          whileTap={canModify && !isSelf ? { scale: 0.95 } : {}}
                          onClick={() => handleCellClick(sourceCountry.code, targetCountry.code)}
                          disabled={!canModify || isSelf || isPending}
                          className={`
                            w-10 h-10 rounded-lg flex items-center justify-center transition-all
                            ${isSelf ? 'bg-slate-300 cursor-not-allowed' : ''}
                            ${!isSelf && trusted ? 'bg-emerald-500 text-white shadow-md' : ''}
                            ${!isSelf && !trusted ? 'bg-slate-100 text-slate-400 border border-slate-200' : ''}
                            ${isHovered && canModify && !isSelf ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}
                            ${!canModify ? 'cursor-default' : 'cursor-pointer'}
                          `}
                        >
                          {isPending ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : isSelf ? (
                            <span className="text-xs text-slate-500">—</span>
                          ) : trusted ? (
                            <Check className="w-5 h-5" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                        </motion.button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredCell && canModify && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50"
          >
            Click to{' '}
            {hasTrust(hoveredCell.source, hoveredCell.target)
              ? 'remove trust from'
              : 'add trust between'}{' '}
            <strong>{hoveredCell.source}</strong> → <strong>{hoveredCell.target}</strong>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last Updated */}
      {matrixData?.timestamp && (
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
          Last updated: {new Date(matrixData.timestamp).toLocaleString()}
        </div>
      )}
    </motion.div>
  );
}

export default FederationMatrix;
