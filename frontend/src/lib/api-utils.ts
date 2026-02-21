/**
 * Server-side API utilities for dynamic configuration
 * Use these in API routes and server components
 */

import { getApiUrl, getKeycloakUrl, getDynamicConfig } from '@/lib/dynamic-config';

/**
 * Get backend API URL for server-side calls
 * Automatically detects the correct URL based on the current environment
 *
 * Priority:
 * 1. BACKEND_URL env var (internal Docker service name for server-to-server)
 * 2. Dynamic config based on hostname (for external calls)
 * 3. Fallback to localhost
 */
export function getBackendUrl(): string {
  // Server-to-server: use internal Docker service name
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL;
  }

  // External/client-facing: use dynamic config
  return getApiUrl();
}

/**
 * Get Keycloak URL for server-side calls
 *
 * Priority:
 * 1. KEYCLOAK_URL env var (internal Docker service name)
 * 2. Dynamic config based on hostname
 * 3. Fallback to localhost
 */
export function getKeycloakServerUrl(): string {
  // Server-to-server: use internal Docker service name
  if (process.env.KEYCLOAK_URL) {
    return process.env.KEYCLOAK_URL;
  }

  // External/client-facing: use dynamic config
  return getKeycloakUrl();
}

/**
 * Create a fetch wrapper with automatic backend URL resolution
 *
 * @example
 * const data = await backendFetch('/api/resources');
 * const user = await backendFetch('/api/users/123', { method: 'GET' });
 */
export async function backendFetch(endpoint: string, options?: RequestInit) {
  const baseUrl = getBackendUrl();
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
  }

  return response;
}

/**
 * Create a fetch wrapper with authentication
 *
 * @example
 * const data = await authenticatedBackendFetch('/api/resources', token);
 */
export async function authenticatedBackendFetch(
  endpoint: string,
  token: string,
  options?: RequestInit
) {
  return backendFetch(endpoint, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });
}

/**
 * Get current instance configuration
 * Useful for conditional logic based on instance
 */
export function getInstanceConfig() {
  const config = getDynamicConfig();
  return {
    instance: config.instance,
    isHub: config.instance === 'USA',
    isSpoke: config.instance !== 'USA',
    apiUrl: config.api,
    keycloakUrl: config.keycloak,
    realm: config.realm,
  };
}
