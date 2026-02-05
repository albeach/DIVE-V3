'use client';

import { useMemo } from 'react';
import { getDynamicConfig } from '@/lib/dynamic-config';

/**
 * React hook for accessing dynamic configuration
 * Automatically detects the current domain and returns appropriate URLs
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { apiUrl, keycloakUrl, realm, instance } = useDynamicConfig();
 *   
 *   const fetchData = async () => {
 *     const response = await fetch(`${apiUrl}/api/resources`);
 *     // ...
 *   };
 * }
 * ```
 */
export function useDynamicConfig() {
  const config = useMemo(() => {
    return getDynamicConfig();
  }, []); // Empty deps since hostname doesn't change during session

  return {
    apiUrl: config.api,
    keycloakUrl: config.keycloak,
    realm: config.realm,
    instance: config.instance,
    issuer: `${config.keycloak}/realms/${config.realm}`,
  };
}

/**
 * Hook to check if we're on a specific instance
 */
export function useInstance() {
  const { instance } = useDynamicConfig();
  return {
    instance,
    isUSA: instance === 'USA',
    isFRA: instance === 'FRA',
    isGBR: instance === 'GBR',
    isHub: instance === 'USA', // USA is the hub
  };
}
