/**
 * IdP Management API Layer
 * 
 * Consolidated API calls with React Query for:
 * - Caching
 * - Retries
 * - Optimistic updates
 * - Error recovery
 * 
 * Phase 1.4: Shared API Layer
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { IIdPListItem, IIdPTestResult, IApiResponse } from '@/types/admin.types';
import React from 'react';

// ============================================
// API Client
// ============================================

// Use Next.js API routes as proxy (no direct backend calls - security best practice)
const API_BASE_URL = '';

class IdPManagementAPI {
    private static getHeaders(): HeadersInit {
        // No Authorization header needed - proxy routes handle auth server-side
        return {
            'Content-Type': 'application/json'
        };
    }

    private static async handleResponse<T>(response: Response): Promise<T> {
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({
                message: `HTTP ${response.status}: ${response.statusText}`
            }));

            throw new Error(errorData.message || errorData.error || 'API request failed');
        }

        return response.json();
    }

    // ============================================
    // IdP List
    // ============================================

    static async listIdPs(): Promise<IIdPListItem[]> {
        try {
            // Use proxy route (handles auth server-side)
            const response = await fetch(`${API_BASE_URL}/api/admin/idps`, {
                method: 'GET',
                headers: this.getHeaders(),
                credentials: 'include',
                cache: 'no-store',
            });

            const data = await this.handleResponse<IApiResponse<{ idps: IIdPListItem[]; total: number }>>(response);

            // DEFENSIVE: Backend returns { data: { idps: [...], total: N } }
            if (data.data && typeof data.data === 'object' && 'idps' in data.data) {
                const idpsList = (data.data as any).idps;
                if (Array.isArray(idpsList)) {
                    console.log('[IdP API] Successfully fetched IdPs:', {
                        count: idpsList.length,
                        total: (data.data as any).total
                    });
                    return idpsList;
                }
            }

            // Legacy format: { data: [...] }
            if (data.data && Array.isArray(data.data)) {
                return data.data;
            }

            // Invalid format
            console.warn('[IdP API] Invalid response format:', {
                hasData: !!data.data,
                dataType: typeof data.data,
                isArray: Array.isArray(data.data),
                response: data
            });
            return [];
        } catch (error) {
            console.error('[IdP API] Failed to fetch IdPs:', error);
            // Return empty array instead of throwing to prevent app crash
            return [];
        }
    }

    // ============================================
    // IdP Details
    // ============================================

    static async getIdP(alias: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}`, {
            method: 'GET',
            headers: this.getHeaders(),
            credentials: 'include',
            cache: 'no-store',
        });

        const data = await this.handleResponse<IApiResponse<any>>(response);
        return data.data;
    }

    // ============================================
    // Update IdP
    // ============================================

    static async updateIdP(alias: string, updates: any): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}`, {
            method: 'PUT',
            headers: this.getHeaders(),
            credentials: 'include',
            body: JSON.stringify(updates)
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    // ============================================
    // Delete IdP
    // ============================================

    static async deleteIdP(alias: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    // ============================================
    // Test IdP
    // ============================================

    static async testIdP(alias: string): Promise<IIdPTestResult> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/test`, {
            method: 'POST',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        const data = await this.handleResponse<IApiResponse<IIdPTestResult>>(response);
        return data.data || { success: false, message: 'Test failed' } as IIdPTestResult;
    }

    // ============================================
    // MFA Configuration (Phase 1.5)
    // ============================================

    static async getMFAConfig(alias: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/mfa-config`, {
            method: 'GET',
            headers: this.getHeaders(),
            credentials: 'include',
            cache: 'no-store',
        });

        const data = await this.handleResponse<IApiResponse<any>>(response);
        return data.data;
    }

    static async updateMFAConfig(alias: string, config: any): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/mfa-config`, {
            method: 'PUT',
            headers: this.getHeaders(),
            credentials: 'include',
            body: JSON.stringify(config)
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    static async testMFAFlow(alias: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/mfa-config/test`, {
            method: 'POST',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        const data = await this.handleResponse<IApiResponse<any>>(response);
        return data.data;
    }

    // ============================================
    // Session Management (Phase 1.6)
    // ============================================

    static async getSessions(alias: string, filters?: any): Promise<any[]> {
        const params = new URLSearchParams();
        if (filters?.username) params.set('username', filters.username);
        if (filters?.clientId) params.set('clientId', filters.clientId);
        if (filters?.ipAddress) params.set('ipAddress', filters.ipAddress);

        const url = `${API_BASE_URL}/api/admin/idps/${alias}/sessions${params.toString() ? `?${params.toString()}` : ''}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: this.getHeaders(),
            credentials: 'include',
            cache: 'no-store',
        });

        const data = await this.handleResponse<IApiResponse<any[]>>(response);
        return data.data || [];
    }

    static async revokeSession(alias: string, sessionId: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    static async revokeUserSessions(alias: string, username: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/users/${username}/sessions`, {
            method: 'DELETE',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    static async getSessionStats(alias: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/sessions/stats`, {
            method: 'GET',
            headers: this.getHeaders(),
            credentials: 'include',
            cache: 'no-store',
        });

        const data = await this.handleResponse<IApiResponse<any>>(response);
        return data.data;
    }

    // ============================================
    // Theme Management (Phase 1.7)
    // ============================================

    static async getTheme(alias: string): Promise<any> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/theme`, {
            method: 'GET',
            headers: this.getHeaders(),
            credentials: 'include',
            cache: 'no-store',
        });

        const data = await this.handleResponse<IApiResponse<any>>(response);
        return data.data;
    }

    static async updateTheme(alias: string, theme: any): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/theme`, {
            method: 'PUT',
            headers: this.getHeaders(),
            credentials: 'include',
            body: JSON.stringify(theme)
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    static async uploadThemeAsset(alias: string, file: File, type: 'background' | 'logo'): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', type);

        // File upload doesn't need Content-Type header (browser sets it with boundary)
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/theme/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await this.handleResponse<IApiResponse<{ url: string }>>(response);
        return data.data?.url || '';
    }

    static async deleteTheme(alias: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/theme`, {
            method: 'DELETE',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        await this.handleResponse<IApiResponse<any>>(response);
    }

    static async previewTheme(alias: string): Promise<string> {
        const response = await fetch(`${API_BASE_URL}/api/admin/idps/${alias}/theme/preview`, {
            method: 'GET',
            headers: this.getHeaders(),
            credentials: 'include'
        });

        return response.text();
    }
}

// ============================================
// React Query Hooks
// ============================================

const QUERY_KEYS = {
    idps: ['idps'] as const,
    idp: (alias: string) => ['idps', alias] as const,
    mfaConfig: (alias: string) => ['idps', alias, 'mfa-config'] as const,
    sessions: (alias: string, filters?: any) => ['idps', alias, 'sessions', filters] as const,
    sessionStats: (alias: string) => ['idps', alias, 'sessions', 'stats'] as const,
    theme: (alias: string) => ['idps', alias, 'theme'] as const
};

// ============================================
// useIdPs - List all IdPs
// ============================================

export function useIdPs(options?: Omit<UseQueryOptions<IIdPListItem[], Error>, 'queryKey' | 'queryFn'>) {
    const { data: session, status } = useSession();

    // Log the query state for debugging
    React.useEffect(() => {
        console.log('[useIdPs] Hook state:', {
            status,
            hasSession: !!session,
            sessionUser: (session as any)?.user?.email || 'none'
        });
    }, [session, status]);

    return useQuery<IIdPListItem[], Error>({
        queryKey: QUERY_KEYS.idps,
        queryFn: () => {
            console.log('[useIdPs] Fetching IdPs via proxy route');
            return IdPManagementAPI.listIdPs();
        },
        // Enable when authenticated (proxy handles token server-side)
        enabled: status === 'authenticated',
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
        retry: 3,
        ...options
    });
}

// ============================================
// useIdP - Get specific IdP details
// ============================================

export function useIdP(alias: string | null, options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>) {
    const { status } = useSession();

    return useQuery<any, Error>({
        queryKey: QUERY_KEYS.idp(alias || ''),
        queryFn: () => IdPManagementAPI.getIdP(alias!),
        enabled: status === 'authenticated' && !!alias,
        staleTime: 2 * 60 * 1000, // 2 minutes
        retry: 2,
        ...options
    });
}

// ============================================
// useUpdateIdP - Update IdP mutation
// ============================================

export function useUpdateIdP(options?: UseMutationOptions<void, Error, { alias: string; updates: any }>) {
    const queryClient = useQueryClient();

    return useMutation<void, Error, { alias: string; updates: any }>({
        mutationFn: ({ alias, updates }) => IdPManagementAPI.updateIdP(alias, updates),
        onSuccess: (_, variables) => {
            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.idps });
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.idp(variables.alias) });
        },
        ...options
    });
}

// ============================================
// useDeleteIdP - Delete IdP mutation
// ============================================

export function useDeleteIdP(options?: UseMutationOptions<void, Error, string>) {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: (alias) => IdPManagementAPI.deleteIdP(alias),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.idps });
        },
        ...options
    });
}

// ============================================
// useTestIdP - Test IdP connection
// ============================================

export function useTestIdP(options?: UseMutationOptions<IIdPTestResult, Error, string>) {
    return useMutation<IIdPTestResult, Error, string>({
        mutationFn: (alias) => IdPManagementAPI.testIdP(alias),
        ...options
    });
}

// ============================================
// useMFAConfig - Get MFA configuration
// ============================================

export function useMFAConfig(alias: string | null, options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>) {
    const { status } = useSession();

    return useQuery<any, Error>({
        queryKey: QUERY_KEYS.mfaConfig(alias || ''),
        queryFn: () => IdPManagementAPI.getMFAConfig(alias!),
        enabled: status === 'authenticated' && !!alias,
        staleTime: 5 * 60 * 1000,
        ...options
    });
}

// ============================================
// useUpdateMFAConfig - Update MFA configuration
// ============================================

export function useUpdateMFAConfig(options?: UseMutationOptions<void, Error, { alias: string; config: any }>) {
    const queryClient = useQueryClient();

    return useMutation<void, Error, { alias: string; config: any }>({
        mutationFn: ({ alias, config }) => IdPManagementAPI.updateMFAConfig(alias, config),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mfaConfig(variables.alias) });
        },
        ...options
    });
}

// ============================================
// useSessions - Get active sessions
// ============================================

export function useSessions(alias: string | null, filters?: any, options?: Omit<UseQueryOptions<any[], Error>, 'queryKey' | 'queryFn'>) {
    const { status } = useSession();

    return useQuery<any[], Error>({
        queryKey: QUERY_KEYS.sessions(alias || '', filters),
        queryFn: () => IdPManagementAPI.getSessions(alias!, filters),
        enabled: status === 'authenticated' && !!alias,
        staleTime: 10 * 1000, // 10 seconds (real-time data)
        refetchInterval: 10 * 1000, // Auto-refresh every 10 seconds
        ...options
    });
}

// ============================================
// useRevokeSession - Revoke session mutation
// ============================================

export function useRevokeSession(options?: UseMutationOptions<void, Error, { alias: string; sessionId: string }>) {
    const queryClient = useQueryClient();

    return useMutation<void, Error, { alias: string; sessionId: string }>({
        mutationFn: ({ alias, sessionId }) => IdPManagementAPI.revokeSession(alias, sessionId),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sessions(variables.alias) });
        },
        ...options
    });
}

// ============================================
// useTheme - Get theme
// ============================================

export function useTheme(alias: string | null, options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>) {
    const { status } = useSession();

    return useQuery<any, Error>({
        queryKey: QUERY_KEYS.theme(alias || ''),
        queryFn: () => IdPManagementAPI.getTheme(alias!),
        enabled: status === 'authenticated' && !!alias,
        staleTime: 10 * 60 * 1000, // 10 minutes
        ...options
    });
}

// ============================================
// useUpdateTheme - Update theme mutation
// ============================================

export function useUpdateTheme(options?: UseMutationOptions<void, Error, { alias: string; theme: any }>) {
    const queryClient = useQueryClient();

    return useMutation<void, Error, { alias: string; theme: any }>({
        mutationFn: ({ alias, theme }) => IdPManagementAPI.updateTheme(alias, theme),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.theme(variables.alias) });
        },
        ...options
    });
}

// ============================================
// Export API client for direct use
// ============================================

export { IdPManagementAPI };

