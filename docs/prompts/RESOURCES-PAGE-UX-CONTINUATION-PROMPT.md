# DIVE V3 - Resources Page UX Enhancement Continuation

## 🎯 Primary Objective

Continue implementing the **Resources Page UI/UX Enhancement Plan** from `docs/RESOURCES-PAGE-UX-AUDIT.md`, focusing on completing Phase 1 & Phase 2 deferred items and transitioning to Phase 3 (Power User Features).

---

## 📋 Current Implementation Status

### Phase 1: Performance Foundation ✅ COMPLETE

| Task | Component/File | Status | Notes |
|------|----------------|--------|-------|
| 1.1 Server-side pagination API | `backend/src/controllers/paginated-search.controller.ts` | ✅ Complete | Cursor-based pagination |
| 1.2 Cursor-based infinite scroll | `frontend/src/hooks/useInfiniteScroll.ts` | ✅ Complete | Intersection observer |
| 1.3 Virtual list component | `frontend/src/components/resources/virtual-resource-list.tsx` | ✅ Complete | Windowed rendering |
| 1.4 Skeleton loading states | `frontend/src/components/resources/skeleton-loading.tsx` | ✅ Complete | Shimmer animations |
| 1.5 Request cancellation/debouncing | `frontend/src/hooks/useAbortController.ts` | ✅ Complete | AbortController pattern |
| 1.6 Federation query optimization | `frontend/src/lib/federation-query.ts` | ✅ Complete | Parallel instance queries |

**Phase 1 Verified Deliverables:**
- [x] `GET /api/resources/paginated-search` endpoint with cursor
- [x] `useInfiniteScroll` hook with auto-load
- [x] `VirtualResourceList` component
- [x] `ResourceCardSkeleton` + shimmer animations
- [x] `page-v2.tsx` integration

### Phase 2: Search Enhancement ✅ MOSTLY COMPLETE (80%)

| Task | Component/File | Status | Notes |
|------|----------------|--------|-------|
| 2.1 Command palette (⌘K → "/" fix) | `frontend/src/components/resources/command-palette-search.tsx` | ✅ Complete | "/" trigger (industry standard) |
| 2.2 Full-text search integration | MongoDB text indexes | ✅ Complete | All 4 instances indexed |
| 2.3 Advanced search syntax parser | `frontend/src/lib/search-syntax-parser.ts` | ✅ Complete | AND/OR/NOT/field:value |
| 2.4 Faceted search with counts | `frontend/src/components/resources/faceted-filters.tsx` | ✅ Complete | Live facet counts |
| 2.5 Recent/pinned search suggestions | `frontend/src/hooks/useSearchHistory.ts` | ✅ Complete | localStorage persistence |
| 2.6 Search analytics tracking | `frontend/src/lib/search-analytics.ts` | ✅ Complete | Non-blocking tracking |

**Phase 2 Verified Deliverables:**
- [x] `CommandPaletteSearch` component with "/" activation
- [x] `SearchSyntaxParser` utility (supports field:value, AND, OR, NOT, "phrase")
- [x] `FacetedFilters` with live counts per classification/country/COI
- [x] Backend facet aggregation endpoint (`/api/resources/paginated-search`)
- [x] MongoDB text indexes on all 4 instances (USA, FRA, GBR, DEU)
- [x] Search analytics tracking (`/api/analytics/search`)

### Phase 2 Deferred Items ⚠️ (Requires Verification)

| Item | Status | Action Required |
|------|--------|-----------------|
| Backend facet aggregation integration | ⚠️ Untested | Verify facet counts update dynamically |
| Full-text search relevance scoring | ⚠️ Partial | Verify MongoDB text search weights |
| Date range picker | ❌ Not started | Implement calendar-based filtering |
| Advanced query builder UI | ❌ Not started | Optional P2 stretch goal |

### Phase 3: Power User Features ❌ NOT STARTED

| Task | Description | Est. Hours | Priority |
|------|-------------|------------|----------|
| 3.1 | Keyboard navigation system (j/k, Space, Enter) | 6 | P1 |
| 3.2 | Bulk selection UI | 5 | P1 |
| 3.3 | Quick preview modal | 6 | P1 |
| 3.4 | Export functionality (CSV/JSON) | 4 | P1 |
| 3.5 | Comparison view (side-by-side) | 8 | P2 |
| 3.6 | Bookmark/favorites system | 5 | P2 |
| 3.7 | Column customizer for list view | 6 | P2 |

**Phase 3 Deliverables (Required):**
- [ ] `useKeyboardNavigation` hook enhancement (existing file needs expansion)
- [ ] `BulkActionsToolbar` component
- [ ] `ResourcePreviewModal` component (existing file needs Space bar integration)
- [ ] `ResourceComparisonView` component
- [ ] `ColumnCustomizer` component
- [ ] Export service (CSV/JSON)

### Phase 4: Visual Polish & Accessibility ❌ NOT STARTED

Reserved for Week 4 implementation.

---

## 🏗️ Project Directory Structure

```
DIVE-V3/
├── frontend/                           # Next.js 15 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── resources/
│   │   │   │   │   ├── paginated-search/route.ts    # Phase 1: Paginated search proxy
│   │   │   │   │   ├── federated-search/route.ts    # Federation query proxy
│   │   │   │   │   └── search/route.ts              # Legacy search
│   │   │   │   └── analytics/
│   │   │   │       └── search/route.ts              # Phase 2: Analytics proxy
│   │   │   └── resources/
│   │   │       ├── page.tsx                         # Current resources page
│   │   │       └── page-v2.tsx                      # Phase 1 enhanced (infinite scroll)
│   │   ├── components/
│   │   │   └── resources/
│   │   │       ├── command-palette-search.tsx       # Phase 2: "/" search (UPDATED)
│   │   │       ├── virtual-resource-list.tsx        # Phase 1: Windowed rendering
│   │   │       ├── faceted-filters.tsx              # Phase 1+2: Live counts
│   │   │       ├── skeleton-loading.tsx             # Phase 1: Shimmer states
│   │   │       ├── resource-preview-modal.tsx       # Needs Phase 3 enhancement
│   │   │       ├── advanced-resource-card.tsx       # Card with 3 view modes
│   │   │       ├── advanced-search.tsx              # Autocomplete search
│   │   │       ├── resource-filters.tsx             # Filter sidebar
│   │   │       ├── saved-filters.tsx                # Filter presets
│   │   │       ├── pagination.tsx                   # Page navigation
│   │   │       ├── view-mode-switcher.tsx           # Grid/List/Compact
│   │   │       └── index.ts                         # Barrel exports
│   │   ├── hooks/
│   │   │   ├── useInfiniteScroll.ts                 # Phase 1: Cursor pagination
│   │   │   ├── useAbortController.ts                # Phase 1: Request cancellation
│   │   │   ├── useKeyboardNavigation.tsx            # Phase 1+3: Keyboard nav
│   │   │   ├── useSearchHistory.ts                  # Phase 2: Recent/pinned
│   │   │   └── index.ts                             # Barrel exports
│   │   └── lib/
│   │       ├── search-syntax-parser.ts              # Phase 2: Query parsing
│   │       ├── search-analytics.ts                  # Phase 2: Analytics (NEW)
│   │       └── federation-query.ts                  # Phase 1: Federation optimization
│
├── backend/                            # Express.js API (PEP)
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── paginated-search.controller.ts       # Phase 1: Cursor pagination
│   │   │   ├── federated-search.controller.ts       # Federation queries
│   │   │   ├── search-analytics.controller.ts       # Phase 2: Analytics
│   │   │   └── resource.controller.ts               # Resource CRUD
│   │   ├── routes/
│   │   │   ├── resource.routes.ts
│   │   │   ├── federated-query.routes.ts
│   │   │   └── analytics.routes.ts                  # Phase 2: Analytics routes
│   │   └── utils/
│   │       ├── cursor-pagination.ts                 # Cursor encoding
│   │       └── mongodb-config.ts                    # DB connection
│
├── policies/                           # OPA Rego policies
│   ├── fuel_inventory_abac_policy.rego             # Main ABAC policy
│   └── tests/                                       # 106+ tests passing
│
├── keycloak/                           # IdP broker
│   ├── themes/                                      # Custom themes
│   └── realms/                                      # Realm configs
│
├── kas/                                # Key Access Service
│   └── src/server.ts                               # ZTDF encryption
│
├── config/
│   └── federation-registry.json                    # SSOT for federation
│
└── docs/
    ├── RESOURCES-PAGE-UX-AUDIT.md                  # THIS REFERENCE DOC
    └── prompts/
        └── RESOURCES-PAGE-UX-CONTINUATION-PROMPT.md # THIS PROMPT
```

---

## 🔌 Running Services Status (All Healthy)

### USA Instance (Primary - localhost)
| Service | Container | Port | Status |
|---------|-----------|------|--------|
| Frontend | dive-v3-frontend | 3000 | ✅ Healthy |
| Backend | dive-v3-backend | 4000 | ✅ Healthy |
| Keycloak | dive-v3-keycloak | 8443 | ✅ Healthy |
| OPA | dive-v3-opa | 8181 | ✅ Healthy |
| MongoDB | dive-v3-mongo | 27017 | ✅ 7,000 docs + text index |
| KAS | dive-v3-kas | 8080 | ✅ Healthy |

### FRA Instance (localhost)
| Service | Container | Port | Status |
|---------|-----------|------|--------|
| Frontend | dive-v3-frontend-fra | 3001 | ✅ Healthy |
| Backend | dive-v3-backend-fra | 4001 | ✅ Healthy |
| Keycloak | dive-v3-keycloak-fra | 8444 | ✅ Healthy |
| MongoDB | dive-v3-mongodb-fra | 27018 | ✅ 7,000 docs + text index |

### GBR Instance (localhost)
| Service | Container | Port | Status |
|---------|-----------|------|--------|
| Frontend | dive-v3-frontend-gbr | 3002 | ✅ Healthy |
| Backend | dive-v3-backend-gbr | 4002 | ✅ Healthy |
| Keycloak | dive-v3-keycloak-gbr | 8445 | ✅ Healthy |
| MongoDB | dive-v3-mongodb-gbr | 27019 | ✅ 7,000 docs + text index |

### DEU Instance (Remote: 192.168.42.120)
| Service | Domain | Status |
|---------|--------|--------|
| Frontend | deu-app.prosecurity.biz | ✅ Healthy |
| Backend | deu-api.prosecurity.biz | ✅ Healthy |
| Keycloak | deu-auth.prosecurity.biz | ✅ Healthy |
| MongoDB | Internal only | ✅ 7,100 docs + text index |

**Total Documents:** 28,100 across 4 federated instances

---

## 🔗 Federation Architecture

### Cloudflare Tunnel URLs

| Instance | Frontend | Backend API | Keycloak |
|----------|----------|-------------|----------|
| USA | https://usa-app.dive25.com | https://usa-api.dive25.com | https://usa-auth.dive25.com |
| FRA | https://fra-app.dive25.com | https://fra-api.dive25.com | https://fra-auth.dive25.com |
| GBR | https://gbr-app.dive25.com | https://gbr-api.dive25.com | https://gbr-auth.dive25.com |
| DEU | https://deu-app.prosecurity.biz | https://deu-api.prosecurity.biz | https://deu-auth.prosecurity.biz |

---

## 🔍 Gap Analysis: Instance Resource Integration

### OPA Policy Sync Status

| Instance | Policy Version | Tests Passing | Status |
|----------|----------------|---------------|--------|
| USA | v1.10.1 | 106/106 | ✅ Verified |
| FRA | v1.10.1 | Untested | ⚠️ Needs verification |
| GBR | v1.10.1 | Untested | ⚠️ Needs verification |
| DEU | v1.10.1 | 106/106 | ✅ Verified |

### Keycloak Configuration

| Instance | Realm | IdP Brokers | Protocol Mappers | MFA Flows |
|----------|-------|-------------|------------------|-----------|
| USA | dive-v3-broker | 3 (FRA, GBR, DEU) | ✅ Configured | ✅ AAL1/2/3 |
| FRA | dive-v3-broker | 3 (USA, GBR, DEU) | ✅ Configured | ✅ AAL1/2/3 |
| GBR | dive-v3-broker | 3 (USA, FRA, DEU) | ✅ Configured | ✅ AAL1/2/3 |
| DEU | dive-v3-broker | 3 (USA, FRA, GBR) | ✅ Configured | ✅ AAL1/2/3 |

### KAS Integration Status

| Instance | KAS Running | ZTDF Support | Cross-Instance Keys |
|----------|-------------|--------------|---------------------|
| USA | ✅ Healthy | ✅ Working | ⚠️ Needs testing |
| FRA | ✅ Healthy | ⚠️ Untested | ⚠️ Needs testing |
| GBR | ✅ Healthy | ⚠️ Untested | ⚠️ Needs testing |
| DEU | ✅ Healthy | ⚠️ Untested | ⚠️ Needs testing |

### MongoDB Text Index Status

| Instance | Documents | Text Index | Weights Configured |
|----------|-----------|------------|-------------------|
| USA | 7,000 | ✅ `resources_text_search` | title:10, resourceId:5, displayMarking:1 |
| FRA | 7,000 | ✅ `resources_text_search` | title:10, resourceId:5, displayMarking:1 |
| GBR | 7,000 | ✅ `resources_text_search` | title:10, resourceId:5, displayMarking:1 |
| DEU | 7,100 | ✅ `resources_text_search` | title:10, resourceId:5, displayMarking:1 |

---

## 📁 Key Files Changed in Previous Session

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/lib/search-analytics.ts` | **NEW** - Client-side analytics tracking | ✅ Created |
| `frontend/src/components/resources/command-palette-search.tsx` | Updated with analytics + "/" trigger | ✅ Updated |
| `backend/scripts/create-text-indexes.ts` | MongoDB text index creation | ✅ Exists |
| `backend/src/controllers/search-analytics.controller.ts` | Analytics backend | ✅ Exists |
| `backend/src/routes/analytics.routes.ts` | Analytics routes | ✅ Registered |

---

## 🎯 SMART Objectives for Phase 3 Implementation

### Phase 3.1: Keyboard Navigation System
- **Specific:** Implement j/k/Space/Enter/Escape keyboard shortcuts for list navigation
- **Measurable:** 100% keyboard-navigable resource list without mouse
- **Achievable:** Extend existing `useKeyboardNavigation` hook
- **Relevant:** Power users report 40% productivity gain with keyboard shortcuts
- **Time-bound:** 6 hours

**Acceptance Criteria:**
- [ ] `j` key moves focus to next resource
- [ ] `k` key moves focus to previous resource
- [ ] `Space` opens quick preview modal
- [ ] `Enter` navigates to resource detail page
- [ ] `Escape` closes any open modal/panel
- [ ] Visual focus indicator on current resource

### Phase 3.2: Bulk Selection UI
- **Specific:** Add checkbox selection to resource cards with "Select All" functionality
- **Measurable:** Ability to select 100+ resources simultaneously
- **Achievable:** Standard checkbox pattern with Set-based selection state
- **Relevant:** Required for bulk export and comparison features
- **Time-bound:** 5 hours

**Acceptance Criteria:**
- [ ] Checkbox appears on hover or in selection mode
- [ ] Shift+Click for range selection
- [ ] Ctrl/Cmd+Click for individual toggle
- [ ] "Select All" / "Deselect All" buttons
- [ ] Selection count badge in toolbar

### Phase 3.3: Quick Preview Modal
- **Specific:** Space bar opens modal with resource summary, metadata, and quick actions
- **Measurable:** Preview renders in <100ms after keypress
- **Achievable:** Leverage existing `ResourcePreviewModal` component
- **Relevant:** GitHub/Figma pattern users expect
- **Time-bound:** 6 hours

**Acceptance Criteria:**
- [ ] Space bar triggers preview of focused resource
- [ ] Left/Right arrows navigate between resources in preview
- [ ] Shows classification, releasability, COI, content preview
- [ ] "View Full" button to navigate to detail page
- [ ] Mobile swipe gesture support

### Phase 3.4: Export Functionality (CSV/JSON)
- **Specific:** Export selected or all visible resources to downloadable file
- **Measurable:** Export 1000+ resources in <5 seconds
- **Achievable:** Client-side CSV/JSON generation
- **Relevant:** Data extraction for reports/analysis
- **Time-bound:** 4 hours

**Acceptance Criteria:**
- [ ] Export button in toolbar (enabled when resources selected or "all")
- [ ] Format dropdown: CSV, JSON, Excel
- [ ] Includes all visible metadata fields
- [ ] Respects current filters
- [ ] Download triggers browser save dialog

### Phase 3.5: Comparison View
- **Specific:** Side-by-side comparison of 2-4 selected resources
- **Measurable:** All metadata fields aligned for comparison
- **Achievable:** Flexbox/grid layout with synchronized scroll
- **Relevant:** Document comparison is top-requested feature
- **Time-bound:** 8 hours

**Acceptance Criteria:**
- [ ] "Compare" button enabled when 2-4 resources selected
- [ ] Opens full-screen comparison modal
- [ ] Highlights differences between resources
- [ ] Sticky header with resource titles
- [ ] Print-friendly layout

---

## ⚠️ Critical Requirements

### 1. NO WORKAROUNDS OR SHORTCUTS
- All solutions must be **persistent and resilient**
- Follow established patterns in the codebase
- Use existing component library (Tailwind + shadcn patterns)

### 2. SECRETS MANAGEMENT
- **NEVER hardcode secrets** anywhere
- Use GCP Secret Manager via `gcp-secrets.ts` utility
- Load with `source ./scripts/sync-gcp-secrets.sh [instance]`

### 3. SINGLE SOURCE OF TRUTH
- **`config/federation-registry.json`** is the SSOT for federation config
- **`docs/RESOURCES-PAGE-UX-AUDIT.md`** is the SSOT for UX implementation

### 4. TESTING REQUIREMENTS
- OPA: 106+ tests must pass after any policy change
- Frontend: TypeScript must compile without errors (`npm run build`)
- Backend: Integration tests for new endpoints
- E2E: Browser-based verification for UI changes

### 5. PERFORMANCE TARGETS
- Search response time: <200ms
- Filter response time: <100ms
- Keyboard navigation: <50ms per keystroke
- Modal open: <100ms

---

## 🔐 Available Tools & Permissions

### CLI Access

| Tool | Status | Purpose |
|------|--------|---------|
| **GitHub CLI** (`gh`) | ✅ Available | PR creation, issue management |
| **GCP CLI** (`gcloud`) | ✅ Available | Secret Manager, new project creation |
| **Cloudflare CLI** (`cloudflared`) | ✅ Available | Tunnel management |
| **Terraform** | ✅ Available | Keycloak IaC |
| **Docker Compose** | ✅ Available | Container orchestration |
| **SSH** | ✅ Available | Remote DEU deployment |

### MCP Servers

| Server | Status | Purpose |
|--------|--------|---------|
| **Keycloak Docs MCP** | ✅ Available | Keycloak Admin REST API documentation |
| **Browser MCP** | ✅ Available | Live testing via Playwright |

### GCP Project

- **Current Project:** `dive25`
- **Permission:** Full admin access to create new projects if needed
- **Secrets:** 40+ secrets configured for all instances

---

## 🚀 Recommended Starting Commands

```bash
# 1. Navigate to project
cd /Users/aubreybeach/Documents/GitHub/DIVE-V3/DIVE-V3

# 2. Check current service status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep dive

# 3. Load USA secrets
source ./scripts/sync-gcp-secrets.sh

# 4. Verify frontend builds
cd frontend && npm run build

# 5. Run OPA tests
cd policies && ../bin/opa test fuel_inventory_abac_policy.rego tests/fuel_inventory_test.rego tests/aal_enforcement_test.rego tests/industry_access_test.rego -v

# 6. Test search in browser
# Open https://usa-app.dive25.com/resources
# Press "/" to open document search
```

---

## 📋 Recommended Implementation Order

1. **Phase 3.1: Keyboard Navigation** - Foundation for all power user features
2. **Phase 3.3: Quick Preview Modal** - Depends on keyboard navigation
3. **Phase 3.2: Bulk Selection UI** - Required for export and comparison
4. **Phase 3.4: Export Functionality** - Uses bulk selection
5. **Phase 3.5: Comparison View** - Uses bulk selection
6. **Phase 3.6: Bookmark/Favorites** - Independent feature
7. **Phase 3.7: Column Customizer** - Enhancement for list view

---

## 📝 Expected Deliverables

1. **Phased implementation plan** with clear milestones
2. **SMART objectives** with measurable success criteria per task
3. **Extensive test suites** (OPA, E2E Playwright, integration)
4. **Component documentation** with TypeScript interfaces
5. **Performance benchmarks** before/after each feature

---

## 🔄 Session Handoff Context

**Previous session completed:**
1. ✅ Phase 1: Performance Foundation (100%)
2. ✅ Phase 2: Search Enhancement (80% - analytics integrated)
3. ✅ MongoDB text indexes on all 4 instances
4. ✅ Search analytics tracking client + backend
5. ✅ "/" keyboard shortcut for document search

**This session should:**
1. Verify Phase 2 deferred items (facet integration, date picker)
2. Begin Phase 3: Power User Features
3. Focus on keyboard navigation and quick preview first
4. Maintain 100% test coverage for new features

---

*Document created: December 1, 2025*
*Reference: `docs/RESOURCES-PAGE-UX-AUDIT.md`*





