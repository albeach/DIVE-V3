# 🚀 Dynamic Configuration Quick Reference

## Import Statements

```typescript
// React Components (Client-Side)
import { useDynamicConfig, useInstance } from '@/hooks/use-dynamic-config';

// API Routes (Server-Side)
import { getBackendUrl, backendFetch } from '@/lib/api-utils';

// Server Components
import { getApiUrl, getKeycloakUrl, getDynamicConfig } from '@/lib/dynamic-config';
```

## Usage Patterns

### React Components

```typescript
function MyComponent() {
  const { apiUrl, keycloakUrl, realm, instance } = useDynamicConfig();
  const { isHub, isSpoke } = useInstance();

  return (
    <div>
      <p>Instance: {instance}</p>
      <p>API: {apiUrl}</p>
      {isHub && <HubFeatures />}
    </div>
  );
}
```

### API Routes

```typescript
export async function GET(request: Request) {
  // Simple URL
  const backendUrl = getBackendUrl();

  // Or use helper
  const response = await backendFetch('/api/resources');
  const data = await response.json();

  return Response.json(data);
}
```

### Server Components

```typescript
export default async function Page() {
  const config = getDynamicConfig();
  const response = await fetch(`${config.api}/api/data`);
  const data = await response.json();

  return <div>{/* render */}</div>;
}
```

## Domain Mappings

| Frontend Domain | API URL | Keycloak URL | Instance |
|----------------|---------|--------------|----------|
| usa-app.dive25.com | usa-api.dive25.com | usa-idp.dive25.com | USA |
| fra-app.dive25.com | fra-api.dive25.com | fra-idp.dive25.com | FRA |
| gbr-app.dive25.com | gbr-api.dive25.com | gbr-idp.dive25.com | GBR |
| localhost:3000 | localhost:4000 | localhost:8443 | USA |
| localhost:3010 | localhost:4010 | localhost:8453 | FRA |
| localhost:3031 | localhost:4031 | localhost:8474 | GBR |

## Migration Commands

```bash
# See what needs migration
./scripts/migrate-to-dynamic-config.sh

# Auto-migrate all API routes
./scripts/auto-migrate-api-routes.sh

# Test build
cd frontend && npm run build

# Test locally
npm run dev
```

## Testing

```typescript
// Browser console
import { getDynamicConfig } from '@/lib/dynamic-config';
console.log(getDynamicConfig());

// Expected on usa-app.dive25.com:
// {
//   api: "https://usa-api.dive25.com",
//   keycloak: "https://usa-idp.dive25.com",
//   realm: "dive-v3-broker-usa",
//   instance: "USA"
// }
```

## Common Functions

| Function | Context | Returns |
|----------|---------|---------|
| `useDynamicConfig()` | Client | `{ apiUrl, keycloakUrl, realm, instance, issuer }` |
| `useInstance()` | Client | `{ instance, isUSA, isFRA, isGBR, isHub }` |
| `getApiUrl()` | Server | `string` (API URL) |
| `getKeycloakUrl()` | Server | `string` (Keycloak URL) |
| `getBackendUrl()` | Server | `string` (prefers BACKEND_URL env) |
| `getDynamicConfig()` | Both | `{ api, keycloak, realm, instance }` |
| `backendFetch(url)` | Server | `Promise<Response>` |

## Files Reference

- **Core:** `src/lib/dynamic-config.ts`
- **Hooks:** `src/hooks/use-dynamic-config.ts`
- **Utils:** `src/lib/api-utils.ts`
- **Guide:** `DYNAMIC_CONFIG_GUIDE.md`
- **Examples:** `INTEGRATION_EXAMPLE.ts`

## Quick Tips

✅ **DO:**
- Use `useDynamicConfig()` in client components
- Use `getBackendUrl()` in API routes
- Use `getDynamicConfig()` in server components
- Test on all domains before deploying

❌ **DON'T:**
- Hardcode `process.env.NEXT_PUBLIC_API_URL`
- Hardcode `localhost:4000` or specific ports
- Use environment variables directly for URLs
- Forget to import the helpers
