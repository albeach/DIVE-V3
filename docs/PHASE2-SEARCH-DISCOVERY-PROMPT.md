# DIVE V3 - Phase 2: Search & Discovery Enhancement

## 🎯 Primary Objective

Implement Phase 2 of the Resources Page UX Enhancement: **Enterprise-Grade Search & Discovery Experience** for 28,100+ federated classified documents across USA, FRA, GBR, and DEU instances.

---

## 📋 Background Context

### What Was Completed in Phase 1 (Performance Foundation) ✅

Phase 1 focused on building a robust performance foundation to handle large document volumes efficiently:

| Component | Status | File Location |
|-----------|--------|---------------|
| Server-Side Pagination API | ✅ Complete | `backend/src/controllers/paginated-search.controller.ts` |
| Cursor-Based Pagination | ✅ Complete | Uses MongoDB cursor for efficient "next page" |
| `useInfiniteScroll` Hook | ✅ Complete | `frontend/src/hooks/useInfiniteScroll.ts` |
| `useAbortController` Hook | ✅ Complete | `frontend/src/hooks/useAbortController.ts` |
| `useDebouncedFetch` Hook | ✅ Complete | `frontend/src/hooks/useAbortController.ts` |
| `VirtualResourceList` Component | ✅ Complete | `frontend/src/components/resources/virtual-resource-list.tsx` |
| Skeleton Loading | ✅ Complete | `frontend/src/components/resources/skeleton-loading.tsx` |
| Federation Query Optimization | ✅ Complete | `frontend/src/lib/federation-query.ts` |
| `page-v2.tsx` Integration | ✅ Complete | `frontend/src/app/resources/page-v2.tsx` |

**Phase 1 Metrics Achieved:**
- 28,100 documents across 4 federated instances
- Federated search latency: ~380ms
- Virtualized list rendering for efficient DOM usage
- Cursor-based infinite scroll implemented

### Current File Structure (Relevant Files)

```
DIVE-V3/
├── backend/
│   └── src/
│       ├── controllers/
│       │   ├── paginated-search.controller.ts   # Phase 1: Paginated search
│       │   ├── resource.controller.ts
│       │   └── federated-search.controller.ts
│       ├── routes/
│       │   └── resource.routes.ts               # API routes
│       ├── middleware/
│       │   ├── authz.middleware.ts              # PEP/OPA integration
│       │   └── enrichment.middleware.ts
│       ├── services/
│       │   ├── resource.service.ts
│       │   └── opa-authz.service.ts
│       └── utils/
│           ├── mongodb-config.ts
│           ├── cursor-pagination.ts
│           └── clearance-filter.ts
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── api/resources/
│       │   │   ├── search/route.ts              # Phase 1: Search API proxy
│       │   │   └── search/facets/route.ts       # Phase 1: Facets API proxy
│       │   └── resources/
│       │       ├── page.tsx                      # Original resources page
│       │       ├── page-v2.tsx                   # Phase 1: New page with infinite scroll
│       │       └── [id]/page.tsx                 # Resource detail page
│       ├── components/resources/
│       │   ├── index.ts                          # Component exports
│       │   ├── advanced-resource-card.tsx        # 3 view modes (grid/list/compact)
│       │   ├── advanced-search.tsx               # Current autocomplete search
│       │   ├── command-palette-search.tsx        # ⌘K component (needs enhancement)
│       │   ├── faceted-filters.tsx               # Phase 1: Faceted filters
│       │   ├── virtual-resource-list.tsx         # Phase 1: Virtualized list
│       │   ├── skeleton-loading.tsx              # Phase 1: Loading states
│       │   ├── resource-preview-modal.tsx        # Quick preview modal
│       │   └── design-system.ts                  # Design tokens
│       ├── hooks/
│       │   ├── index.ts                          # Hook exports
│       │   ├── useInfiniteScroll.ts              # Phase 1: Infinite scroll
│       │   ├── useAbortController.ts             # Phase 1: Request cancellation
│       │   └── useKeyboardNavigation.tsx         # Keyboard navigation
│       └── lib/
│           └── federation-query.ts               # Phase 1: Federation optimization
├── policies/
│   └── fuel_inventory_abac_policy.rego           # OPA ABAC policy (163 tests)
├── config/
│   └── federation-registry.json                  # SSOT v3.1.0
└── docs/
    ├── RESOURCES-PAGE-UX-AUDIT.md                # Full audit & implementation plan
    ├── PHASE1-PERFORMANCE-COMPLETE.md            # Phase 1 completion summary
    └── PHASE2-SEARCH-DISCOVERY-PROMPT.md         # This document
```

---

## 🏗️ Phase 2 Implementation Plan: Search & Discovery

### SMART Objectives

| ID | Objective | Specific | Measurable | Target | Timeline |
|----|-----------|----------|------------|--------|----------|
| P2.1 | Command Palette Enhancement | Enhance ⌘K/Ctrl+K to Linear/Raycast quality | Response time, user adoption | <100ms response, used by 80%+ users | Day 1-2 |
| P2.2 | Full-Text Search | Integrate MongoDB text indexes for content search | Search recall/precision | 90%+ relevant results | Day 2 |
| P2.3 | Advanced Search Syntax | Support operators: AND/OR/NOT/"phrase"/field:value | Syntax coverage | All operators functional | Day 3 |
| P2.4 | Faceted Search with Live Counts | Real-time filter counts update with query | Facet accuracy | 100% count accuracy | Day 3 |
| P2.5 | Recent/Pinned Searches | Persist user search history and favorites | Persistence | Survives session restart | Day 4 |
| P2.6 | Search Analytics | Track popular searches, click-through rates | Tracking coverage | 100% search events logged | Day 4 |

### Success Criteria Checklist

**Day 1-2: Command Palette Enhancement**
- [ ] ⌘K opens command palette in <50ms
- [ ] Escape key closes palette
- [ ] Arrow keys navigate suggestions
- [ ] Enter executes selected action
- [ ] Fuzzy search matches resources by title, ID, classification
- [ ] Quick filters: classification, country, COI, instance, encryption
- [ ] Recent searches appear when palette opens
- [ ] Pinned resources section functional
- [ ] Voice input support (if supported by browser)
- [ ] Glass morphism design with proper dark mode

**Day 2: Full-Text Search Integration**
- [ ] MongoDB text indexes created on title, resourceId, content fields
- [ ] Backend search endpoint uses `$text` operator
- [ ] Relevance scoring via `$meta: "textScore"`
- [ ] Search results sorted by relevance
- [ ] Highlighted matches in results
- [ ] Fallback to regex for non-indexed fields

**Day 3: Advanced Search Syntax**
- [ ] AND operator: `SECRET AND FVEY`
- [ ] OR operator: `USA OR FRA`
- [ ] NOT operator: `NOT encrypted`
- [ ] Exact phrase: `"fuel inventory"`
- [ ] Field-specific: `classification:SECRET`
- [ ] Range queries: `date:>2025-01-01`
- [ ] Parentheses grouping: `(USA OR FRA) AND SECRET`
- [ ] Syntax help tooltip in search bar
- [ ] Invalid syntax error feedback

**Day 3: Faceted Search with Live Counts**
- [ ] Classification facet shows real-time counts
- [ ] Country/releasability facet shows counts
- [ ] COI facet shows counts
- [ ] Instance origin facet shows counts
- [ ] Encryption status facet shows counts
- [ ] Counts update instantly on query change
- [ ] Zero-count facets are grayed out (not hidden)
- [ ] Selected facets show at top with "x" to remove

**Day 4: Recent/Pinned Searches**
- [ ] Last 10 searches persisted to localStorage
- [ ] Search history survives page refresh
- [ ] Clear search history option
- [ ] Pin/star favorite searches
- [ ] Pinned searches sync to backend (optional stretch)
- [ ] Recent searches appear in command palette

**Day 4: Search Analytics**
- [ ] Search queries logged (anonymized)
- [ ] Click-through events tracked
- [ ] Zero-result searches flagged
- [ ] Popular searches aggregated
- [ ] Search performance metrics (latency histogram)

---

## 🔧 Technical Implementation Details

### Task 2.1: Command Palette Enhancement

**File:** `frontend/src/components/resources/command-palette-search.tsx`

The current command palette exists but needs enhancement:

```typescript
// Current interface (already exists)
interface CommandPaletteSearchProps {
  resources: IResource[];
  onSearch: (query: string) => void;
  onFilterApply: (filter: QuickFilter) => void;
  onResourceSelect: (resourceId: string) => void;
  recentSearches?: string[];
  pinnedResources?: IResource[];
  userClearance?: string;
  userCountry?: string;
}

// Enhancements needed:
// 1. Integrate with useInfiniteScroll for server-side search
// 2. Add fuzzy search algorithm (Fuse.js or custom)
// 3. Implement keyboard navigation state machine
// 4. Add recent searches persistence hook
// 5. Integrate with federation query service
```

**New Component Structure:**
```typescript
// Enhanced command palette with server-side search
interface EnhancedCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (resourceId: string) => void;
  onApplyFilter: (filters: ISearchFilters) => void;
}

// Search result categories
type SearchResultCategory = 
  | 'resources'     // Direct resource matches
  | 'filters'       // Quick filter suggestions
  | 'actions'       // Navigation/export actions
  | 'recent'        // Recent searches
  | 'pinned';       // Pinned favorites
```

### Task 2.2: Full-Text Search Integration

**Backend Changes:**

1. **Create MongoDB Text Index:**
```typescript
// backend/scripts/create-text-indexes.ts
db.resources.createIndex(
  { 
    title: "text", 
    resourceId: "text",
    "content": "text"
  },
  {
    weights: { title: 10, resourceId: 5, content: 1 },
    name: "resources_text_search"
  }
);
```

2. **Update Search Controller:**
```typescript
// backend/src/controllers/paginated-search.controller.ts
// Add $text search option
if (query.trim()) {
  mongoQuery.$text = { $search: query };
  sortCriteria = { score: { $meta: "textScore" }, ...sortCriteria };
}
```

### Task 2.3: Advanced Search Syntax Parser

**New Utility File:** `frontend/src/lib/search-syntax-parser.ts`

```typescript
interface ParsedQuery {
  textSearch: string;
  filters: {
    field: string;
    operator: '=' | '!=' | '>' | '<' | 'contains';
    value: string;
  }[];
  booleanOperator: 'AND' | 'OR';
}

// Parser should handle:
// - "fuel inventory" → exact phrase
// - classification:SECRET → field filter
// - NOT encrypted → negation
// - (USA OR FRA) AND SECRET → boolean grouping
export function parseSearchQuery(input: string): ParsedQuery;
```

### Task 2.4: Faceted Search with Live Counts

Already partially implemented in Phase 1. Enhancements needed:

```typescript
// frontend/src/components/resources/faceted-filters.tsx
// Add optimistic UI updates
// Add debounced count refresh
// Add zero-count handling
```

### Task 2.5: Recent/Pinned Searches

**New Hook:** `frontend/src/hooks/useSearchHistory.ts`

```typescript
interface UseSearchHistoryReturn {
  recentSearches: string[];
  pinnedSearches: string[];
  addToHistory: (query: string) => void;
  pinSearch: (query: string) => void;
  unpinSearch: (query: string) => void;
  clearHistory: () => void;
}

export function useSearchHistory(): UseSearchHistoryReturn;
```

### Task 2.6: Search Analytics

**Backend Endpoint:** `POST /api/analytics/search`

```typescript
interface SearchAnalyticsEvent {
  event: 'search' | 'click' | 'filter_apply' | 'zero_results';
  query: string;
  filters: ISearchFilters;
  resultCount: number;
  clickedResourceId?: string;
  latencyMs: number;
  timestamp: string;
}
```

---

## 🧩 Gap Analysis: Existing Integration

### OPA/ABAC Integration Status

| Aspect | Status | Notes |
|--------|--------|-------|
| PEP Middleware | ✅ Working | `authz.middleware.ts` enforces on `/api/resources/:id` |
| PDP (OPA) | ✅ Working | 163 tests passing, full ABAC policy |
| Clearance Filtering | ✅ Working | `clearance-filter.ts` filters results by user clearance |
| Faceted Results | ⚠️ Partial | Facets should respect user clearance limits |
| Search Results | ⚠️ Partial | Text search should not expose unauthorized content |

**Gap:** Search results and facet counts currently may expose resource metadata that user shouldn't see. Need to apply clearance filter BEFORE facet aggregation.

### Keycloak Integration Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Authentication | ✅ Working | NextAuth.js with Keycloak provider |
| JWT Claims | ✅ Working | clearance, countryOfAffiliation, acpCOI extracted |
| Federation | ✅ Working | 4 instances cross-authenticate |
| Session Refresh | ✅ Working | Token refresh on expiry |
| Attribute Enrichment | ✅ Working | `enrichment.middleware.ts` handles missing attrs |

**Gap:** Search analytics should track user uniqueID (anonymized) but NOT PII.

### KAS Integration Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Key Request | ✅ Working | `POST /api/resources/request-key` |
| Policy Re-evaluation | ✅ Working | KAS calls OPA before key release |
| Encrypted Flag | ✅ Working | Resources marked with `encrypted: true` |
| ZTDF Download | ✅ Working | `/api/resources/:id/download` returns .ztdf |

**Gap:** Search should indicate encrypted resources require additional KAS approval.

### MongoDB Integration Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Connection | ✅ Working | Pooled connection in `mongodb-config.ts` |
| Text Indexes | ❌ Missing | Need to create for full-text search |
| Facet Aggregation | ✅ Working | `$facet` pipeline in paginated-search.controller |
| Cursor Pagination | ✅ Working | Efficient cursor-based pagination |

**Gap:** Text indexes not created. Need script to create indexes on all instances.

### Federation Integration Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Instance Discovery | ✅ Working | `federation-registry.json` defines all instances |
| Cross-Instance Search | ✅ Working | `federated-search.controller.ts` aggregates |
| Circuit Breaker | ✅ Working | `federation-query.ts` has failure protection |
| Result Caching | ✅ Working | LRU cache with TTL |

**Gap:** Federated search latency (~380ms) could be improved with request batching.

---

## 🧪 Test Suites Required

### Backend Tests

```typescript
// backend/src/__tests__/controllers/paginated-search.controller.test.ts
describe('PaginatedSearchController', () => {
  describe('POST /api/resources/search', () => {
    it('should return paginated results with cursor');
    it('should filter by classification');
    it('should filter by country');
    it('should filter by COI');
    it('should filter by encryption status');
    it('should filter by instance origin');
    it('should support text search');
    it('should apply clearance-based filtering');
    it('should return accurate facet counts');
    it('should respect sort options');
    it('should handle empty results gracefully');
  });

  describe('Advanced Search Syntax', () => {
    it('should support AND operator');
    it('should support OR operator');
    it('should support NOT operator');
    it('should support exact phrase matching');
    it('should support field:value syntax');
    it('should return error for invalid syntax');
  });
});
```

### Frontend Tests

```typescript
// frontend/src/__tests__/components/command-palette-search.test.tsx
describe('CommandPaletteSearch', () => {
  it('should open with ⌘K/Ctrl+K');
  it('should close with Escape');
  it('should navigate with arrow keys');
  it('should execute action with Enter');
  it('should show recent searches on open');
  it('should filter resources by query');
  it('should show quick filter suggestions');
  it('should persist recent searches');
});

// frontend/src/__tests__/hooks/useSearchHistory.test.ts
describe('useSearchHistory', () => {
  it('should add searches to history');
  it('should limit history to 10 items');
  it('should persist to localStorage');
  it('should pin/unpin searches');
  it('should clear history');
});
```

### E2E Tests

```typescript
// tests/e2e/search-discovery.spec.ts
describe('Search & Discovery', () => {
  test('User can search resources with command palette', async () => {
    // Press ⌘K, type query, select result
  });

  test('User can apply filters from command palette', async () => {
    // Press ⌘K, select "Filter by SECRET", verify results
  });

  test('Advanced search syntax works', async () => {
    // Type "classification:SECRET AND FVEY", verify results
  });

  test('Faceted filters show accurate counts', async () => {
    // Apply filter, verify count matches result count
  });

  test('Recent searches persist across sessions', async () => {
    // Search, refresh, open palette, verify recent searches
  });
});
```

---

## 📦 Dependencies to Add

```json
{
  "dependencies": {
    "fuse.js": "^7.0.0",       // Fuzzy search library
    "date-fns": "^3.0.0",      // Date parsing for range queries
    "cmdk": "^1.0.0"           // Command palette primitives (optional)
  }
}
```

---

## 🔑 Available Permissions & Tools

### CLI Access Granted
- **GitHub CLI** (`gh`): Full access for PR creation, issue management
- **GCP CLI** (`gcloud`): Full access - new project creation allowed
- **Cloudflare CLI** (`cloudflared`): Tunnel management
- **Keycloak Docs MCP**: Search Keycloak documentation for integration patterns

### Best Practice Requirements
- **100% Persistent**: All changes must survive restarts, no temporary fixes
- **Resilient**: Circuit breakers, retries, graceful degradation
- **No Workarounds**: Proper solutions only, no quick hacks
- **Extensive Testing**: Unit, integration, and E2E tests required
- **Documentation**: Update relevant docs for all changes

---

## 🚀 Execution Order

### Day 1: Command Palette Core
1. Enhance `command-palette-search.tsx` with keyboard navigation state machine
2. Integrate with `useInfiniteScroll` for server-side search
3. Implement fuzzy search with Fuse.js
4. Add recent searches persistence
5. Write unit tests

### Day 2: Full-Text Search Backend
1. Create MongoDB text indexes script
2. Run indexes on all 4 instances
3. Update `paginated-search.controller.ts` for $text search
4. Add relevance scoring
5. Write backend tests

### Day 3: Advanced Syntax & Facets
1. Create `search-syntax-parser.ts`
2. Integrate parser with search endpoint
3. Enhance faceted filters with live counts
4. Add zero-count handling
5. Write parser tests

### Day 4: Analytics & Polish
1. Create search analytics endpoint
2. Implement event tracking
3. Add pinned searches feature
4. Polish UI animations
5. Write E2E tests

---

## 📝 Notes for AI Assistant

1. **Read existing files first**: All Phase 1 components exist - enhance, don't recreate
2. **Maintain TypeScript strict mode**: No `any` types, full type coverage
3. **Follow existing patterns**: Match code style in existing files
4. **Test incrementally**: Write tests as you implement each feature
5. **Update exports**: Add new exports to `index.ts` files
6. **Document changes**: Add JSDoc comments to new functions
7. **GCP Project**: May need to create new GCP project for search analytics
8. **Federation**: Remember search operates across 4 instances

---

## 🏁 Definition of Done

Phase 2 is complete when:

- [ ] All 6 tasks have passing tests
- [ ] Command palette opens with ⌘K in <50ms
- [ ] Full-text search returns relevant results
- [ ] Advanced syntax operators all functional
- [ ] Faceted filters show accurate real-time counts
- [ ] Recent searches persist across sessions
- [ ] Search analytics events logged
- [ ] No TypeScript errors
- [ ] No linting errors
- [ ] E2E tests passing
- [ ] Documentation updated
- [ ] PR reviewed and merged

---

*Document created for Phase 2 implementation handoff*
*Date: December 1, 2025*




