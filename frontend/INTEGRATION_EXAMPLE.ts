/**
 * Example: Updated API utility with dynamic configuration
 *
 * This shows how to integrate dynamic config into existing code
 */

import { getApiUrl, getKeycloakUrl } from '@/lib/dynamic-config';

/**
 * Get backend API URL (dynamically detects domain)
 */
export function getBackendUrl(): string {
  return getApiUrl();
}

/**
 * Get Keycloak URL (dynamically detects domain)
 */
export function getKeycloakBaseUrl(): string {
  return getKeycloakUrl();
}

/**
 * Example: Fetch resources from backend
 */
export async function fetchResources() {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/api/resources`);
  if (!response.ok) {
    throw new Error('Failed to fetch resources');
  }
  return response.json();
}

/**
 * Example: Fetch with authentication
 */
export async function fetchWithAuth(endpoint: string, token: string) {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.json();
}

/**
 * Example: Client-side component using dynamic config
 */
'use client';

import { useDynamicConfig } from '@/hooks/use-dynamic-config';

export function ResourceList() {
  const { apiUrl, instance } = useDynamicConfig();
  const [resources, setResources] = useState([]);

  useEffect(() => {
    // Automatically uses correct API URL
    fetch(`${apiUrl}/api/resources`)
      .then(res => res.json())
      .then(data => setResources(data));
  }, [apiUrl]);

  return (
    <div>
    <h2>Resources for { instance } </h2>
      < p > API: { apiUrl } </p>
  {/* render resources */ }
  </div>
  );
}
