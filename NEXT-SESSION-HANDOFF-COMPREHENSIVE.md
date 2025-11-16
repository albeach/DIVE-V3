# DIVE V3 - Comprehensive Session Handoff Prompt

**Date:** November 16, 2025 @ 19:15 UTC  
**Project:** DIVE V3 Coalition-Friendly ICAM Pilot  
**Current Branch:** `main`  
**Last Commit:** `5a6f061` - "fix(ci): simplify E2E Keycloak startup with direct port mapping"

---

## IMMEDIATE CONTEXT - What Just Happened

### Session Summary (November 16, 2025)

**Original Task:** Verify CI/CD pipeline success, then modernize Policy Builder UI with 2025 best practices.

**What Actually Happened:**
1. ✅ Identified CI/CD failures: Keycloak version mismatch (26.0.0 vs 26.4.2) + missing `start-dev` command
2. ✅ Upgraded all workflows to Keycloak 26.4.2 
3. ✅ Fixed network isolation issues in Specialty and E2E tests
4. ⚠️ **CI/CD pipeline still not fully verified** - workflows were running at session end
5. ❌ **Policy Builder UI modernization NOT started** - was the original goal

**Status at Handoff:**
- 6 workflows running with fixes applied
- Need verification of success before proceeding
- Original task (UI modernization) still pending

---

## YOUR FIRST ACTIONS (CRITICAL - DO IN ORDER)

### 1. Verify CI/CD Pipeline Status (5 minutes)

```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3

# Check latest workflow runs
gh run list --limit 10

# Expected: At least 7 out of 9 workflows passing
# - ✅ E2E Tests (4 jobs)
# - ✅ Specialty Tests (Keycloak Integration)
# - ✅ Security Scanning
# - ✅ Deploy to Staging
# - ⚠️ CI - Comprehensive Test Suite (may fail - backend issues, not Keycloak)
# - ⚠️ Deploy to Dev Server (may fail - deployment config, not Keycloak)
```

**If workflows are STILL failing:**
```bash
# Get detailed logs for failed workflow
gh run view <run-id> --log-failed

# Focus on Keycloak-related failures only
# Ignore backend test failures (41 known failures documented)
```

**Decision Point:**
- **If Keycloak tests passing:** ✅ Move to Policy Builder UI (Task #2)
- **If Keycloak tests failing:** ❌ Read CICD-FIX-SUMMARY.md, investigate further

---

### 2. Modernize Policy Builder UI with 2025 Best Practices

**THIS IS THE PRIMARY TASK** - Only start after CI/CD verification.

#### Current State Analysis

**File to Refactor:**
```
frontend/src/components/policies/PolicyEditorPanel.tsx (707 lines)
```

**Problem:** Monolithic component, outdated patterns, needs modernization.

**New Components Created (not yet integrated):**
```
frontend/src/components/policies/PolicyBuilderWizard.tsx
frontend/src/components/policies/PolicyExplorer.tsx
frontend/src/types/policy.types.ts
frontend/src/types/policy-builder.types.ts
```

**Status:** Files exist but are untracked/uncommitted. Review before proceeding.

#### 2025 Modern Patterns to Apply

**Architecture Patterns:**
1. **Server Components by default** (Next.js 15 App Router)
   - Only use `'use client'` when absolutely necessary (interactivity)
   - Data fetching on server side
   - Improved performance and SEO

2. **Composition over Inheritance**
   - Break 707-line component into smaller, focused components
   - Each component has single responsibility
   - Reusable UI primitives from shadcn/ui

3. **Component Structure:**
```typescript
// app/policies/page.tsx (Server Component)
export default async function PoliciesPage() {
  const policies = await fetchPolicies(); // Server-side data fetch
  return <PolicyExplorer policies={policies} />;
}

// components/policies/PolicyExplorer.tsx (Client Component - minimal)
'use client';
import { useState } from 'react';
import { PolicyList } from './PolicyList';
import { PolicyEditor } from './PolicyEditor';

export function PolicyExplorer({ policies }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-12 gap-4">
      <PolicyList policies={policies} onSelect={setSelected} />
      {selected && <PolicyEditor policyId={selected} />}
    </div>
  );
}
```

**UI/UX Patterns:**
1. **Shadcn/ui Components** (already installed)
   - Use `Button`, `Card`, `Dialog`, `Form`, `Select`, `Tabs`, etc.
   - Consistent design system
   - Accessible by default (WCAG 2.1 AA)

2. **Responsive Design (Mobile-First)**
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {/* Auto-adapts to screen size */}
</div>
```

3. **Loading States & Suspense**
```typescript
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

<Suspense fallback={<Skeleton className="w-full h-96" />}>
  <PolicyList />
</Suspense>
```

4. **Error Boundaries**
```typescript
// app/policies/error.tsx
'use client';
export default function Error({ error, reset }: ErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

5. **Dark Mode Support**
```typescript
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  {/* Automatically switches with system preference */}
</div>
```

**Data Management Patterns:**
1. **Tanstack Query (React Query)** for client state
```typescript
'use client';
import { useQuery } from '@tanstack/react-query';

function PolicyList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['policies'],
    queryFn: fetchPolicies,
  });
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorAlert />;
  return <div>{/* render policies */}</div>;
}
```

2. **Zod + React Hook Form** for forms
```typescript
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const policySchema = z.object({
  name: z.string().min(3).max(100),
  classification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']),
  releasabilityTo: z.array(z.string()).min(1),
});

function PolicyForm() {
  const form = useForm({
    resolver: zodResolver(policySchema),
  });
  // Use form.register, form.handleSubmit, form.formState.errors
}
```

#### Refactoring Plan

**Phase 1: Extract Smaller Components**
```
PolicyEditorPanel.tsx (707 lines)
  ↓
PolicyEditor/
  ├── PolicyEditorLayout.tsx (main container, <100 lines)
  ├── PolicyBasicInfo.tsx (name, description)
  ├── PolicyClassification.tsx (classification selector)
  ├── PolicyReleasability.tsx (country selection)
  ├── PolicyCOI.tsx (COI tags)
  ├── PolicyRules.tsx (rule builder)
  └── PolicyPreview.tsx (preview panel)
```

**Phase 2: Add Wizard Flow**
```typescript
// PolicyBuilderWizard.tsx
export function PolicyBuilderWizard() {
  const [step, setStep] = useState(1);
  
  return (
    <Card>
      <CardHeader>
        <Stepper currentStep={step} totalSteps={4} />
      </CardHeader>
      <CardContent>
        {step === 1 && <BasicInfoStep onNext={setStep} />}
        {step === 2 && <ClassificationStep onNext={setStep} />}
        {step === 3 && <RulesStep onNext={setStep} />}
        {step === 4 && <ReviewStep onSubmit={handleSubmit} />}
      </CardContent>
    </Card>
  );
}
```

**Phase 3: Implement Explorer View**
```typescript
// PolicyExplorer.tsx
export function PolicyExplorer() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-3">
        <PolicySearch />
        <PolicyFilters />
        <PolicyList />
      </div>
      <div className="col-span-9">
        <PolicyDetails />
      </div>
    </div>
  );
}
```

#### Testing Requirements

**Component Tests (Jest + React Testing Library):**
```typescript
// PolicyEditorLayout.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('PolicyEditorLayout', () => {
  it('should render all sections', () => {
    render(<PolicyEditorLayout />);
    expect(screen.getByRole('heading', { name: /basic info/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /classification/i })).toBeInTheDocument();
  });
  
  it('should save policy when form submitted', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    
    render(<PolicyEditorLayout onSave={onSave} />);
    await user.type(screen.getByLabelText(/policy name/i), 'Test Policy');
    await user.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Policy'
      }));
    });
  });
});
```

**E2E Tests (Playwright):**
```typescript
// policy-management.spec.ts
test('user can create policy via wizard', async ({ page }) => {
  await page.goto('/policies');
  await page.click('text=New Policy');
  
  // Step 1: Basic Info
  await page.fill('[name="name"]', 'Test Policy');
  await page.click('text=Next');
  
  // Step 2: Classification
  await page.selectOption('[name="classification"]', 'SECRET');
  await page.click('text=Next');
  
  // Step 3: Review & Save
  await page.click('text=Save Policy');
  
  await expect(page.locator('text=Policy created')).toBeVisible();
});
```

---

## PROJECT STRUCTURE REFERENCE

```
dive-v3/
├── frontend/                          # Next.js 15 Application
│   ├── src/
│   │   ├── app/                      # Next.js App Router
│   │   │   ├── page.tsx              # Home (IdP selector)
│   │   │   ├── policies/             # ⭐ FOCUS AREA
│   │   │   │   ├── page.tsx          # Policies list/explorer
│   │   │   │   ├── [id]/             # Policy detail view
│   │   │   │   ├── new/              # Create new policy
│   │   │   │   └── error.tsx         # Error boundary
│   │   │   ├── resources/            # Resource browser
│   │   │   └── api/                  # API routes
│   │   ├── components/
│   │   │   ├── policies/             # ⭐ REFACTOR TARGET
│   │   │   │   ├── PolicyEditorPanel.tsx (707 lines - BREAK THIS UP)
│   │   │   │   ├── PolicyBuilderWizard.tsx (exists, review)
│   │   │   │   ├── PolicyExplorer.tsx (exists, review)
│   │   │   │   └── [new structure to create]
│   │   │   ├── ui/                   # Shadcn/ui components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   └── [many more...]
│   │   │   └── dashboard/
│   │   ├── lib/                      # Utilities
│   │   └── types/                    # TypeScript types
│   │       ├── policy.types.ts       (exists, review)
│   │       └── policy-builder.types.ts (exists, review)
│   ├── public/                       # Static assets
│   ├── package.json
│   └── tailwind.config.ts            # Tailwind configuration
│
├── backend/                           # Express.js API
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── models/
│   └── package.json
│
├── policies/                          # OPA Rego Policies
│   ├── fuel_inventory_abac_policy.rego
│   └── tests/
│
├── .github/workflows/                 # CI/CD ⚠️ RECENTLY MODIFIED
│   ├── test-e2e.yml                  (fixed - Keycloak 26.4.2)
│   ├── test-specialty.yml            (fixed - Keycloak 26.4.2)
│   └── [others...]
│
├── CICD-FIX-SUMMARY.md               # CI/CD fixes documentation
├── CI-CD-STATUS.md                   # Current status
└── [project docs...]
```

---

## KEYCLOAK 26.4.2 CONTEXT (IMPORTANT)

### Current Keycloak Setup

**Version:** 26.4.2 (recently upgraded from 26.0.0)  
**Why 26.4.2:** Matches local development environment  
**Key Change:** Requires explicit `start-dev` command to run

**CI/CD Workflow Pattern:**
```yaml
# Specialty Tests (needs PostgreSQL)
- name: Start Keycloak 26.4.2
  run: |
    SERVICE_NETWORK=$(docker network ls -q -f name=github_network)
    docker run -d --name keycloak --network "$SERVICE_NETWORK" \
      -e KC_DB=postgres \
      -e KC_DB_URL=jdbc:postgresql://postgres:5432/keycloak \
      quay.io/keycloak/keycloak:26.4.2 start-dev
    KEYCLOAK_IP=$(docker inspect keycloak --format='{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
    # Use container IP for health checks

# E2E Tests (dev-mem only)
- name: Start Keycloak 26.4.2
  run: |
    docker run -d --name keycloak -p 8081:8080 \
      -e KC_DB=dev-mem \
      quay.io/keycloak/keycloak:26.4.2 start-dev
    # Use localhost:8081 for health checks
```

**If you need Keycloak documentation:**
```typescript
// Use the keycloak-docs MCP tool
mcp_keycloak-docs_docs_search({ query: "your question here", k: 5 })
```

---

## KNOWN ISSUES & DEFERRED ITEMS

### CI/CD Issues (May Still Exist)

1. **Backend Test Failures (41 tests)**
   - Certificate tests: 20 failures
   - MongoDB tests: 4 failures  
   - Logic tests: 17 failures
   - **Status:** KNOWN, DOCUMENTED, NON-BLOCKING
   - **Impact:** Low (critical path at 100%)
   - **Action:** IGNORE for now, fix in Week 5

2. **Deploy to Dev Server**
   - May fail due to deployment configuration (not Keycloak)
   - **Action:** Investigate only if blocking progress

3. **Keycloak Network Issues**
   - **Status:** Should be fixed (3 commits applied)
   - **Verification:** Check workflow logs if still failing
   - **Reference:** Read CICD-FIX-SUMMARY.md for details

### Frontend Issues

1. **PolicyEditorPanel.tsx (707 lines)**
   - Too large, hard to maintain
   - Needs refactoring (PRIMARY TASK)
   
2. **Untracked Policy Components**
   - PolicyBuilderWizard.tsx
   - PolicyExplorer.tsx
   - policy*.types.ts
   - **Action:** Review before creating new structure

3. **Test Coverage**
   - Component tests: 183/183 passing (100%)
   - E2E tests: 4 suites (status unknown, check after CI/CD verification)
   - **Action:** Add tests for new policy components

---

## TECHNICAL STANDARDS & CONVENTIONS

### TypeScript Strictness
```typescript
// ✅ GOOD
interface IPolicyMetadata {
  policyId: string;
  name: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  releasabilityTo: string[];
  COI: string[];
  rules: IRule[];
}

async function createPolicy(data: IPolicyMetadata): Promise<IPolicy> {
  // Explicit return type
}

// ❌ BAD
function createPolicy(data: any) {
  // No types, implicit return
}
```

### File Naming
- Components: PascalCase (`PolicyEditor.tsx`)
- Utilities: kebab-case (`policy-utils.ts`)
- Constants: UPPER_SNAKE_CASE (`CLASSIFICATION_LEVELS`)
- Types: PascalCase with `I` prefix (`IPolicyMetadata`)

### Code Organization
```typescript
// Component structure
import statements
type definitions
main component
sub-components (if small)
export default

// Example:
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface PolicyEditorProps {
  // props
}

export function PolicyEditor({ props }: PolicyEditorProps) {
  // component logic
  return <div>...</div>;
}
```

---

## HELPFUL COMMANDS

```bash
# Git
git status
git log --oneline -10
git diff

# Frontend Development
cd frontend
npm run dev                    # HTTPS mode (default)
npm run dev:http               # HTTP mode (for CI)
npm test                       # All tests
npm run lint                   # ESLint
npm run typecheck              # TypeScript check

# Backend Development  
cd backend
npm run dev                    # Watch mode
npm test                       # All tests
npm run test:unit              # Unit tests only

# OPA Tests
cd policies
opa test . -v

# CI/CD Verification
gh run list --limit 10
gh run view <run-id>
gh run view <run-id> --log-failed

# Docker
docker compose ps
docker compose logs -f frontend
docker compose logs -f backend
```

---

## RESEARCH TOOLS AVAILABLE

### 1. Keycloak Documentation (MCP)
```typescript
// Search Keycloak docs
mcp_keycloak-docs_docs_search({ 
  query: "authentication flows",
  k: 5  // number of results
})

// Get specific doc
mcp_keycloak-docs_docs_get({ 
  id: "doc-id-from-search"
})
```

### 2. Web Search
```typescript
// For modern patterns, best practices
web_search({ 
  search_term: "Next.js 15 App Router server components best practices 2025"
})

web_search({
  search_term: "shadcn/ui policy builder wizard pattern"
})
```

### 3. Codebase Search
```typescript
// Find similar patterns in codebase
codebase_search({
  query: "How are forms handled in the resource components?",
  target_directories: ["frontend/src/components"]
})
```

---

## SUCCESS CRITERIA

### CI/CD Verification (5 minutes)
- [ ] At least 7/9 workflows passing
- [ ] All Keycloak-related tests passing
- [ ] E2E Tests (4 jobs) all green
- [ ] Specialty Tests passing

### Policy Builder UI Modernization (2-4 hours)
- [ ] PolicyEditorPanel.tsx broken into <100 line components
- [ ] All components use shadcn/ui primitives
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Dark mode support
- [ ] Loading states with Suspense
- [ ] Error boundaries implemented
- [ ] Form validation with Zod
- [ ] Component tests written (>80% coverage)
- [ ] E2E test for policy creation flow
- [ ] TypeScript strict mode (no `any`)

### Code Quality
- [ ] All linter warnings resolved
- [ ] TypeScript compiles with no errors
- [ ] Tests pass: `npm test` in frontend/
- [ ] Components documented with JSDoc
- [ ] Accessibility (WCAG 2.1 AA)

---

## RECOMMENDED APPROACH

### Step 1: Verify CI/CD (REQUIRED FIRST)
```bash
cd /home/mike/Desktop/DIVE-V3/DIVE-V3
gh run list --limit 10

# If passing: proceed to Step 2
# If failing: investigate Keycloak-specific failures only
```

### Step 2: Review Existing Policy Components
```bash
# Check what exists
ls -la frontend/src/components/policies/
cat frontend/src/types/policy.types.ts
cat frontend/src/types/policy-builder.types.ts

# Decide: use existing files or start fresh
```

### Step 3: Plan Component Hierarchy
```
Draw out component tree on paper/whiteboard:
PolicyPage (Server Component)
  ├── PolicyExplorer (Client - state management)
  │   ├── PolicySearch (Client - input)
  │   ├── PolicyFilters (Client - multi-select)
  │   └── PolicyList (Server - can be async)
  └── PolicyDetails (Server)
      ├── PolicyEditor (Client - form)
      │   ├── BasicInfoSection
      │   ├── ClassificationSection
      │   ├── ReleasabilitySection
      │   └── RulesSection
      └── PolicyPreview (Server - can be async)
```

### Step 4: Implement One Component at a Time
```typescript
// Start with smallest, most isolated component
// Example: BasicInfoSection.tsx
'use client';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';

export function BasicInfoSection() {
  const { register } = useFormContext();
  return (
    <div className="space-y-4">
      <Input {...register('name')} label="Policy Name" />
      <Textarea {...register('description')} label="Description" />
    </div>
  );
}

// Test it
// __tests__/components/policies/BasicInfoSection.test.tsx
```

### Step 5: Test as You Go
- Write component test immediately after creating component
- Run tests: `npm test`
- Fix any failures before moving to next component

### Step 6: Integration
- Wire up all components in PolicyEditor.tsx
- Test full flow end-to-end
- Add E2E test with Playwright

### Step 7: Polish
- Add loading states
- Add error handling
- Test responsive design (resize browser)
- Test dark mode (toggle system preference)
- Run accessibility audit (Lighthouse)

---

## EXAMPLE PROMPT FOR CONTINUATION

If you encounter issues or need to hand off again:

> I'm continuing work on DIVE V3 Policy Builder UI modernization.
> 
> **Context:** 
> - Project uses Next.js 15 + shadcn/ui + Tailwind
> - Keycloak 26.4.2 for auth (recently upgraded)
> - Target: Refactor 707-line PolicyEditorPanel.tsx into modern 2025 patterns
> 
> **Status:**
> - CI/CD: [Verified/Still checking/Failing with X error]
> - PolicyEditorPanel: [Not started/In progress at X component/Complete]
> - Tests: [X/Y passing]
> 
> **Blocker:** [Describe specific issue]
> 
> **Next Action:** [What you need to do next]
> 
> Read NEXT-SESSION-HANDOFF-COMPREHENSIVE.md for full context.

---

## FILES TO READ FIRST

1. `CICD-FIX-SUMMARY.md` - CI/CD fixes applied
2. `frontend/src/components/policies/PolicyEditorPanel.tsx` - What needs refactoring
3. `frontend/src/components/ui/` - Available shadcn/ui components
4. `.cursorrules` - Project conventions (already loaded, but reference if needed)

---

**Handoff Prepared By:** AI Assistant  
**Date:** November 16, 2025 @ 19:15 UTC  
**Status:** Ready for next session  
**Estimated Time:** 2-4 hours for Policy Builder modernization  
**Priority:** HIGH - Original task from user

**Good luck! Start with CI/CD verification, then dive into the UI work.** 🚀
