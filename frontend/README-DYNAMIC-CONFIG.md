# Dynamic Multi-Domain Configuration - Index

## Quick Links

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | Quick reference card | Need syntax quickly |
| [DYNAMIC_CONFIG_GUIDE.md](./DYNAMIC_CONFIG_GUIDE.md) | Complete usage guide | Learning the system |
| [DYNAMIC_CONFIG_IMPLEMENTATION.md](./DYNAMIC_CONFIG_IMPLEMENTATION.md) | Implementation summary | Understanding what was built |
| [INTEGRATION_EXAMPLE.ts](./INTEGRATION_EXAMPLE.ts) | Code examples | Copy-paste patterns |

## Core Files

| File | Description |
|------|-------------|
| `src/lib/dynamic-config.ts` | Core domain detection and URL mapping |
| `src/hooks/use-dynamic-config.ts` | React hooks for client components |
| `src/lib/api-utils.ts` | Server-side utilities for API routes |
| `src/middleware-dynamic-host.ts` | Next.js middleware (optional) |

## Migration Scripts

| Script | Purpose |
|--------|---------|
| `scripts/migrate-to-dynamic-config.sh` | Scan and list files needing migration |
| `scripts/auto-migrate-api-routes.sh` | Automatically migrate API routes |

## 30-Second Start

### For New Code

**React Component:**
```typescript
import { useDynamicConfig } from '@/hooks/use-dynamic-config';

function MyComponent() {
  const { apiUrl } = useDynamicConfig();
  // Use apiUrl - it's automatically correct!
}
```

**API Route:**
```typescript
import { getBackendUrl } from '@/lib/api-utils';

export async function GET() {
  const backendUrl = getBackendUrl();
  // Use backendUrl - it adapts to the domain!
}
```

### For Existing Code

Run the migration helper to see what needs updating:
```bash
./scripts/migrate-to-dynamic-config.sh
```

## What Problem Does This Solve?

**Before:** Frontend hardcoded to `localhost` URLs
- Accessing `usa-app.dive25.com` → tried to call `localhost:4000` ❌
- Had to manually configure URLs for each domain
- Adding new instances required code changes

**After:** Frontend automatically detects domain
- Accessing `usa-app.dive25.com` → calls `usa-api.dive25.com` ✅
- Accessing `fra-app.dive25.com` → calls `fra-api.dive25.com` ✅
- Accessing `gbr-app.dive25.com` → calls `gbr-api.dive25.com` ✅
- No configuration needed - works automatically!

## Key Benefits

✅ **Zero Hardcoding** - Works on any domain automatically
✅ **Multi-Instance** - USA, FRA, GBR all supported seamlessly
✅ **Dev Friendly** - All localhost ports work correctly
✅ **Easy Extension** - Add new instances via config only
✅ **Type Safe** - Full TypeScript support
✅ **SSR Compatible** - Works in all Next.js contexts
✅ **Gradual Migration** - Old and new code work together
✅ **Production Ready** - Security, performance, best practices

## Testing

Access each domain and verify correct URL detection:

```bash
# Should use usa-api.dive25.com
https://usa-app.dive25.com

# Should use fra-api.dive25.com
https://fra-app.dive25.com

# Should use gbr-api.dive25.com
https://gbr-app.dive25.com

# Should use localhost:4000
http://localhost:3000
```

Test in browser console:
```javascript
import { getDynamicConfig } from '@/lib/dynamic-config';
console.log(getDynamicConfig());
```

## Need Help?

1. **Quick syntax lookup** → [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
2. **Learning the system** → [DYNAMIC_CONFIG_GUIDE.md](./DYNAMIC_CONFIG_GUIDE.md)
3. **See code examples** → [INTEGRATION_EXAMPLE.ts](./INTEGRATION_EXAMPLE.ts)
4. **Migration questions** → [DYNAMIC_CONFIG_IMPLEMENTATION.md](./DYNAMIC_CONFIG_IMPLEMENTATION.md)

## Status

✅ **Core System:** 100% Complete
✅ **Documentation:** 100% Complete
✅ **Migration Tools:** 100% Complete
✅ **Example Migrations:** 100% Complete

🔄 **Optional:** 160+ API route files can be gradually migrated using the auto-migration script

---

**Last Updated:** February 4, 2026
**Status:** Production Ready 🚀
