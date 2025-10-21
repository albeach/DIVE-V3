/**
 * Real-Time Activity Section
 * 
 * Live feed of system events and activity
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface ILogEntry {
    timestamp: string;
    eventType: string;
    subject: string;
    action: string;
    resourceId: string;
    outcome: 'ALLOW' | 'DENY';
    reason: string;
}

interface Props {
    refreshTrigger: Date;
}

export default function RealTimeActivity({ refreshTrigger }: Props) {
    const { data: session } = useSession();
    const [logs, setLogs] = useState<ILogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterOutcome, setFilterOutcome] = useState<'all' | 'ALLOW' | 'DENY'>('all');
    const [filterEventType, setFilterEventType] = useState<string>('all');

    useEffect(() => {
        fetchData();
    }, [refreshTrigger]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = (session as any)?.accessToken;
            if (!token) return;

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/admin/logs?limit=100`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await res.json();
                if (data.success && data.data.logs) {
                    setLogs(data.data.logs);
                }
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const eventTypes = Array.from(new Set(logs.map(log => log.eventType)));
    
    const filteredLogs = logs.filter(log => {
        if (filterOutcome !== 'all' && log.outcome !== filterOutcome) return false;
        if (filterEventType !== 'all' && log.eventType !== filterEventType) return false;
        return true;
    });

    const getEventIcon = (eventType: string) => {
        if (eventType.includes('ACCESS')) return '🔐';
        if (eventType.includes('DECRYPT')) return '🔓';
        if (eventType.includes('ENCRYPT')) return '🔒';
        if (eventType.includes('LOGIN')) return '🚪';
        return '📝';
    };

    const getOutcomeBadge = (outcome: 'ALLOW' | 'DENY') => {
        if (outcome === 'ALLOW') {
            return <span className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">ALLOW</span>;
        }
        return <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">DENY</span>;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Live Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">📡</div>
                    <div className="text-3xl font-bold">{logs.length}</div>
                    <div className="text-sm opacity-90 mt-1">Total Events</div>
                </div>

                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">✅</div>
                    <div className="text-3xl font-bold">{logs.filter(l => l.outcome === 'ALLOW').length}</div>
                    <div className="text-sm opacity-90 mt-1">Allowed</div>
                </div>

                <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">🚫</div>
                    <div className="text-3xl font-bold">{logs.filter(l => l.outcome === 'DENY').length}</div>
                    <div className="text-sm opacity-90 mt-1">Denied</div>
                </div>

                <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-xl p-6 text-white">
                    <div className="text-4xl mb-2">📊</div>
                    <div className="text-3xl font-bold">{eventTypes.length}</div>
                    <div className="text-sm opacity-90 mt-1">Event Types</div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center space-x-2">
                        <label className="text-sm font-medium text-slate-700">Outcome:</label>
                        <select
                            value={filterOutcome}
                            onChange={(e) => setFilterOutcome(e.target.value as any)}
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All</option>
                            <option value="ALLOW">Allow</option>
                            <option value="DENY">Deny</option>
                        </select>
                    </div>

                    <div className="flex items-center space-x-2">
                        <label className="text-sm font-medium text-slate-700">Event Type:</label>
                        <select
                            value={filterEventType}
                            onChange={(e) => setFilterEventType(e.target.value)}
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All</option>
                            {eventTypes.map(type => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <div className="ml-auto flex items-center space-x-2">
                        <button
                            onClick={fetchData}
                            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
                        >
                            🔄 Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Activity Feed */}
            <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-slate-900">📡 Live Activity Feed</h2>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold animate-pulse">
                        ● LIVE
                    </span>
                </div>

                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {filteredLogs.length > 0 ? (
                        filteredLogs.map((log, idx) => (
                            <div 
                                key={idx} 
                                className={`p-4 rounded-lg border transition-all hover:shadow-md ${
                                    log.outcome === 'ALLOW' 
                                        ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                                        : 'bg-red-50 border-red-200 hover:bg-red-100'
                                }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start space-x-3 flex-1">
                                        <div className="text-2xl">{getEventIcon(log.eventType)}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center space-x-2 mb-2">
                                                {getOutcomeBadge(log.outcome)}
                                                <span className="px-2 py-1 bg-slate-200 text-slate-700 text-xs font-medium rounded">
                                                    {log.eventType}
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {new Date(log.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium text-slate-900 mb-1">
                                                <span className="font-bold">{log.subject}</span> → {log.action} → <span className="font-mono text-xs">{log.resourceId}</span>
                                            </p>
                                            {log.reason && (
                                                <p className={`text-xs ${log.outcome === 'ALLOW' ? 'text-green-700' : 'text-red-700'} mt-1`}>
                                                    {log.reason}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-slate-500">No events match the selected filters</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

