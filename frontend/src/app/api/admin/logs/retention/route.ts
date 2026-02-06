/**
 * Admin Logs Retention API Route
 *
 * GET  - Retrieve current log retention configuration
 * PUT  - Update log retention configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createAdminBackendFetch } from '@/middleware/admin-auth';
import { getBackendUrl } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const BACKEND_URL = getBackendUrl();

export const GET = withAuth(async (request, { tokens }) => {
    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/logs/retention`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Backend error' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || `Backend returned ${response.status}`,
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});

export const PUT = withAuth(async (request, { tokens }) => {
    const body = await request.json();
    const {
        auditLogs,
        securityLogs,
        accessLogs,
        systemLogs,
        maxStorageGB,
    } = body;

    // Validate retention days are positive integers when provided
    const retentionFields = { auditLogs, securityLogs, accessLogs, systemLogs };
    for (const [field, value] of Object.entries(retentionFields)) {
        if (value !== undefined && (typeof value !== 'number' || value < 1 || !Number.isInteger(value))) {
            return NextResponse.json(
                { success: false, error: 'ValidationError', message: `${field} must be a positive integer (days)` },
                { status: 400 }
            );
        }
    }

    if (maxStorageGB !== undefined && (typeof maxStorageGB !== 'number' || maxStorageGB < 1)) {
        return NextResponse.json(
            { success: false, error: 'ValidationError', message: 'maxStorageGB must be a positive number' },
            { status: 400 }
        );
    }

    const backendFetch = createAdminBackendFetch(tokens, BACKEND_URL);
    const response = await backendFetch(`/api/admin/logs/retention`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update retention config' }));
        return NextResponse.json(
            {
                success: false,
                error: 'BackendError',
                message: error.message || `Backend returned ${response.status}`,
            },
            { status: response.status }
        );
    }

    const data = await response.json();
    return NextResponse.json(data);
});
