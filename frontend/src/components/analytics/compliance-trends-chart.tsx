'use client';

/**
 * Compliance Trends Chart Component (Phase 3)
 * 
 * Purpose: Visualize compliance scores over time using a line chart
 * Standards: ACP-240, STANAG 4774, NIST 800-63
 */

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';

interface IComplianceTrends {
    dates: string[];
    acp240: number[];
    stanag4774: number[];
    nist80063: number[];
}

interface Props {
    data: IComplianceTrends;
}

export default function ComplianceTrendsChart({ data }: Props) {
    // Transform data for recharts
    const chartData = data.dates.map((date, index) => ({
        date: new Date(date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        }),
        'ACP-240': data.acp240[index],
        'STANAG 4774': data.stanag4774[index],
        'NIST 800-63': data.nist80063[index],
    }));

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-500">
                No compliance data available
            </div>
        );
    }

    // Calculate averages
    const avgACP240 =
        data.acp240.length > 0
            ? Math.round(data.acp240.reduce((a, b) => a + b, 0) / data.acp240.length)
            : 0;
    const avgSTANAG =
        data.stanag4774.length > 0
            ? Math.round(data.stanag4774.reduce((a, b) => a + b, 0) / data.stanag4774.length)
            : 0;
    const avgNIST =
        data.nist80063.length > 0
            ? Math.round(data.nist80063.reduce((a, b) => a + b, 0) / data.nist80063.length)
            : 0;

    return (
        <div>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line
                        type="monotone"
                        dataKey="ACP-240"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="STANAG 4774"
                        stroke="#10B981"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                    />
                    <Line
                        type="monotone"
                        dataKey="NIST 800-63"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Average Scores */}
            <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="bg-blue-50 p-3 rounded">
                    <p className="text-xs text-blue-600 font-medium">ACP-240 Avg</p>
                    <p className="text-xl font-bold text-blue-700">{avgACP240}</p>
                </div>
                <div className="bg-green-50 p-3 rounded">
                    <p className="text-xs text-green-600 font-medium">STANAG Avg</p>
                    <p className="text-xl font-bold text-green-700">{avgSTANAG}</p>
                </div>
                <div className="bg-yellow-50 p-3 rounded">
                    <p className="text-xs text-yellow-600 font-medium">NIST Avg</p>
                    <p className="text-xl font-bold text-yellow-700">{avgNIST}</p>
                </div>
            </div>
        </div>
    );
}

