# Resources Page Performance Audit

## Overview
This document provides a comprehensive performance audit checklist for the `/resources` page based on the UX audit specification targets. Run these tests with the frontend running at `http://localhost:3000`.

## Target Metrics (From Spec)

| Metric | Target | Priority |
|--------|--------|----------|
| First Contentful Paint (FCP) | < 1.5s | P1 |
| Time to Interactive (TTI) | < 3.0s | P1 |
| Search Response Time | < 200ms | P1 |
| Filter Response Time | < 100ms | P1 |
| Memory Usage (100 items) | < 50MB | P2 |
| Bundle Size (Main JS) | < 200KB gzipped | P2 |

---

## 1. Lighthouse Audit

### How to Run
```bash
# Using Chrome DevTools
1. Navigate to http://localhost:3000/resources
2. Open DevTools (F12)
3. Go to "Lighthouse" tab
4. Select: Performance, Accessibility, Best Practices, SEO
5. Click "Analyze page load"

# Using CLI (requires lighthouse npm package)
npx lighthouse http://localhost:3000/resources --output html --output-path ./lighthouse-report.html
```

### Expected Scores
| Category | Target Score |
|----------|-------------|
| Performance | ≥ 90 |
| Accessibility | ≥ 90 |
| Best Practices | ≥ 90 |
| SEO | ≥ 85 |

### Key Opportunities to Check
- [ ] **LCP (Largest Contentful Paint)**: BentoDashboard or first resource card
- [ ] **CLS (Cumulative Layout Shift)**: Should be < 0.1
- [ ] **FID (First Input Delay)**: Should be < 100ms
- [ ] **Total Blocking Time**: Should be < 200ms

---

## 2. Network Performance

### API Response Times
| Endpoint | Method | Target | Test Query |
|----------|--------|--------|------------|
| `/api/resources/search` | POST | < 200ms | `{ "limit": 20, "includeFacets": true }` |
| `/api/resources/search` | POST | < 300ms | `{ "query": "fuel", "limit": 50 }` |
| `/api/resources/facets` | GET | < 100ms | N/A |

### How to Measure
```javascript
// In browser console
performance.mark('api-start');
fetch('/api/resources/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 20, includeFacets: true })
}).then(() => {
  performance.mark('api-end');
  performance.measure('API Time', 'api-start', 'api-end');
  console.log(performance.getEntriesByName('API Time')[0].duration);
});
```

### Waterfall Analysis
- [ ] No blocking CSS/JS
- [ ] Images lazy-loaded
- [ ] API calls parallelized where possible
- [ ] WebSocket or SSE for real-time updates (if implemented)

---

## 3. JavaScript Bundle Analysis

### Bundle Size Check
```bash
# From frontend directory
npm run build
# Check .next/static/chunks folder sizes

# Using webpack-bundle-analyzer
npx @next/bundle-analyzer@latest analyze
```

### Target Bundle Sizes
| Chunk | Max Size (gzipped) |
|-------|-------------------|
| Main framework | 100KB |
| Page chunks | 50KB each |
| Shared chunks | 30KB |
| Total initial load | 200KB |

### Heavy Dependencies to Monitor
- [ ] `framer-motion` - Consider dynamic import
- [ ] `recharts` - Load on demand
- [ ] `reactflow` - Only on pages that need it
- [ ] `fuse.js` - Consider web worker

---

## 4. Runtime Performance

### Memory Profile
```javascript
// In browser console
console.log('Heap:', performance.memory.usedJSHeapSize / 1024 / 1024, 'MB');

// After loading 100 resources
// Target: < 50MB

// After scrolling through 500 resources
// Target: < 100MB (virtualization should keep it stable)
```

### Long Tasks Detection
```javascript
// Monitor long tasks (> 50ms)
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log('Long Task:', entry.duration, 'ms');
  }
});
observer.observe({ entryTypes: ['longtask'] });
```

### Component Render Times
Use React DevTools Profiler:
1. Open React DevTools
2. Go to "Profiler" tab
3. Click "Record"
4. Perform actions (search, filter, scroll)
5. Stop recording
6. Check flame graph for slow renders

**Target**: No component render > 16ms (60fps)

---

## 5. Virtualization Effectiveness

### Test Cases
1. **Load 1000 resources**
   - DOM node count should stay < 100
   - Scroll should be 60fps smooth
   
2. **Rapid scrolling**
   - No jank or flickering
   - Content should load within 100ms of stopping
   
3. **Memory stability**
   - After scrolling through entire list, memory should not exceed 2x initial

### How to Verify
```javascript
// Check DOM nodes
document.querySelectorAll('[data-resource-card]').length
// Should be ~20-30, not 1000

// Check scroll performance
let lastTime = performance.now();
let frames = 0;
function measureFPS() {
  const now = performance.now();
  frames++;
  if (now - lastTime >= 1000) {
    console.log('FPS:', frames);
    frames = 0;
    lastTime = now;
  }
  requestAnimationFrame(measureFPS);
}
measureFPS();
// Scroll and verify FPS stays > 55
```

---

## 6. Search & Filter Performance

### Search Debouncing
- [ ] Verify 300ms debounce on search input
- [ ] Request cancellation when typing continues
- [ ] No duplicate requests

### Filter Response
- [ ] Filter change triggers single request
- [ ] Facet counts update correctly
- [ ] Loading overlay shown during filter transition

### Test Script
```javascript
// Measure search performance
const searchInput = document.querySelector('[data-testid="search-input"]');
const start = performance.now();
searchInput.value = 'fuel';
searchInput.dispatchEvent(new Event('input', { bubbles: true }));

// Wait for results (check network tab)
// Target: Results visible within 500ms of last keystroke
```

---

## 7. Image & Asset Optimization

### Checklist
- [ ] All images use Next.js `<Image>` component
- [ ] Images lazy-loaded below fold
- [ ] SVG icons properly optimized
- [ ] No render-blocking fonts
- [ ] Fonts preloaded in `<head>`

### Font Loading
```html
<!-- Should see in page source -->
<link rel="preload" href="/fonts/..." as="font" type="font/woff2" crossorigin>
```

---

## 8. Caching Strategy

### API Response Caching
- [ ] `/api/resources/search` cached for 60s (with query params)
- [ ] `/api/resources/facets` cached for 5 minutes
- [ ] ETag/Last-Modified headers present

### Browser Caching
- [ ] Static assets have long cache expiry
- [ ] Cache-busting via content hash
- [ ] Service worker caching (if implemented)

### Check Headers
```bash
curl -I http://localhost:3000/api/resources/facets
# Should see: Cache-Control, ETag, or Last-Modified
```

---

## 9. Error State Performance

### Network Errors
- [ ] Error state renders quickly (< 100ms)
- [ ] Retry button functional
- [ ] No memory leaks from failed requests

### Empty States
- [ ] Empty search results render in < 100ms
- [ ] Filter-no-match state renders correctly
- [ ] Illustrations load without layout shift

---

## 10. Mobile Performance

### Test on Mobile (or DevTools simulation)
- [ ] Touch scroll smooth (60fps)
- [ ] Bottom sheet filters performant
- [ ] No horizontal overflow
- [ ] Images appropriately sized

### Device Emulation Settings
- Moto G Power (mid-range)
- Slow 3G network
- Target: TTI < 5s on slow device

---

## Performance Regression Prevention

### CI/CD Checks
1. Bundle size gate (fail if > 250KB gzipped)
2. Lighthouse CI (fail if performance < 85)
3. Core Web Vitals monitoring

### Monitoring Setup
```javascript
// web-vitals integration
import { getCLS, getFID, getLCP } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getLCP(console.log);
```

---

## Audit Results Template

```
Date: [DATE]
Tester: [NAME]
Environment: [DEV/STAGING/PROD]
Browser: [Chrome/Firefox/Safari version]

## Lighthouse Scores
- Performance: [X]/100
- Accessibility: [X]/100
- Best Practices: [X]/100
- SEO: [X]/100

## Core Web Vitals
- LCP: [X]s (Target: < 2.5s)
- FID: [X]ms (Target: < 100ms)
- CLS: [X] (Target: < 0.1)

## API Response Times
- Search (20 items): [X]ms
- Search (50 items): [X]ms
- Facets: [X]ms

## Bundle Sizes
- Main: [X]KB
- Page: [X]KB
- Total initial: [X]KB

## Memory Usage
- Initial load: [X]MB
- After 100 items: [X]MB
- After 500 items: [X]MB

## Issues Found
1. [Issue description]
   - Severity: [High/Medium/Low]
   - Location: [Component/File]
   - Recommendation: [Fix]

## Pass/Fail Summary
- [ ] FCP < 1.5s
- [ ] TTI < 3.0s
- [ ] Search < 200ms
- [ ] Filter < 100ms
- [ ] Memory < 50MB
- [ ] Bundle < 200KB
```

---

## Next Steps

1. **Run Lighthouse** - Baseline current performance
2. **Profile Components** - Identify slow renders
3. **Analyze Bundle** - Find optimization opportunities
4. **Test Virtualization** - Verify with large datasets
5. **Mobile Testing** - Ensure mobile performance targets met



