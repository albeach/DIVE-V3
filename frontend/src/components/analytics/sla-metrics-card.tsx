'use client';

/**
 * SLA Metrics Card Component (Phase 3)
 * 
 * Purpose: Display SLA performance metrics
 * Metrics: Fast-track compliance, standard compliance, avg review time, SLA violations
 */

interface ISLAMetrics {
    fastTrackCompliance: number;
    standardCompliance: number;
    averageReviewTime: number;
    exceededCount: number;
}

interface Props {
    data: ISLAMetrics;
}

export default function SLAMetricsCard({ data }: Props) {
    // Determine status colors based on compliance
    const getFastTrackStatus = (compliance: number) => {
        if (compliance >= 95) return { color: 'green', label: 'Excellent' };
        if (compliance >= 90) return { color: 'blue', label: 'Good' };
        if (compliance >= 80) return { color: 'yellow', label: 'Fair' };
        return { color: 'red', label: 'Poor' };
    };

    const getStandardStatus = (compliance: number) => {
        if (compliance >= 95) return { color: 'green', label: 'Excellent' };
        if (compliance >= 90) return { color: 'blue', label: 'Good' };
        if (compliance >= 80) return { color: 'yellow', label: 'Fair' };
        return { color: 'red', label: 'Poor' };
    };

    const fastTrackStatus = getFastTrackStatus(data.fastTrackCompliance);
    const standardStatus = getStandardStatus(data.standardCompliance);

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">SLA Performance</h2>

            {/* Fast-Track SLA */}
            <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Fast-Track (2hr SLA)</span>
                    <span
                        className={`px-2 py-1 text-xs font-semibold rounded ${
                            fastTrackStatus.color === 'green'
                                ? 'bg-green-100 text-green-800'
                                : fastTrackStatus.color === 'blue'
                                ? 'bg-blue-100 text-blue-800'
                                : fastTrackStatus.color === 'yellow'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                    >
                        {fastTrackStatus.label}
                    </span>
                </div>
                <div className="flex items-baseline">
                    <span className="text-3xl font-bold text-gray-900">
                        {data.fastTrackCompliance.toFixed(1)}%
                    </span>
                    <span className="ml-2 text-sm text-gray-500">compliance</span>
                </div>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full ${
                            fastTrackStatus.color === 'green'
                                ? 'bg-green-500'
                                : fastTrackStatus.color === 'blue'
                                ? 'bg-blue-500'
                                : fastTrackStatus.color === 'yellow'
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(data.fastTrackCompliance, 100)}%` }}
                    />
                </div>
            </div>

            {/* Standard SLA */}
            <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-700">Standard (24hr SLA)</span>
                    <span
                        className={`px-2 py-1 text-xs font-semibold rounded ${
                            standardStatus.color === 'green'
                                ? 'bg-green-100 text-green-800'
                                : standardStatus.color === 'blue'
                                ? 'bg-blue-100 text-blue-800'
                                : standardStatus.color === 'yellow'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                    >
                        {standardStatus.label}
                    </span>
                </div>
                <div className="flex items-baseline">
                    <span className="text-3xl font-bold text-gray-900">
                        {data.standardCompliance.toFixed(1)}%
                    </span>
                    <span className="ml-2 text-sm text-gray-500">compliance</span>
                </div>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                    <div
                        className={`h-2 rounded-full ${
                            standardStatus.color === 'green'
                                ? 'bg-green-500'
                                : standardStatus.color === 'blue'
                                ? 'bg-blue-500'
                                : standardStatus.color === 'yellow'
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(data.standardCompliance, 100)}%` }}
                    />
                </div>
            </div>

            {/* Additional Metrics */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                    <p className="text-sm text-gray-600">Avg Review Time</p>
                    <p className="text-2xl font-bold text-gray-900">
                        {data.averageReviewTime.toFixed(1)}
                        <span className="text-sm font-normal text-gray-600">hr</span>
                    </p>
                </div>
                <div>
                    <p className="text-sm text-gray-600">SLA Violations</p>
                    <p className="text-2xl font-bold text-red-600">{data.exceededCount}</p>
                </div>
            </div>

            {/* Target Note */}
            <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
                <strong>Target:</strong> ≥95% compliance for both fast-track and standard reviews
            </div>
        </div>
    );
}

