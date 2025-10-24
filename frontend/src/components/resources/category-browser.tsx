/**
 * Category Browser Component (2025)
 * 
 * Visual analytics panel for browsing documents by category
 * - Classification distribution
 * - Country coverage
 * - COI breakdown
 * - Encryption status
 * - Timeline view
 */

'use client';

import React, { useMemo } from 'react';
import { IResourceCardData } from './advanced-resource-card';

interface CategoryBrowserProps {
  resources: IResourceCardData[];
  onCategoryClick: (category: string, value: string) => void;
}

interface CategoryStat {
  label: string;
  count: number;
  percentage: number;
  color: string;
  icon: string;
}

export default function CategoryBrowser({ resources, onCategoryClick }: CategoryBrowserProps) {
  // Compute statistics
  const stats = useMemo(() => {
    const total = resources.length;

    // Classification breakdown
    const classificationCounts: Record<string, number> = {};
    resources.forEach(r => {
      classificationCounts[r.classification] = (classificationCounts[r.classification] || 0) + 1;
    });

    const classifications: CategoryStat[] = [
      { label: 'UNCLASSIFIED', count: classificationCounts.UNCLASSIFIED || 0, percentage: 0, color: 'bg-green-500', icon: '🟢' },
      { label: 'CONFIDENTIAL', count: classificationCounts.CONFIDENTIAL || 0, percentage: 0, color: 'bg-yellow-500', icon: '🟡' },
      { label: 'SECRET', count: classificationCounts.SECRET || 0, percentage: 0, color: 'bg-orange-500', icon: '🟠' },
      { label: 'TOP_SECRET', count: classificationCounts.TOP_SECRET || 0, percentage: 0, color: 'bg-red-500', icon: '🔴' },
    ].map(c => ({ ...c, percentage: total > 0 ? (c.count / total) * 100 : 0 }));

    // Country breakdown (top 10)
    const countryCounts: Record<string, number> = {};
    resources.forEach(r => {
      r.releasabilityTo.forEach(country => {
        countryCounts[country] = (countryCounts[country] || 0) + 1;
      });
    });
    const countries: CategoryStat[] = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, count]) => ({
        label: country,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        color: 'bg-blue-500',
        icon: '🌐',
      }));

    // COI breakdown
    const coiCounts: Record<string, number> = {};
    resources.forEach(r => {
      r.COI.forEach(coi => {
        coiCounts[coi] = (coiCounts[coi] || 0) + 1;
      });
    });
    const cois: CategoryStat[] = Object.entries(coiCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([coi, count]) => ({
        label: coi,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        color: 'bg-purple-500',
        icon: '👥',
      }));

    // Encryption status
    const encryptedCount = resources.filter(r => r.encrypted).length;
    const unencryptedCount = total - encryptedCount;
    const encryption: CategoryStat[] = [
      {
        label: 'Encrypted',
        count: encryptedCount,
        percentage: total > 0 ? (encryptedCount / total) * 100 : 0,
        color: 'bg-indigo-500',
        icon: '🔐',
      },
      {
        label: 'Unencrypted',
        count: unencryptedCount,
        percentage: total > 0 ? (unencryptedCount / total) * 100 : 0,
        color: 'bg-gray-400',
        icon: '📝',
      },
    ];

    return {
      total,
      classifications,
      countries,
      cois,
      encryption,
    };
  }, [resources]);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Browse by Category
        </h2>
        <p className="text-sm text-blue-100 mt-1">
          {stats.total} total documents
        </p>
      </div>

      <div className="divide-y divide-gray-200">
        {/* Classification Section */}
        <div className="p-5">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Classification Levels
          </h3>
          <div className="space-y-2">
            {stats.classifications.map(stat => (
              <button
                key={stat.label}
                onClick={() => onCategoryClick('classification', stat.label)}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{stat.icon}</span>
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {stat.label.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{stat.count}</span>
                    <span className="text-xs text-gray-500">({stat.percentage.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${stat.color} transition-all duration-500 ease-out group-hover:opacity-90`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Countries Section */}
        <div className="p-5">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Top Countries
          </h3>
          <div className="space-y-2">
            {stats.countries.slice(0, 8).map(stat => (
              <button
                key={stat.label}
                onClick={() => onCategoryClick('country', stat.label)}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{stat.icon}</span>
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {stat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{stat.count}</span>
                    <span className="text-xs text-gray-500">({stat.percentage.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full ${stat.color} transition-all duration-500 ease-out group-hover:opacity-90`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* COI Section */}
        {stats.cois.length > 0 && (
          <div className="p-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Communities of Interest
            </h3>
            <div className="space-y-2">
              {stats.cois.map(stat => (
                <button
                  key={stat.label}
                  onClick={() => onCategoryClick('coi', stat.label)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{stat.icon}</span>
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-purple-600 transition-colors">
                        {stat.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{stat.count}</span>
                      <span className="text-xs text-gray-500">({stat.percentage.toFixed(0)}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${stat.color} transition-all duration-500 ease-out group-hover:opacity-90`}
                      style={{ width: `${stat.percentage}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Encryption Section */}
        <div className="p-5">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Encryption Status
          </h3>
          <div className="space-y-2">
            {stats.encryption.map(stat => (
              <button
                key={stat.label}
                onClick={() => onCategoryClick('encryption', stat.label)}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{stat.icon}</span>
                    <span className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                      {stat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">{stat.count}</span>
                    <span className="text-xs text-gray-500">({stat.percentage.toFixed(0)}%)</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full ${stat.color} transition-all duration-500 ease-out group-hover:opacity-90`}
                    style={{ width: `${stat.percentage}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

