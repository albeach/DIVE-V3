# Dynamic Multi-Domain Configuration for DIVE V3

## Problem

The frontend was hardcoded to use `localhost` URLs via environment variables (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_KEYCLOAK_URL`), making it impossible to dynamically respond to different domains (e.g., `usa-app.dive25.com` vs `fra-app.dive25.com` vs `gbr-app.dive25.com`).

## Solution

Dynamic configuration system that automatically detects the current domain and configures the appropriate URLs.

## Files Created

1. **`src/lib/dynamic-config.ts`** - Core configuration logic
2. **`src/hooks/use-dynamic-config.ts`** - React hook for client-side
3. **`src/middleware-dynamic-host.ts`** - Next.js middleware (optional)

## Usage

### Client-Side (React Components)

```typescript
import { useDynamicConfig } from '@/hooks/use-dynamic-config';

function MyComponent() {
  const { apiUrl, keycloakUrl, realm, instance } = useDynamicConfig();
  
  const fetchData = async () => {
    // Automatically uses correct URL based on current domain
    const response = await fetch(`${apiUrl}/api/resources`);
    const data = await response.json();
    return data;
  };
  
  return (
    <div>
      <p>Instance: {instance}</p>
      <p>API: {apiUrl}</p>
    </div>
  );
}
```

### Server-Side (API Routes)

```typescript
import { getDynamicConfig } from '@/lib/dynamic-config';

export async function GET(request: Request) {
  // Get host from request headers
  const host = request.headers.get('host');
  
  // Or use the utility
  const config = getDynamicConfig();
  
  const response = await fetch(`${config.api}/api/backend-endpoint`);
  return Response.json(await response.json());
}
```

### Server Components

```typescript
import { getDynamicConfig } from '@/lib/dynamic-config';

export default async function ServerPage() {
  const config = getDynamicConfig();
  
  const data = await fetch(`${config.api}/api/data`);
  
  return <div>{/* render data */}</div>;
}
```

## Domain Mapping

The system automatically maps domains to their respective configurations:

| Frontend Domain | API URL | Keycloak URL | Instance |
|----------------|---------|--------------|----------|
| usa-app.dive25.com | https://usa-api.dive25.com | https://usa-idp.dive25.com | USA |
| fra-app.dive25.com | https://fra-api.dive25.com | https://fra-idp.dive25.com | FRA |
| gbr-app.dive25.com | https://gbr-api.dive25.com | https://gbr-idp.dive25.com | GBR |
| localhost:3000 | https://localhost:4000 | https://localhost:8443 | USA |
| localhost:3010 | https://localhost:4010 | https://localhost:8453 | FRA |
| localhost:3031 | https://localhost:4031 | https://localhost:8474 | GBR |

## Migration Guide

### Replace Hardcoded URLs

**Before:**
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const response = await fetch(`${API_URL}/api/endpoint`);
```

**After:**
```typescript
import { getApiUrl } from '@/lib/dynamic-config';

const response = await fetch(`${getApiUrl()}/api/endpoint`);
```

### Replace in React Components

**Before:**
```typescript
function Component() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  // ...
}
```

**After:**
```typescript
import { useDynamicConfig } from '@/hooks/use-dynamic-config';

function Component() {
  const { apiUrl } = useDynamicConfig();
  // ...
}
```

## Key Files to Update

### High Priority (Most Used)

1. **`src/auth.ts`** - NextAuth configuration
   - Replace `process.env.NEXT_PUBLIC_KEYCLOAK_URL`
   - Replace `process.env.NEXT_PUBLIC_KEYCLOAK_REALM`

2. **`next.config.ts`** - CSP and external URLs
   - Update to use dynamic configuration

3. **`src/app/api/*/route.ts`** - All API routes
   - Replace hardcoded `BACKEND_URL` with `getApiUrl()`

### Common Patterns

```typescript
// Pattern 1: API calls
import { getApiUrl } from '@/lib/dynamic-config';
const response = await fetch(`${getApiUrl()}/api/endpoint`);

// Pattern 2: Keycloak URLs
import { getKeycloakUrl, getKeycloakRealm } from '@/lib/dynamic-config';
const authUrl = `${getKeycloakUrl()}/realms/${getKeycloakRealm()}/protocol/openid-connect/auth`;

// Pattern 3: React components
import { useDynamicConfig } from '@/hooks/use-dynamic-config';
const { apiUrl, instance } = useDynamicConfig();

// Pattern 4: Check instance
import { useInstance } from '@/hooks/use-dynamic-config';
const { isHub, instance } = useInstance();
if (isHub) {
  // Hub-specific logic
}
```

## Adding New Instances

To add a new instance (e.g., DEU - Germany):

1. Update `DOMAIN_CONFIG` in `src/lib/dynamic-config.ts`:

```typescript
const DOMAIN_CONFIG = {
  // ... existing configs ...
  'deu-app.dive25.com': {
    api: 'https://deu-api.dive25.com',
    keycloak: 'https://deu-idp.dive25.com',
    realm: 'dive-v3-broker-deu',
    instance: 'DEU',
  },
  'localhost:3040': {
    api: 'https://localhost:4040',
    keycloak: 'https://localhost:8480',
    realm: 'dive-v3-broker-deu',
    instance: 'DEU',
  },
};
```

2. Create cloudflared tunnel configuration
3. Create DNS records
4. Deploy - no code changes needed!

## Benefits

✅ **No hardcoded URLs** - Works on any domain automatically  
✅ **Multi-instance support** - USA, FRA, GBR work out of the box  
✅ **Development friendly** - localhost:3000/3010/3031 all work  
✅ **Easy to extend** - Add new instances by updating config only  
✅ **Type-safe** - Full TypeScript support  
✅ **SSR compatible** - Works in both client and server contexts  

## Testing

### Test in Browser Console

```javascript
// Check current config
import { getDynamicConfig } from '@/lib/dynamic-config';
console.log(getDynamicConfig());

// Output:
// {
//   api: "https://usa-api.dive25.com",
//   keycloak: "https://usa-idp.dive25.com",
//   realm: "dive-v3-broker-usa",
//   instance: "USA"
// }
```

### Test Different Domains

1. Access `https://usa-app.dive25.com` → Should use USA URLs
2. Access `https://fra-app.dive25.com` → Should use FRA URLs
3. Access `https://gbr-app.dive25.com` → Should use GBR URLs
4. Access `localhost:3000` → Should use localhost:4000/8443
5. Access `localhost:3010` → Should use localhost:4010/8453
6. Access `localhost:3031` → Should use localhost:4031/8474

## Fallback Behavior

If the domain doesn't match any configured domain:

1. Tries to parse instance from hostname pattern (e.g., `usa-app` → USA)
2. Falls back to environment variables
3. Ultimate fallback: localhost development URLs

## Environment Variables (Optional Override)

You can still use environment variables to override for specific deployments:

```bash
# Override for special deployments
NEXT_PUBLIC_API_URL=https://custom-api.example.com
NEXT_PUBLIC_KEYCLOAK_URL=https://custom-keycloak.example.com
NEXT_PUBLIC_KEYCLOAK_REALM=custom-realm
NEXT_PUBLIC_INSTANCE=CUSTOM
```

## Troubleshooting

### Issue: Wrong URLs being used

**Check:**
```javascript
console.log(window.location.host); // Verify current domain
console.log(getDynamicConfig()); // Check resolved config
```

### Issue: SSR uses wrong URLs

**Solution:** Make sure middleware is active or pass `host` header explicitly

### Issue: Need custom domain

**Solution:** Add to `DOMAIN_CONFIG` or use environment variable override

## Related Documentation

- Cloudflared tunnel configuration: `cloudflared/README.md`
- DNS configuration: `cloudflared/DNS_CONFIGURATION_STATUS.md`
- Deployment guide: `cloudflared/DEPLOYMENT_SUMMARY.md`
