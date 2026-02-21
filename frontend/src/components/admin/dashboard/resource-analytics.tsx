/**
 * Resource Analytics Section
 *
 * Resource access patterns and statistics
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface IResourceStats {
    totalResources: number;
    byClassification: Record<string, number>;
    byCountry: Record<string, number>;
    byCOI: Record<string, number>;
    mostAccessed: Array<{ resourceId: string; count: number; classification: string }>;
}

interface Props {
    dateRange: '24h' | '7d' | '30d' | '90d';
    refreshTrigger: Date;
}

export default function ResourceAnalytics({ dateRange, refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [stats, setStats] = useState<IResourceStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [dateRange, refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch resource facets from search endpoint (provides real classification/country/COI counts)
            const facetsRes = await fetch(`/api/resources/search/facets`, {
                cache: 'no-store',
            });

            // Also fetch top denied resources from logs stats
            const logsRes = await fetch(`/api/admin/logs/stats?days=${dateRange === '24h' ? 1 : dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90}`, {
                cache: 'no-store',
            });

            let facetsData: any = null;
            let logsData: any = null;

            if (facetsRes.ok) {
                const contentType = facetsRes.headers.get('content-type');
                if (contentType?.includes('application/json')) {
                    facetsData = await facetsRes.json();
                }
            }

            if (logsRes.ok) {
                const contentType = logsRes.headers.get('content-type');
                if (contentType?.includes('application/json')) {
                    logsData = await logsRes.json();
                }
            }

            // Transform facets data to resource stats
            if (facetsData?.facets) {
                const facets = facetsData.facets;

                // Build classification counts
                const byClassification: Record<string, number> = {};
                facets.classifications?.forEach((c: { value: string; count: number }) => {
                    byClassification[c.value] = c.count;
                });

                // Build country counts
                const byCountry: Record<string, number> = {};
                facets.countries?.forEach((c: { value: string; count: number }) => {
                    byCountry[c.value] = c.count;
                });

                // Build COI counts
                const byCOI: Record<string, number> = {};
                facets.cois?.forEach((c: { value: string; count: number }) => {
                    byCOI[c.value] = c.count;
                });

                // Calculate total from classification counts
                const totalResources = Object.values(byClassification).reduce((sum, count) => sum + count, 0);

                // Get most accessed from logs (top denied resources can indicate access patterns)
                const mostAccessed: Array<{ resourceId: string; count: number; classification: string }> =
                    logsData?.data?.topDeniedResources?.map((r: { resourceId: string; count: number }) => ({
                        resourceId: r.resourceId,
                        count: r.count,
                        classification: 'UNKNOWN' // Would need to join with resource data for accurate classification
                    })) || [];

                setStats({
                    totalResources,
                    byClassification,
                    byCountry,
                    byCOI,
                    mostAccessed
                });
            } else {
                // Fallback: no data available
                setStats({
                    totalResources: 0,
                    byClassification: {},
                    byCountry: {},
                    byCOI: {},
                    mostAccessed: []
                });
            }
        } catch (error) {
            console.error('Failed to fetch resource stats:', error);
            setStats(null);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const classificationColors: Record<string, { bg: string; text: string }> = {
        'UNCLASSIFIED': { bg: 'bg-green-100', text: 'text-green-700' },
        'RESTRICTED': { bg: 'bg-blue-100', text: 'text-blue-700' },
        'CONFIDENTIAL': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
        'SECRET': { bg: 'bg-orange-100', text: 'text-orange-700' },
        'TOP_SECRET': { bg: 'bg-red-100', text: 'text-red-700' }
    };

    return (
        <div className="space-y-6">
            {/* Resource Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">📁</div>
                    <div className="text-3xl font-bold">{stats?.totalResources || 0}</div>
                    <div className="text-sm opacity-90 mt-1">Total Resources</div>
                </div>

                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">🔓</div>
                    <div className="text-3xl font-bold">
                        {stats?.byClassification?.UNCLASSIFIED || 0}
                    </div>
                    <div className="text-sm opacity-90 mt-1">Unclassified</div>
                </div>

                <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">🔒</div>
                    <div className="text-3xl font-bold">
                        {(stats?.byClassification?.CONFIDENTIAL || 0) + (stats?.byClassification?.SECRET || 0)}
                    </div>
                    <div className="text-sm opacity-90 mt-1">Classified</div>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">🔐</div>
                    <div className="text-3xl font-bold">
                        {stats?.byClassification?.TOP_SECRET || 0}
                    </div>
                    <div className="text-sm opacity-90 mt-1">Top Secret</div>
                </div>
            </div>

            {/* Classification Distribution */}
            {stats && stats.byClassification && Object.keys(stats.byClassification).length > 0 && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6">🔖 Classification Distribution</h2>
                    <div className="space-y-4">
                        {Object.entries(stats.byClassification)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([classification, count]) => {
                                const percentage = ((count as number) / stats.totalResources * 100).toFixed(1);
                                const colors = classificationColors[classification] || { bg: 'bg-gray-100', text: 'text-gray-700' };

                                return (
                                    <div key={classification} className="flex items-center">
                                        <div className="w-40">
                                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${colors.bg} ${colors.text}`}>
                                                {classification}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center">
                                                <div className="flex-1 bg-slate-200 rounded-full h-8 relative overflow-hidden">
                                                    <div
                                                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full flex items-center justify-end px-3 transition-all duration-500"
                                                        style={{ width: `${percentage}%` }}
                                                    >
                                                        <span className="text-xs font-bold text-white">{percentage}%</span>
                                                    </div>
                                                </div>
                                                <div className="w-20 text-right text-sm font-bold text-slate-900 ml-3">
                                                    {count as number}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* Country & COI Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Country */}
                {stats && stats.byCountry && Object.keys(stats.byCountry).length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">🌍 Releasability by Country</h3>
                        <div className="space-y-2">
                            {Object.entries(stats.byCountry)
                                .sort(([, a], [, b]) => (b as number) - (a as number))
                                .slice(0, 10)
                                .map(([country, count], idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                                                {idx + 1}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">{country}</span>
                                        </div>
                                        <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                                            {count}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* By COI */}
                {stats && stats.byCOI && Object.keys(stats.byCOI).length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                        <h3 className="text-xl font-bold text-slate-900 mb-4">👥 Community of Interest</h3>
                        <div className="space-y-2">
                            {Object.entries(stats.byCOI)
                                .sort(([, a], [, b]) => (b as number) - (a as number))
                                .slice(0, 10)
                                .map(([coi, count], idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">
                                                {idx + 1}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">{coi}</span>
                                        </div>
                                        <span className="px-3 py-1 bg-purple-600 text-white rounded-full text-xs font-bold">
                                            {count}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Most Accessed Resources */}
            {stats && stats.mostAccessed && stats.mostAccessed.length > 0 && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">🔥 Most Accessed Resources</h2>
                    <div className="space-y-2">
                        {stats.mostAccessed.slice(0, 10).map((resource, idx) => {
                            const colors = classificationColors[resource.classification] || { bg: 'bg-gray-100', text: 'text-gray-700' };
                            return (
                                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center space-x-3 flex-1">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-slate-900 truncate">{resource.resourceId}</p>
                                            <span className={`text-xs px-2 py-1 rounded ${colors.bg} ${colors.text} font-medium`}>
                                                {resource.classification}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="ml-3 flex items-center space-x-2">
                                        <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                                            {resource.count} accesses
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Resource Insights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                    <h3 className="text-lg font-bold text-blue-900 mb-3">📊 Access Patterns</h3>
                    <ul className="space-y-2 text-sm text-blue-800">
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Higher classification requires stronger clearance</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>COI tags enable fine-grained access control</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Country releasability enforces coalition policies</span>
                        </li>
                    </ul>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                    <h3 className="text-lg font-bold text-green-900 mb-3">✅ Best Practices</h3>
                    <ul className="space-y-2 text-sm text-green-800">
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Apply principle of least privilege</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Regularly audit resource access logs</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Review and update classification levels</span>
                        </li>
                    </ul>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                    <h3 className="text-lg font-bold text-purple-900 mb-3">🔐 Security Tips</h3>
                    <ul className="space-y-2 text-sm text-purple-800">
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Monitor high-classification resource access</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Track denied access attempts for threats</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Enable KAS for sensitive documents</span>
                        </li>
                    </ul>
                </div>
            </div>

            {/* No Data State */}
            {(!stats || stats.totalResources === 0) && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
                    <div className="text-6xl mb-4">📁</div>
                    <p className="text-xl font-semibold text-slate-900 mb-2">No Resource Data Available</p>
                    <p className="text-slate-500">Resource analytics will appear here once documents are uploaded and accessed.</p>
                </div>
            )}
        </div>
    );
}
