# Visual Regression Testing - Phase 2 Type Safety & Maintainability

**Date**: 2026-02-08  
**Status**: 🟡 Planning Complete - Ready for Week 5-8  
**Priority**: P1 - Should Have (Phase 2: Weeks 5-8)

---

## Executive Summary

DIVE V3 has **Storybook configured** with **3 existing stories** but **no visual regression testing**. With **285 React components**, UI breaks go undetected:

- ✅ **Storybook installed**: `@storybook/nextjs-vite@10.2.7`
- ⚠️ **Stories created**: Only 3 story files (PresenceIndicator, AnimatedButton, AdminPageTransition)
- ❌ **Visual regression tests**: None
- ❌ **Critical components**: 282 components untested (99%)
- ✅ **Infrastructure ready**: Storybook dev server working (`npm run storybook`)

**Target Phase 2**: Add visual regression tests for **40 most critical components** using Chromatic or Percy

---

## Current Storybook Setup

### Configuration

**Location**: `frontend/.storybook/`

**Files**:
- `main.ts` - Storybook configuration (Next.js + Vite)
- `preview.ts` - Global decorators, parameters
- `preview.tsx` - React providers

**Key Features**:
- ✅ Next.js integration (`@storybook/nextjs-vite`)
- ✅ TypeScript support
- ✅ Auto-docs enabled
- ✅ Viewport addons
- ✅ a11y testing addon

**Scripts** (from `package.json`):
```json
{
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

---

### Existing Stories (3 files)

1. **`PresenceIndicator.stories.tsx`**
   - Location: `src/components/admin/shared/`
   - Component: Real-time user presence indicator
   - Stories: Default, Offline, Online, Multiple Users
   - **Quality**: ✅ Good example

2. **`AnimatedButton.stories.tsx`**
   - Location: `src/components/admin/shared/`
   - Component: Animated action button
   - Stories: Default, Loading, Success, Error, Disabled
   - **Quality**: ✅ Good example with state variations

3. **`AdminPageTransition.stories.tsx`**
   - Location: `src/components/admin/shared/`
   - Component: Page transition animations
   - Stories: Fade In, Slide In, Scale In
   - **Quality**: ✅ Good example for animations

**Pattern**: Admin shared components have stories, but core UI components do not.

---

## Component Inventory

### Total: 285 React Components

#### UI Components (`src/components/ui/`) - 30+ components
**Critical for Visual Testing**:
1. `badge.tsx` - Status badges
2. `loading-states.tsx` - Loading spinners, skeletons
3. `unified-card.tsx` - Card layout component
4. `interactive-breadcrumbs.tsx` - Navigation breadcrumbs
5. `demo-mode-badge.tsx` - Demo mode indicator
6. `button.tsx` (implied) - Primary button
7. `input.tsx` (implied) - Form input
8. `modal.tsx` (implied) - Modal dialog
9. `dropdown.tsx` (implied) - Dropdown menu
10. `toast.tsx` (implied) - Toast notifications

#### Navigation Components (`src/components/navigation/`) - 12+ components
**Critical for Visual Testing**:
1. `navigation.tsx` - Main navigation bar
2. `UnifiedUserMenu.tsx` - User profile menu
3. `LocaleSelector.tsx` - Language selector
4. `NotificationBell.tsx` - Notification bell
5. `ThemeToggle.tsx` - Dark/light mode toggle
6. `BookmarkButton.tsx` - Bookmark action
7. `SearchBox.tsx` - Search input
8. `Breadcrumbs.tsx` - Breadcrumb navigation
9. `CommandPalette.tsx` - Command palette (Cmd+K)
10. `mobile-drawer.tsx` - Mobile navigation drawer

#### Auth Components (`src/components/auth/`) - 5+ components
**Critical for Visual Testing**:
1. `idp-selector.tsx` - IdP selection page
2. `login-button.tsx` - Login action button
3. `token-expiry-checker.tsx` - Session expiry UI
4. `secure-logout-button.tsx` - Logout button

#### Resource Components (`src/components/resources/`) - 20+ components
**Priority**:
1. Resource cards (list view)
2. Resource detail view
3. Upload form
4. Classification badges
5. File type indicators

#### Dashboard Components (`src/components/dashboard/`) - 15+ components
**Priority**:
1. `dashboard-modern.tsx` - Main dashboard
2. `dashboard-authorization.tsx` - Authz dashboard
3. `dashboard-resources.tsx` - Resource dashboard
4. `profile-badge.tsx` - User profile badge

#### Admin Components (`src/components/admin/`) - 100+ components
**Priority**:
1. `AdminSidebar.tsx` - Admin navigation
2. `AdminBreadcrumbs.tsx` - Admin breadcrumbs
3. `GlobalCommandPalette.tsx` - Admin command palette
4. `AdminCommandPaletteWrapper.tsx` - Wrapper component
5. User management tables
6. IdP management forms
7. Federation health dashboards
8. Policy editors

---

## Visual Regression Testing Options

### Option 1: Chromatic (Recommended)

**Pros**:
- ✅ Built specifically for Storybook
- ✅ Automatic snapshot management
- ✅ UI Review workflow (accept/reject changes)
- ✅ GitHub integration (PR checks)
- ✅ Cloud-hosted (no infrastructure)
- ✅ Free tier: 5,000 snapshots/month

**Cons**:
- ⚠️ Cost: ~$150-300/month for paid tier (after free tier)
- ⚠️ External service dependency

**Pricing**:
- Free: 5,000 snapshots/month
- Essential: $150/month (25,000 snapshots)
- Professional: $300/month (50,000 snapshots)

**Setup Time**: 2 hours

---

### Option 2: Percy by BrowserStack

**Pros**:
- ✅ Storybook integration
- ✅ Multi-browser testing (Chrome, Firefox, Safari)
- ✅ Responsive testing
- ✅ GitHub integration
- ✅ Free tier: 5,000 snapshots/month

**Cons**:
- ⚠️ Cost: ~$300-500/month for paid tier
- ⚠️ More complex setup than Chromatic

**Pricing**:
- Free: 5,000 snapshots/month
- Startup: $300/month (unlimited)
- Growth: $500/month (unlimited + advanced features)

**Setup Time**: 4 hours

---

### Option 3: Self-Hosted (Storybook + Playwright)

**Pros**:
- ✅ No external service cost
- ✅ Full control over snapshots
- ✅ Can reuse existing Playwright setup

**Cons**:
- ❌ Manual snapshot management
- ❌ No UI Review workflow
- ❌ Infrastructure overhead (storage, CI)
- ❌ More maintenance burden

**Cost**: Infrastructure only (~$50-100/month S3/GCS)

**Setup Time**: 8-12 hours

---

### Recommendation: Chromatic

**Rationale**:
- Best Storybook integration
- Lowest setup time (2 hours)
- Excellent UI Review workflow
- Free tier sufficient for Phase 2 (40 components × 3 viewports = 120 snapshots)
- Easy to cancel if not valuable

**ROI**: High for user-facing components, medium for internal admin UI

---

## 40 Priority Components for Phase 2

### Week 5: Core UI & Navigation (10 components)

1. **`ui/badge.tsx`** - Status badges ⭐ CRITICAL
   - Stories: Default, Success, Warning, Error, Info, Outline variants
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

2. **`ui/loading-states.tsx`** - Loading UI ⭐ CRITICAL
   - Stories: Spinner, Skeleton, Progress bar, Full-page loader
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

3. **`ui/unified-card.tsx`** - Card component ⭐ CRITICAL
   - Stories: Default, Hover, Selected, Disabled
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

4. **`navigation/navigation.tsx`** - Main nav ⭐ CRITICAL
   - Stories: Desktop nav, Mobile nav, Collapsed, Expanded
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 3 hours

5. **`navigation/UnifiedUserMenu.tsx`** - User menu ⭐ CRITICAL
   - Stories: Closed, Open, With notifications
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

6. **`navigation/LocaleSelector.tsx`** - Language selector
   - Stories: English, French, German selected
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

7. **`navigation/ThemeToggle.tsx`** - Dark mode toggle
   - Stories: Light mode, Dark mode, System
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 1 hour

8. **`navigation/NotificationBell.tsx`** - Notifications
   - Stories: No notifications, With badge, Open
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

9. **`navigation/SearchBox.tsx`** - Search input
   - Stories: Empty, With text, With results
   - Viewports: Desktop, tablet, mobile
   - **Effort**: 2 hours

10. **`navigation/CommandPalette.tsx`** - Cmd+K palette
    - Stories: Closed, Open, With search, With results
    - Viewports: Desktop
    - **Effort**: 3 hours

**Week 5 Total**: 10 components, **21 hours**

---

### Week 6: Auth & Dashboard Components (10 components)

11. **`auth/idp-selector.tsx`** - IdP selection ⭐ CRITICAL
    - Stories: Default, With 4 IdPs, Disabled IdP, Loading
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

12. **`auth/login-button.tsx`** - Login button ⭐ CRITICAL
    - Stories: Default, Loading, Disabled, Error
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 1 hour

13. **`auth/token-expiry-checker.tsx`** - Session warning
    - Stories: 5 min warning, 1 min warning, Expired
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 2 hours

14. **`auth/secure-logout-button.tsx`** - Logout button
    - Stories: Default, Loading, Confirmation modal
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 2 hours

15. **`dashboard/dashboard-modern.tsx`** - Main dashboard ⭐ CRITICAL
    - Stories: Empty state, With resources, Loading
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 4 hours

16. **`dashboard/dashboard-authorization.tsx`** - Authz dashboard
    - Stories: Allow, Deny, Evaluation details
    - Viewports: Desktop, tablet
    - **Effort**: 3 hours

17. **`dashboard/dashboard-resources.tsx`** - Resource dashboard
    - Stories: Empty, With resources, Filtered
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

18. **`dashboard/profile-badge.tsx`** - User profile badge
    - Stories: UNCLASSIFIED, SECRET, TOP_SECRET
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 2 hours

19. **`layout/page-layout.tsx`** - Page layout wrapper
    - Stories: Default, With sidebar, Mobile
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 2 hours

20. **`providers.tsx`** - Root providers (if visual)
    - Stories: Light theme, Dark theme
    - Viewports: Desktop
    - **Effort**: 1 hour

**Week 6 Total**: 10 components, **23 hours**

---

### Week 7: Upload & Resource Components (10 components)

21. **`upload/ModernFileUpload.tsx`** - Upload UI ⭐ CRITICAL
    - Stories: Empty, With file, Uploading, Success, Error
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 4 hours

22. **`resources/ResourceCard`** (implied) - Resource card
    - Stories: UNCLASSIFIED, SECRET, TOP_SECRET, Encrypted
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

23. **`resources/ResourceList`** (implied) - Resource list
    - Stories: Empty, Loading, With resources
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

24. **`resources/date-range-picker.tsx`** - Date picker
    - Stories: Default, With range selected, Disabled
    - Viewports: Desktop, tablet
    - **Effort**: 2 hours

25. **`resources/faceted-filters.tsx`** - Filter UI
    - Stories: Default, With filters applied, Mobile
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

26. **`resources/ClassificationBadge`** (implied) - Classification
    - Stories: U, C, S, TS colors and styles
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 2 hours

27. **`multimedia/VideoPlayer.tsx`** - Video player
    - Stories: Default, Playing, Paused, Error
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

28. **`ztdf/KASRequestModal.tsx`** - KAS modal
    - Stories: Closed, Open, Loading, Success, Error
    - Viewports: Desktop, tablet
    - **Effort**: 3 hours

29. **`policies-lab/RegoViewer.tsx`** - Rego code viewer
    - Stories: Default, With syntax highlighting, Dark theme
    - Viewports: Desktop
    - **Effort**: 2 hours

30. **`policies-lab/UploadPolicyModal.tsx`** - Policy upload
    - Stories: Closed, Open, Uploading, Success, Error
    - Viewports: Desktop, tablet
    - **Effort**: 3 hours

**Week 7 Total**: 10 components, **28 hours**

---

### Week 8: Admin Components (10 components)

31. **`admin/AdminSidebar.tsx`** - Admin sidebar ⭐ CRITICAL
    - Stories: Collapsed, Expanded, Mobile
    - Viewports: Desktop, tablet, mobile
    - **Effort**: 3 hours

32. **`admin/AdminBreadcrumbs.tsx`** - Admin breadcrumbs
    - Stories: Single level, Multi-level, Long path
    - Viewports: Desktop, tablet
    - **Effort**: 2 hours

33. **`admin/GlobalCommandPalette.tsx`** - Admin Cmd+K
    - Stories: Closed, Open, With search, With results
    - Viewports: Desktop
    - **Effort**: 3 hours

34. **`admin/users/user-list.tsx`** - User table
    - Stories: Empty, Loading, With users, Sorted, Filtered
    - Viewports: Desktop, tablet
    - **Effort**: 3 hours

35. **`admin/clearance/clearance-editor.tsx`** - Clearance editor
    - Stories: Empty, Editing, Validation error
    - Viewports: Desktop, tablet
    - **Effort**: 3 hours

36. **`admin/clearance/clearance-audit-log.tsx`** - Audit log
    - Stories: Empty, With logs, Paginated
    - Viewports: Desktop
    - **Effort**: 2 hours

37. **`admin/policy-rule-manager.tsx`** - Policy manager
    - Stories: Default, Editing rule, Validation
    - Viewports: Desktop
    - **Effort**: 3 hours

38. **`admin/demo-scenario-manager.tsx`** - Demo scenarios
    - Stories: List view, Editing, Running
    - Viewports: Desktop
    - **Effort**: 2 hours

39. **`admin/dashboard/system-overview-section.tsx`** - System overview
    - Stories: Healthy, Degraded, Error
    - Viewports: Desktop, tablet
    - **Effort**: 3 hours

40. **`admin/federation/SpokeRegistryTable`** (implied) - Spoke table
    - Stories: Empty, With spokes, Offline spoke
    - Viewports: Desktop
    - **Effort**: 3 hours

**Week 8 Total**: 10 components, **27 hours**

---

## Phase 2 Total

**Components**: 40  
**Stories**: ~200 (avg 5 per component)  
**Snapshots**: ~600 (3 viewports × 200 stories)  
**Effort**: 99 hours (12.4 days at 8h/day)  
**Timeline**: 4 weeks (Weeks 5-8) with 1-2 engineers

---

## Visual Regression Testing Setup

### Chromatic Setup (Recommended)

#### 1. Install Chromatic

```bash
cd frontend
npm install --save-dev chromatic
```

#### 2. Configure Chromatic

**Create account**: https://www.chromatic.com/start

**Get project token**: Available after signup

**Add to CI** (`.github/workflows/visual-regression.yml`):
```yaml
name: Visual Regression Tests

on:
  pull_request:
    branches: [main]
    paths:
      - 'frontend/src/components/**'
      - 'frontend/src/app/**'
      - 'frontend/.storybook/**'

jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Chromatic needs full history

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        run: cd frontend && npm ci

      - name: Run Chromatic
        uses: chromaui/action@v1
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          workingDir: frontend
          buildScriptName: build-storybook
          onlyChanged: true # Only test changed components
          autoAcceptChanges: main # Auto-accept on main branch
```

#### 3. Add NPM Script

```json
// frontend/package.json
{
  "scripts": {
    "chromatic": "chromatic --exit-zero-on-changes",
    "chromatic:ci": "chromatic --exit-once-uploaded"
  }
}
```

**Effort**: 2 hours setup

---

### Percy Setup (Alternative)

#### 1. Install Percy

```bash
cd frontend
npm install --save-dev @percy/cli @percy/storybook
```

#### 2. Configure Percy

**Create account**: https://percy.io/signup

**Add to CI**:
```yaml
- name: Run Percy Visual Tests
  run: cd frontend && npx percy storybook ./storybook-static
  env:
    PERCY_TOKEN: ${{ secrets.PERCY_TOKEN }}
```

**Effort**: 4 hours setup

---

## Storybook Story Template

### Basic Story Template

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { YourComponent } from './YourComponent';

const meta = {
  title: 'Components/UI/YourComponent',
  component: YourComponent,
  parameters: {
    layout: 'centered', // or 'fullscreen' or 'padded'
    docs: {
      description: {
        component: 'Description of your component',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story 1: Default
export const Default: Story = {
  args: {
    variant: 'default',
    size: 'md',
    children: 'Button Text',
  },
};

// Story 2: Primary variant
export const Primary: Story = {
  args: {
    variant: 'primary',
    size: 'md',
    children: 'Primary Button',
  },
};

// Story 3: Disabled state
export const Disabled: Story = {
  args: {
    variant: 'default',
    size: 'md',
    disabled: true,
    children: 'Disabled',
  },
};

// Story 4: All sizes
export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <YourComponent size="sm">Small</YourComponent>
      <YourComponent size="md">Medium</YourComponent>
      <YourComponent size="lg">Large</YourComponent>
    </div>
  ),
};

// Story 5: Dark mode
export const DarkMode: Story = {
  args: {
    variant: 'default',
    size: 'md',
    children: 'Dark Mode',
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
};
```

---

### Complex Story with Providers

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { YourComponent } from './YourComponent';

const queryClient = new QueryClient();

const meta = {
  title: 'Components/Complex/YourComponent',
  component: YourComponent,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <SessionProvider session={mockSession}>
          <Story />
        </SessionProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock session
const mockSession = {
  user: {
    id: 'user-123',
    uniqueID: 'john.doe@mil',
    clearance: 'SECRET',
    countryOfAffiliation: 'USA',
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

export const Default: Story = {};

export const WithData: Story = {
  parameters: {
    mockData: {
      '/api/resources': {
        resources: [
          { id: '1', title: 'Resource 1', classification: 'SECRET' },
        ],
      },
    },
  },
};
```

---

## Story Creation Guidelines

### 1. Component Variants

Test all visual variants:
- Default state
- Hover/focus states
- Active/selected states
- Disabled states
- Loading states
- Error states

### 2. Responsive Viewports

Test 3 breakpoints:
- Desktop: 1920×1080
- Tablet: 768×1024
- Mobile: 375×667

### 3. Theme Variants

Test both themes:
- Light mode
- Dark mode

### 4. Content Variations

Test with different content:
- Short text
- Long text (truncation)
- Empty state
- Maximum content

### 5. Accessibility

Use Storybook a11y addon:
- Check contrast ratios
- Verify ARIA labels
- Test keyboard navigation

---

## CI Integration

### GitHub Actions Workflow

**Location**: `.github/workflows/visual-regression.yml`

```yaml
name: Visual Regression Tests

on:
  pull_request:
    branches: [main]
    paths:
      - 'frontend/src/components/**'
      - 'frontend/.storybook/**'
  push:
    branches: [main]

jobs:
  visual-regression:
    name: Chromatic Visual Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Required for Chromatic

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        run: cd frontend && npm ci

      - name: Run Chromatic
        uses: chromaui/action@v1
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          workingDir: frontend
          buildScriptName: build-storybook
          onlyChanged: true # Only test changed stories
          exitZeroOnChanges: true # Don't fail on visual changes
          exitOnceUploaded: true # Exit after upload (don't wait for snapshots)

      - name: Upload Storybook Build
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: storybook-build
          path: frontend/storybook-static/
          retention-days: 7
```

**Effort**: 2 hours

---

## Success Metrics

### Week 5 (End)
- ✅ Chromatic account created and configured
- ✅ 10 core UI + navigation components have stories
- ✅ CI integrated (visual regression on every PR)
- ✅ Baseline snapshots captured

### Week 6 (End)
- ✅ 20 components with stories (cumulative)
- ✅ Auth + dashboard components tested
- ✅ 0 false positives (flakiness <5%)

### Week 7 (End)
- ✅ 30 components with stories (cumulative)
- ✅ Upload + resource components tested
- ✅ Dark mode variants tested

### Week 8 (End)
- ✅ 40 components with stories (complete)
- ✅ Admin components tested
- ✅ Visual regression tests in CI
- ✅ Team trained on UI Review workflow

### Long-term (6 months)
- ✅ 80% reduction in UI regression bugs
- ✅ Faster design reviews (visual diffs)
- ✅ Living component documentation

---

## Cost Analysis

### Chromatic Pricing

**Free Tier**: 5,000 snapshots/month
- 40 components × 5 stories × 3 viewports = **600 snapshots**
- **PR frequency**: 20 PRs/month
- **Snapshots per PR**: ~30 (only changed components)
- **Monthly usage**: ~600 snapshots/month
- **Verdict**: ✅ Fits in free tier!

**Paid Tier** (if needed):
- Essential: $150/month (25,000 snapshots)
- Professional: $300/month (50,000 snapshots)

**When to upgrade**:
- Team grows to 10+ developers
- 50+ PRs/month
- 100+ components with stories

---

## Maintenance Strategy

### 1. Component Story Requirements

**New component checklist**:
- [ ] Component implements all variants
- [ ] Story file created (`ComponentName.stories.tsx`)
- [ ] All states covered (default, hover, disabled, error)
- [ ] Responsive viewports tested (desktop, tablet, mobile)
- [ ] Dark mode variant tested
- [ ] Accessibility verified (a11y addon)

### 2. PR Review Process

**When PR touches components**:
1. Chromatic runs automatically
2. Visual changes flagged in Chromatic UI
3. Reviewer approves or rejects visual changes
4. Snapshots updated on approval
5. PR can merge after visual approval

### 3. False Positive Management

**If snapshots fail incorrectly**:
1. Review diff in Chromatic UI
2. Check for anti-aliasing differences (browser rendering)
3. Check for animation timing issues
4. Update story to use `chromatic.delay` if needed:

```typescript
export const AnimatedButton: Story = {
  args: { ... },
  parameters: {
    chromatic: { delay: 1000 }, // Wait 1s for animation
  },
};
```

---

## Anti-Patterns to Avoid

### 1. ❌ Testing Implementation Details
```typescript
// BAD - Testing internal state
export const WithInternalState: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button');
    await userEvent.click(button);
    expect(component.state.clicked).toBe(true); // ❌ Implementation detail
  },
};

// GOOD - Testing visual output
export const Clicked: Story = {
  args: { clicked: true }, // Just show the visual state
};
```

### 2. ❌ Dynamic/Random Content
```typescript
// BAD - Non-deterministic
export const WithRandomData: Story = {
  render: () => <Component data={Math.random()} /> // ❌ Causes false positives
};

// GOOD - Fixed data
export const WithData: Story = {
  args: { data: 0.5 }, // ✅ Deterministic
};
```

### 3. ❌ External API Calls
```typescript
// BAD - Real API calls
export const WithRealData: Story = {
  render: () => {
    const [data, setData] = useState([]);
    useEffect(() => {
      fetch('/api/data').then(r => r.json()).then(setData); // ❌ Network call
    }, []);
    return <Component data={data} />;
  },
};

// GOOD - Mocked data
export const WithData: Story = {
  args: {
    data: [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ],
  },
};
```

### 4. ❌ Animations Without Delays
```typescript
// BAD - Animation mid-frame
export const Animated: Story = {
  args: { animate: true }, // ❌ Snapshot may catch mid-animation
};

// GOOD - Animation complete
export const Animated: Story = {
  args: { animate: true },
  parameters: {
    chromatic: { delay: 1000 }, // ✅ Wait for animation to complete
  },
};
```

---

## Troubleshooting Guide

### Issue: Storybook won't start

**Error**: `Cannot find module '@storybook/nextjs-vite'`

**Fix**:
```bash
cd frontend
npm install --save-dev @storybook/nextjs-vite@10.2.7
npx storybook@latest upgrade
```

---

### Issue: Stories don't render

**Error**: `Error: Hydration failed because the initial UI does not match`

**Fix**: Use `'use client'` directive in component file
```typescript
'use client';

export function YourComponent() { ... }
```

---

### Issue: Chromatic snapshots fail

**Error**: `Snapshots differ due to font rendering`

**Fix**: Use Chromatic's font loading delay
```typescript
export default {
  parameters: {
    chromatic: { 
      delay: 300, // Wait for fonts
      diffThreshold: 0.1, // Allow 0.1% difference
    },
  },
} satisfies Meta<typeof YourComponent>;
```

---

### Issue: CI timeout

**Error**: `Chromatic timed out after 10 minutes`

**Fix**: Increase timeout, optimize stories
```yaml
timeout-minutes: 15 # Increase from 10

# Or optimize
- name: Run Chromatic
  with:
    onlyChanged: true # Only test changed components (faster)
```

---

## Success Criteria

### Functional Requirements
- ✅ 40 components have Storybook stories
- ✅ Each component has 3-7 stories (variants)
- ✅ Responsive viewports tested (desktop, tablet, mobile)
- ✅ Dark mode tested

### Quality Requirements
- ✅ Chromatic integrated into CI
- ✅ Visual diffs reviewable in PR
- ✅ False positive rate <5%
- ✅ CI duration <10 min for visual tests

### Team Adoption
- ✅ Team trained on Chromatic UI Review
- ✅ Stories created for all new components
- ✅ Visual diffs reviewed in 100% of PRs

---

## ROI Calculation

### Without Visual Regression Tests

**UI Bug Discovery**:
- Manual QA: 2 hours per release
- Bugs found in production: ~5 per sprint
- Fix time: 4 hours per bug
- **Total cost**: 22 hours per sprint (2.75 days)

**UI Bugs Missed**:
- Design inconsistencies accumulate
- User dissatisfaction
- Rework required

---

### With Visual Regression Tests

**Setup Cost**:
- Initial: 99 hours (12.4 days) one-time
- Ongoing: 1-2 hours per week (new components)

**Benefits**:
- Catch UI bugs in CI (before QA)
- Reduce manual QA: 2 hours → 30 min (75% reduction)
- Bugs found: 5 → 1 per sprint (80% reduction)
- Fix time: 4 hours → 1 hour (caught earlier)
- **Savings**: 19.5 hours per sprint (2.4 days)

**Break-even**: ~5 sprints (10 weeks)

**Annual Savings**: 
- 26 sprints × 19.5 hours = **507 hours** (63 days)
- At $100/hour = **$50,700 saved**
- Chromatic cost: $1,800/year
- **Net savings**: $48,900

---

## Next Steps (Week 5 Start)

### Day 1: Setup
- [ ] Create Chromatic account
- [ ] Configure GitHub secret (`CHROMATIC_PROJECT_TOKEN`)
- [ ] Add Chromatic CI workflow
- [ ] Test with existing 3 stories

### Day 2-5: Create Stories
- [ ] Component 1-10 stories (Week 5 list)
- [ ] Review and iterate
- [ ] Capture baseline snapshots

**Team should follow this pattern for Weeks 6-8.**

---

## Appendix: Storybook Best Practices

### 1. Story Naming Convention

```
ComponentName.stories.tsx

Stories:
- Default
- Primary
- Secondary
- Loading
- Error
- Disabled
- Mobile
- DarkMode
```

### 2. Args vs Render

**Use `args`** for simple prop changes:
```typescript
export const Primary: Story = {
  args: { variant: 'primary' },
};
```

**Use `render`** for complex scenarios:
```typescript
export const WithMultipleItems: Story = {
  render: () => (
    <div>
      <Component item={1} />
      <Component item={2} />
    </div>
  ),
};
```

### 3. Documentation

Add descriptions:
```typescript
export const Primary: Story = {
  args: { variant: 'primary' },
  parameters: {
    docs: {
      description: {
        story: 'Primary variant used for main actions',
      },
    },
  },
};
```

---

**Document Owner**: Principal Software Architect  
**Last Updated**: 2026-02-08  
**Review Frequency**: Weekly during Phase 2, monthly thereafter
