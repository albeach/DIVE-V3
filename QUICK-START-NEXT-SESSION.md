# Quick Start Prompt for Next Session

Copy and paste this prompt to start your next session:

---

I'm continuing work on **DIVE V3** (Coalition-Friendly ICAM pilot). Here's where we left off:

## IMMEDIATE STATUS (Nov 16, 2025)

**What Just Happened:**
- Fixed CI/CD pipeline failures (6 workflows failing → all expected to pass)
- Migrated Keycloak tests to service containers
- Fixed all 4 E2E test suites (health checks + timeouts)
- Fixed backend certificate generation bugs
- Committed at 18:53 UTC (commit `5c4fe19`)
- Workflows running now - **CHECK STATUS FIRST**

## YOUR FIRST ACTION (CRITICAL)

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
gh run list --limit 10
```

**Expected:** All workflows passing ✅  
**If any failed:** Read logs and fix before proceeding

## NEXT FOCUS

**Policy Builder UI Modernization** (2025 best practices)

**Files:**
- `frontend/src/components/policies/PolicyEditorPanel.tsx` (707 lines - needs refactoring)
- `frontend/src/components/policies/PolicyBuilderWizard.tsx` (new)
- `frontend/src/components/policies/PolicyExplorer.tsx` (new)

**Apply 2025 Patterns:**
- Shadcn/ui components (already installed)
- Server Components by default
- Responsive mobile-first design
- Accessibility (WCAG 2.1 AA)
- Dark mode support
- Loading states & error boundaries
- Zod validation + React Hook Form
- Tanstack Query for data fetching

## PROJECT CONTEXT

**Tech Stack:**
- Frontend: Next.js 15 + NextAuth v5 + Shadcn/ui + Tailwind
- Backend: Express.js + TypeScript + MongoDB
- Auth: Keycloak (multi-realm broker)
- Authz: OPA (ABAC policies)
- Testing: Jest + Playwright + OPA tests

**Current State:**
- ✅ All 4 IdPs working (U.S., France, Canada, Industry)
- ✅ OPA policies comprehensive (100% coverage)
- ✅ Backend critical path tests: 100% passing
- ✅ Frontend tests: 183/183 passing
- ✅ CI/CD pipeline: Just fixed (verify first!)
- ⏳ UI/UX needs modernization

**Development Environment:**
- Local: `docker compose up -d` (9 services)
- External access: dev-app.dive25.com (Cloudflare tunnel)
- Development mode, not production

## CODING STANDARDS

```typescript
// ✅ GOOD: Modern Next.js patterns
// app/policies/page.tsx (Server Component)
export default async function PoliciesPage() {
  const policies = await fetchPolicies(); // Server-side
  return <PolicyList policies={policies} />;
}

// components/PolicyList.tsx (Client only when needed)
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PolicyList({ policies }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">{/* ... */}</div>;
}

// ✅ GOOD: Strict TypeScript, no any
interface IPolicyMetadata {
  policyId: string;
  name: string;
  rules: IRule[];
}
```

## IMPORTANT REMINDERS

- ✅ Follow repo conventions in `.cursorrules`
- ✅ Run tests before committing
- ✅ Use conventional commits
- ❌ Don't modify working CI/CD (just fixed!)
- ❌ Don't touch authz.middleware.ts (100% coverage)
- ❌ Don't create documentation unless asked

## RECOMMENDED STEPS

1. ✅ Verify CI/CD success (check workflows)
2. ✅ Review PolicyEditorPanel.tsx (refactoring target)
3. ✅ Commit new policy components (untracked files)
4. ✅ Refactor PolicyEditorPanel (break into smaller components)
5. ✅ Add E2E tests for policy management
6. ✅ Clean up documentation (consolidate E2E-*.md files)

## QUICK REFERENCE

```bash
# Check workflows
gh run list --limit 10

# Run tests
cd frontend && npm test
cd backend && npm test
cd policies && opa test . -v

# Start services
docker compose up -d
docker compose ps

# View logs
docker compose logs -f [service]
```

## FULL DETAILS

See `NEXT-SESSION-HANDOFF.md` for complete context, architecture, project structure, deferred items, and comprehensive implementation guide.

---

**Ready to start!** First action: Verify CI/CD workflows passed.


