'use client';

/**
 * Risk Distribution Chart Component (Phase 3)
 * 
 * Purpose: Visualize IdP risk distribution across tiers using a pie chart
 * Tiers: Gold (auto-approved), Silver (fast-track), Bronze (standard), Fail (rejected)
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface IRiskDistribution {
    gold: number;
    silver: number;
    bronze: number;
    fail: number;
}

interface Props {
    data: IRiskDistribution;
}

const COLORS = {
    gold: '#FFD700',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
    fail: '#DC2626',
};

const TIER_LABELS = {
    gold: 'Gold (85-100 pts)',
    silver: 'Silver (70-84 pts)',
    bronze: 'Bronze (50-69 pts)',
    fail: 'Fail (<50 pts)',
};

export default function RiskDistributionChart({ data }: Props) {
    // Transform data for recharts
    const chartData = [
        { name: TIER_LABELS.gold, value: data.gold, tier: 'gold' },
        { name: TIER_LABELS.silver, value: data.silver, tier: 'silver' },
        { name: TIER_LABELS.bronze, value: data.bronze, tier: 'bronze' },
        { name: TIER_LABELS.fail, value: data.fail, tier: 'fail' },
    ].filter(item => item.value > 0); // Only show tiers with data

    const total = data.gold + data.silver + data.bronze + data.fail;

    if (total === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-gray-500">
                No IdP submissions available
            </div>
        );
    }

    // Custom tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const item = payload[0];
            const percentage = ((item.value / total) * 100).toFixed(1);
            
            return (
                <div className="bg-white p-3 border border-gray-200 rounded shadow-lg">
                    <p className="font-semibold text-gray-800">{item.name}</p>
                    <p className="text-gray-600">
                        Count: <span className="font-medium">{item.value}</span>
                    </p>
                    <p className="text-gray-600">
                        Percentage: <span className="font-medium">{percentage}%</span>
                    </p>
                </div>
            );
        }
        return null;
    };

    return (
        <div>
            <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => {
                            const percentage = ((entry.value / total) * 100).toFixed(1);
                            return `${percentage}%`;
                        }}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                    >
                        {chartData.map((entry) => (
                            <Cell
                                key={`cell-${entry.tier}`}
                                fill={COLORS[entry.tier as keyof typeof COLORS]}
                            />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                </PieChart>
            </ResponsiveContainer>

            {/* Summary Stats */}
            <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-600">Total Submissions</p>
                    <p className="text-2xl font-bold text-gray-900">{total}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm text-gray-600">Auto-Approved (Gold)</p>
                    <p className="text-2xl font-bold text-yellow-600">{data.gold}</p>
                </div>
            </div>
        </div>
    );
}

