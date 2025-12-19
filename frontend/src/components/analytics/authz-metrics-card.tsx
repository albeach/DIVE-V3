'use client';

/**
 * Authorization Metrics Card Component (Phase 3)
 * 
 * Purpose: Display authorization decision metrics
 * Metrics: Total decisions, allow/deny rates, latency, cache hit rate
 */

interface IAuthzMetrics {
    totalDecisions: number;
    allowRate: number;
    denyRate: number;
    averageLatency: number;
    cacheHitRate: number;
}

interface Props {
    data: IAuthzMetrics;
}

export default function AuthzMetricsCard({ data }: Props) {
    // Format large numbers
    const formatNumber = (num: number): string => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    // Determine latency status
    const getLatencyStatus = (latency: number) => {
        if (latency < 100) return { color: 'green', label: 'Excellent' };
        if (latency < 200) return { color: 'blue', label: 'Good' };
        if (latency < 500) return { color: 'yellow', label: 'Fair' };
        return { color: 'red', label: 'Poor' };
    };

    // Determine cache status
    const getCacheStatus = (hitRate: number) => {
        if (hitRate >= 85) return { color: 'green', label: 'Excellent' };
        if (hitRate >= 75) return { color: 'blue', label: 'Good' };
        if (hitRate >= 60) return { color: 'yellow', label: 'Fair' };
        return { color: 'red', label: 'Poor' };
    };

    const latencyStatus = getLatencyStatus(data.averageLatency);
    const cacheStatus = getCacheStatus(data.cacheHitRate);

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">Authorization Metrics</h2>

            {/* Total Decisions */}
            <div className="mb-6">
                <p className="text-sm text-gray-600 mb-1">Total Decisions</p>
                <p className="text-4xl font-bold text-gray-900">{formatNumber(data.totalDecisions)}</p>
            </div>

            {/* Allow/Deny Rates */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Allow Rate</span>
                    <span className="text-lg font-bold text-green-600">
                        {data.allowRate.toFixed(1)}%
                    </span>
                </div>
                <div className="bg-gray-200 rounded-full h-2 mb-4">
                    <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${data.allowRate}%` }}
                    />
                </div>

                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Deny Rate</span>
                    <span className="text-lg font-bold text-red-600">
                        {data.denyRate.toFixed(1)}%
                    </span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                    <div
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${data.denyRate}%` }}
                    />
                </div>
            </div>

            {/* Performance Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm text-gray-600">Avg Latency</p>
                        <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                latencyStatus.color === 'green'
                                    ? 'bg-green-100 text-green-800'
                                    : latencyStatus.color === 'blue'
                                    ? 'bg-blue-100 text-blue-800'
                                    : latencyStatus.color === 'yellow'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                            }`}
                        >
                            {latencyStatus.label}
                        </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                        {data.averageLatency}
                        <span className="text-sm font-normal text-gray-600">ms</span>
                    </p>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-sm text-gray-600">Cache Hit Rate</p>
                        <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded ${
                                cacheStatus.color === 'green'
                                    ? 'bg-green-100 text-green-800'
                                    : cacheStatus.color === 'blue'
                                    ? 'bg-blue-100 text-blue-800'
                                    : cacheStatus.color === 'yellow'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                            }`}
                        >
                            {cacheStatus.label}
                        </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">
                        {data.cacheHitRate.toFixed(1)}
                        <span className="text-sm font-normal text-gray-600">%</span>
                    </p>
                </div>
            </div>

            {/* Targets */}
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
                <strong>Targets:</strong> P95 latency &lt;200ms, Cache hit rate &gt;85%
            </div>
        </div>
    );
}
