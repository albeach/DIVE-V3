'use client';

/**
 * Security Posture Card Component (Phase 3)
 * 
 * Purpose: Display overall security posture overview
 * Metrics: Average risk score, compliance rate, MFA adoption, TLS 1.3 adoption
 */

interface ISecurityPosture {
    averageRiskScore: number;
    complianceRate: number;
    mfaAdoptionRate: number;
    tls13AdoptionRate: number;
}

interface Props {
    data: ISecurityPosture;
}

export default function SecurityPostureCard({ data }: Props) {
    // Determine overall security health
    const getOverallHealth = () => {
        const score =
            data.averageRiskScore * 0.4 +
            data.complianceRate * 0.3 +
            data.mfaAdoptionRate * 0.15 +
            data.tls13AdoptionRate * 0.15;

        if (score >= 85) return { color: 'green', label: 'Excellent', icon: '✓' };
        if (score >= 75) return { color: 'blue', label: 'Good', icon: '✓' };
        if (score >= 60) return { color: 'yellow', label: 'Fair', icon: '⚠' };
        return { color: 'red', label: 'Needs Attention', icon: '✗' };
    };

    const overallHealth = getOverallHealth();

    // Get status for individual metrics
    const getRiskScoreStatus = (score: number) => {
        if (score >= 85) return 'text-green-600';
        if (score >= 70) return 'text-blue-600';
        if (score >= 50) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getComplianceStatus = (rate: number) => {
        if (rate >= 90) return 'text-green-600';
        if (rate >= 75) return 'text-blue-600';
        if (rate >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getMFAStatus = (rate: number) => {
        if (rate >= 95) return 'text-green-600';
        if (rate >= 80) return 'text-blue-600';
        if (rate >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getTLSStatus = (rate: number) => {
        if (rate >= 80) return 'text-green-600';
        if (rate >= 60) return 'text-blue-600';
        if (rate >= 40) return 'text-yellow-600';
        return 'text-red-600';
    };

    return (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 border border-blue-200">
            {/* Overall Health Badge */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Security Posture</h2>
                <div
                    className={`px-4 py-2 rounded-full font-semibold flex items-center space-x-2 ${
                        overallHealth.color === 'green'
                            ? 'bg-green-100 text-green-800'
                            : overallHealth.color === 'blue'
                            ? 'bg-blue-100 text-blue-800'
                            : overallHealth.color === 'yellow'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                    }`}
                >
                    <span className="text-xl">{overallHealth.icon}</span>
                    <span>{overallHealth.label}</span>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Average Risk Score */}
                <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-2">Avg Risk Score</p>
                    <p className={`text-3xl font-bold ${getRiskScoreStatus(data.averageRiskScore)}`}>
                        {data.averageRiskScore.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">out of 100</p>
                    <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full ${
                                data.averageRiskScore >= 85
                                    ? 'bg-green-500'
                                    : data.averageRiskScore >= 70
                                    ? 'bg-blue-500'
                                    : data.averageRiskScore >= 50
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                            }`}
                            style={{ width: `${data.averageRiskScore}%` }}
                        />
                    </div>
                </div>

                {/* Compliance Rate */}
                <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-2">Compliance Rate</p>
                    <p className={`text-3xl font-bold ${getComplianceStatus(data.complianceRate)}`}>
                        {data.complianceRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">≥70 points</p>
                    <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full ${
                                data.complianceRate >= 90
                                    ? 'bg-green-500'
                                    : data.complianceRate >= 75
                                    ? 'bg-blue-500'
                                    : data.complianceRate >= 60
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                            }`}
                            style={{ width: `${data.complianceRate}%` }}
                        />
                    </div>
                </div>

                {/* MFA Adoption */}
                <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-2">MFA Adoption</p>
                    <p className={`text-3xl font-bold ${getMFAStatus(data.mfaAdoptionRate)}`}>
                        {data.mfaAdoptionRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">of IdPs</p>
                    <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full ${
                                data.mfaAdoptionRate >= 95
                                    ? 'bg-green-500'
                                    : data.mfaAdoptionRate >= 80
                                    ? 'bg-blue-500'
                                    : data.mfaAdoptionRate >= 60
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                            }`}
                            style={{ width: `${data.mfaAdoptionRate}%` }}
                        />
                    </div>
                </div>

                {/* TLS 1.3 Adoption */}
                <div className="bg-white rounded-lg p-4 shadow">
                    <p className="text-sm text-gray-600 mb-2">TLS 1.3 Adoption</p>
                    <p className={`text-3xl font-bold ${getTLSStatus(data.tls13AdoptionRate)}`}>
                        {data.tls13AdoptionRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">of IdPs</p>
                    <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full ${
                                data.tls13AdoptionRate >= 80
                                    ? 'bg-green-500'
                                    : data.tls13AdoptionRate >= 60
                                    ? 'bg-blue-500'
                                    : data.tls13AdoptionRate >= 40
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                            }`}
                            style={{ width: `${data.tls13AdoptionRate}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Recommendations */}
            <div className="mt-4 p-4 bg-white rounded-lg shadow">
                <p className="text-sm font-semibold text-gray-700 mb-2">Recommendations:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                    {data.averageRiskScore < 70 && (
                        <li>• Focus on improving average risk scores through better validation</li>
                    )}
                    {data.mfaAdoptionRate < 90 && (
                        <li>• Encourage MFA adoption across all IdPs for enhanced security</li>
                    )}
                    {data.tls13AdoptionRate < 80 && (
                        <li>• Mandate TLS 1.3 for new IdP integrations</li>
                    )}
                    {data.complianceRate < 85 && (
                        <li>• Increase compliance requirements for IdP approval</li>
                    )}
                    {data.averageRiskScore >= 85 &&
                        data.mfaAdoptionRate >= 90 &&
                        data.tls13AdoptionRate >= 80 &&
                        data.complianceRate >= 85 && (
                            <li className="text-green-600">
                                ✓ Security posture is excellent. Continue monitoring trends.
                            </li>
                        )}
                </ul>
            </div>
        </div>
    );
}

