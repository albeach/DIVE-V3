/**
 * Public Dashboard Stats API Route
 *
 * Returns basic public statistics without authentication
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    // Return static public stats - no backend call needed for basic demo
    const publicStats = {
        success: true,
        stats: [
            {
                value: "5000",
                label: "Documents Accessible",
                change: "+3 this week",
                trend: "up"
            },
            {
                value: "100%",
                label: "Authorization Rate",
                change: "Stable",
                trend: "neutral"
            },
            {
                value: "N/A",
                label: "Avg Response Time",
                change: "-12ms",
                trend: "up"
            }
        ]
    };

    return NextResponse.json(publicStats, { status: 200 });
}