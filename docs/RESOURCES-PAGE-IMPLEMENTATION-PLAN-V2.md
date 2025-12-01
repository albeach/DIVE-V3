# DIVE V3 Resources Page - Updated Implementation Plan V2

**Created:** December 1, 2025  
**Based on:** Gap Analysis of `RESOURCES-PAGE-UX-AUDIT.md`  
**Status:** Phase 1-4 at 88% | Phase 5 Planned

---

## Phase Status Overview

```
Phase 1: Performance Foundation     ██████████████████░░ 90%
Phase 2: Search Enhancement         ██████████████████░░ 90%  
Phase 3: Power User Features        ████████████████████ 100%
Phase 4: Visual Polish & A11y       ███████████████░░░░░ 75%
Phase 5: Advanced Features          ░░░░░░░░░░░░░░░░░░░░ 0%
```

---

## SMART Objectives by Phase

### Phase 1: Performance Foundation (Gap Completion)

**Remaining Items:**

#### 1.1 Virtual Scrolling Migration
- **Specific:** Migrate `VirtualResourceList` from native DOM to `@tanstack/react-virtual` for true windowing
- **Measurable:** Memory usage <50MB for 28K documents; smooth 60fps scrolling
- **Achievable:** 1 developer, 8 hours
- **Relevant:** Critical for large dataset performance
- **Time-bound:** Complete by Dec 3, 2025

**Implementation Tasks:**
```
□ Install @tanstack/react-virtual v3
□ Create VirtualizedGrid component wrapper
□ Migrate grid/list/compact views to use virtualizer
□ Test memory usage with 28K documents
□ Profile scroll performance
□ Update tests
```

#### 1.2 Federation Query Optimization
- **Specific:** Implement parallel MongoDB queries to multiple instances when federated
- **Measurable:** <200ms p95 latency for federated queries
- **Achievable:** Backend refactor, 6 hours
- **Relevant:** Improves federated search UX
- **Time-bound:** Complete by Dec 4, 2025

---

### Phase 2: Search Enhancement (Gap Completion)

#### 2.1 Full-Text Search Index
- **Specific:** Create MongoDB text index on `title`, `resourceId`, and `content` fields
- **Measurable:** Sub-100ms search latency; relevance-ranked results
- **Achievable:** MongoDB configuration + backend changes, 4 hours
- **Relevant:** Enables content search and better relevance
- **Time-bound:** Complete by Dec 4, 2025

**Implementation Tasks:**
```
□ Create compound text index in MongoDB
□ Update paginated-search.controller to use $text search by default
□ Expose textScore as relevanceScore in API response
□ Add relevance sort option to frontend
□ Update search syntax parser for content: field
```

---

### Phase 4: Visual Polish & Accessibility (Gap Completion)

#### 4.1 Dark Mode Consistency Audit
- **Specific:** Audit all components for dark mode class coverage
- **Measurable:** 100% components have dark: variants; zero contrast issues
- **Achievable:** 1 developer, 4 hours
- **Relevant:** Professional appearance in all themes
- **Time-bound:** Complete by Dec 3, 2025

**Checklist:**
```
□ FacetedFilters dark mode audit
□ Gradient components theme awareness
□ Border opacity consistency
□ Text color completeness
□ Create Tailwind dark mode config tokens
```

#### 4.2 Accessibility Compliance (WCAG 2.1 AA)
- **Specific:** Achieve WCAG 2.1 Level AA compliance on /resources page
- **Measurable:** 95%+ Lighthouse accessibility score; axe-core 0 violations
- **Achievable:** Systematic audit and fixes, 8 hours
- **Relevant:** Legal compliance; inclusive design
- **Time-bound:** Complete by Dec 5, 2025

**Audit Areas:**
```
□ Color contrast ratios (4.5:1 text, 3:1 UI)
□ Focus visible indicators (2px outline minimum)
□ ARIA labels completeness
□ Keyboard navigation testing
□ Screen reader testing (VoiceOver/NVDA)
□ Reduced motion support (@media prefers-reduced-motion)
□ Tab order verification
□ Form label associations
□ Error identification
```

#### 4.3 Mobile Responsiveness Polish
- **Specific:** Complete mobile-first responsive design
- **Measurable:** 4/5 mobile usability score; zero horizontal scroll
- **Achievable:** CSS/component updates, 6 hours
- **Relevant:** 40%+ mobile traffic expected
- **Time-bound:** Complete by Dec 5, 2025

**Tasks:**
```
□ Touch target size audit (44x44px minimum)
□ Pull-to-refresh implementation
□ Swipe gesture support in MobileResourceDrawer
□ Mobile-specific navigation patterns
□ Responsive typography scale
```

#### 4.4 Animation Consistency
- **Specific:** Standardize Framer Motion animations across all components
- **Measurable:** Consistent timing/easing; respects prefers-reduced-motion
- **Achievable:** Animation token system, 4 hours
- **Relevant:** Professional polish; accessibility
- **Time-bound:** Complete by Dec 4, 2025

---

### Phase 5: Advanced Features (New)

**Timeline:** Week of Dec 9-13, 2025

#### 5.1 Advanced Query Builder UI (P2)
- **Specific:** Visual filter construction interface with drag-drop conditions
- **Measurable:** Users build complex queries without syntax knowledge
- **Achievable:** 16 hours development
- **Relevant:** Power user productivity
- **Time-bound:** Dec 9-11, 2025

**Component Design:**
```tsx
interface QueryBuilderProps {
  onQueryChange: (query: string) => void;
  availableFields: Field[];
  presets?: QueryPreset[];
}

// UI: Drag-drop condition cards
// - Field selector dropdown
// - Operator selector
// - Value input (type-aware)
// - AND/OR/NOT grouping
// - Save as preset
```

#### 5.2 Timeline View (P2)
- **Specific:** Documents displayed on temporal axis by creationDate
- **Measurable:** Navigate 28K docs by date efficiently
- **Achievable:** 12 hours development
- **Relevant:** Temporal discovery patterns
- **Time-bound:** Dec 11-12, 2025

**Implementation:**
```
□ TimelineView component with D3.js or Recharts
□ Date aggregation endpoint (by day/week/month)
□ Zoom controls (day → month → year)
□ Click to filter by date range
□ Classification color coding
```

#### 5.3 High Contrast Mode (P2)
- **Specific:** Accessibility theme with maximum contrast
- **Measurable:** WCAG AAA (7:1 contrast); 100% accessibility score
- **Achievable:** Theme configuration, 4 hours
- **Relevant:** Visual accessibility compliance
- **Time-bound:** Dec 12, 2025

#### 5.4 Similar Documents (P2)
- **Specific:** "Related documents" suggestions based on classification, COI, country
- **Measurable:** 3-5 relevant suggestions per document
- **Achievable:** MongoDB aggregation + UI, 8 hours
- **Relevant:** Discovery and context
- **Time-bound:** Dec 13, 2025

**Algorithm:**
```javascript
// Match by:
// 1. Same classification
// 2. Overlapping releasabilityTo
// 3. Overlapping COI
// 4. Similar title (text score)
// Score = (classMatch * 3) + (countryOverlap * 2) + (coiOverlap * 2) + titleScore
```

#### 5.5 Statistics Dashboard (P2 Enhancement)
- **Specific:** Expand BentoDashboard with real-time metrics and trends
- **Measurable:** Live document counts; trend charts; activity feed
- **Achievable:** Chart components + WebSocket, 8 hours
- **Relevant:** Operational awareness
- **Time-bound:** Dec 13, 2025

**New Metrics:**
```
□ Documents added today/week/month
□ Classification trend chart
□ Federation activity (queries/instance)
□ Popular search terms
□ Access denial rate
```

### Phase 5b: Advanced Visualizations (P3)

**Timeline:** Future / On-demand

#### 5b.1 Geographic Map
- **Complexity:** High (mapping library integration)
- **Dependencies:** Country geo data
- **Status:** Deferred

#### 5b.2 Network Graph
- **Complexity:** High (D3.js force layout)
- **Dependencies:** COI relationship data
- **Status:** Deferred

#### 5b.3 Treemap Visualization
- **Complexity:** Medium (D3.js treemap)
- **Dependencies:** Hierarchical aggregation
- **Status:** Deferred

#### 5b.4 Voice Input
- **Complexity:** Medium (Web Speech API)
- **Dependencies:** Browser support
- **Status:** Deferred

#### 5b.5 Tag Clouds
- **Complexity:** Low (word cloud library)
- **Dependencies:** Term frequency data
- **Status:** Deferred

---

## Test Suite Requirements

### Unit Tests (Jest)

```typescript
// hooks/__tests__/useInfiniteScroll.test.ts
describe('useInfiniteScroll', () => {
  it('should initialize with empty items');
  it('should load initial page');
  it('should load more on scroll');
  it('should cancel pending requests on filter change');
  it('should deduplicate concurrent requests');
  it('should handle errors gracefully');
  it('should reset on explicit reset()');
  it('should include facets when requested');
});

// hooks/__tests__/useKeyboardNavigation.test.ts
describe('useKeyboardNavigation', () => {
  it('should navigate down on j/↓');
  it('should navigate up on k/↑');
  it('should go to top on gg');
  it('should go to bottom on G');
  it('should toggle selection on x');
  it('should select all on ⌘A');
  it('should clear selection on Esc');
  it('should trigger preview on Space');
  it('should trigger select on Enter');
  it('should ignore when in input/textarea');
});

// hooks/__tests__/useBookmarks.test.ts
describe('useBookmarks', () => {
  it('should load from localStorage on mount');
  it('should add bookmark');
  it('should remove bookmark');
  it('should toggle bookmark');
  it('should enforce max limit');
  it('should sync across tabs');
});
```

### Component Tests (React Testing Library)

```typescript
// components/__tests__/VirtualResourceList.test.tsx
describe('VirtualResourceList', () => {
  it('renders loading skeleton when isLoading');
  it('renders error state when error');
  it('renders empty state when no resources');
  it('renders resources in grid view');
  it('renders resources in list view');
  it('renders resources in compact view');
  it('highlights focused item');
  it('shows selection indicator');
  it('triggers loadMore when scrolling to bottom');
});

// components/__tests__/CommandPaletteSearch.test.tsx
describe('CommandPaletteSearch', () => {
  it('opens on "/" key');
  it('closes on Escape');
  it('navigates with arrow keys');
  it('selects on Enter');
  it('shows recent searches');
  it('shows pinned searches');
  it('shows search results');
  it('shows syntax help on "?"');
});

// components/__tests__/BulkActionsToolbar.test.tsx
describe('BulkActionsToolbar', () => {
  it('is hidden when no selection');
  it('shows selection count');
  it('enables export button');
  it('enables compare when 2-4 selected');
  it('disables compare when <2 or >4 selected');
  it('clears selection on clear button');
});
```

### E2E Tests (Playwright)

```typescript
// e2e/resources-page.spec.ts
test.describe('Resources Page', () => {
  test('should load and display resources', async ({ page }) => {
    await page.goto('/resources');
    await expect(page.locator('[data-testid="resource-card"]')).toHaveCount.greaterThan(0);
  });

  test('should filter by classification', async ({ page }) => {
    await page.goto('/resources');
    await page.click('text=SECRET');
    await expect(page.locator('[data-testid="resource-card"]')).toHaveCount.greaterThan(0);
  });

  test('should search documents', async ({ page }) => {
    await page.goto('/resources');
    await page.keyboard.press('/');
    await page.keyboard.type('fuel inventory');
    await page.keyboard.press('Enter');
    // Verify results
  });

  test('should use keyboard navigation', async ({ page }) => {
    await page.goto('/resources');
    await page.keyboard.press('j');
    await page.keyboard.press('j');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-testid="preview-modal"]')).toBeVisible();
  });

  test('should export selected resources', async ({ page }) => {
    await page.goto('/resources');
    await page.keyboard.press('j');
    await page.keyboard.press('x');
    await page.keyboard.press('j');
    await page.keyboard.press('x');
    await page.click('text=Export');
    await page.click('text=CSV');
    // Verify download
  });
});
```

### Accessibility Tests (axe-core)

```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('resources page should have no violations', async ({ page }) => {
    await page.goto('/resources');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('dark mode should have no violations', async ({ page }) => {
    await page.goto('/resources');
    await page.emulateMedia({ colorScheme: 'dark' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
```

---

## Performance Targets

| Metric | Current (Est.) | Target | Method |
|--------|----------------|--------|--------|
| FCP | 2.5s | <1s | Lighthouse CI |
| TTI | 4s | <2s | Lighthouse CI |
| LCP | 3s | <1.5s | Lighthouse CI |
| CLS | 0.1 | <0.1 | Lighthouse CI |
| Memory (28K docs) | 150MB | <50MB | DevTools profiler |
| Search latency | 800ms | <200ms | API timing |
| Filter latency | 500ms | <100ms | API timing |

---

## Implementation Timeline

```
Week of Dec 2-6 (Current)
├── Mon Dec 2: Gap analysis complete ✅
├── Tue Dec 3: Virtual scrolling migration + Dark mode audit
├── Wed Dec 4: Full-text search + Animation consistency
├── Thu Dec 5: Accessibility fixes + Mobile polish
└── Fri Dec 6: Test suite creation + Lighthouse profiling

Week of Dec 9-13 (Phase 5)
├── Mon Dec 9: Advanced Query Builder (start)
├── Tue Dec 10: Advanced Query Builder (complete)
├── Wed Dec 11: Timeline View
├── Thu Dec 12: High Contrast Mode + Similar Documents
└── Fri Dec 13: Statistics Dashboard + Final polish
```

---

## Dependencies

### npm Packages (Add to frontend)

```json
{
  "@tanstack/react-virtual": "^3.0.0",
  "@axe-core/playwright": "^4.8.0",
  "recharts": "^2.10.0"
}
```

### MongoDB Indexes (Backend)

```javascript
// Create text index for full-text search
db.resources.createIndex(
  { title: "text", resourceId: "text" },
  { name: "resources_text_index" }
);

// Create compound index for faceted queries
db.resources.createIndex(
  { originRealm: 1, classification: 1, encrypted: 1 },
  { name: "resources_facet_index" }
);
```

---

## Risk Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Virtual scroll migration breaks animations | High | Medium | Feature flag rollout; fallback option |
| Text index slows write performance | Medium | Low | Monitor write latency; async indexing |
| Accessibility fixes break layout | Medium | Medium | Visual regression testing |
| Phase 5 timeline too aggressive | Medium | High | Prioritize P2 over P3; defer if needed |

---

## Success Criteria

### Phase 4 Completion (Dec 6)
- [ ] Lighthouse accessibility score ≥95%
- [ ] Lighthouse performance score ≥80%
- [ ] Zero axe-core violations
- [ ] Memory usage <50MB at 28K documents
- [ ] 80%+ test coverage on hooks

### Phase 5 Completion (Dec 13)
- [ ] Advanced query builder functional
- [ ] Timeline view functional
- [ ] High contrast theme available
- [ ] Similar documents suggestions working
- [ ] Expanded statistics dashboard

---

*Document authored as part of DIVE V3 Implementation Plan V2*  
*Last updated: December 1, 2025*

