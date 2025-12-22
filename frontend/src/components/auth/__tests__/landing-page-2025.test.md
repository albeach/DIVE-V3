# Landing Page 2025 Redesign - Testing Checklist

## Visual Regression Testing

### Desktop (1920x1080)
- [ ] Hero section renders with cleaner background (reduced opacity)
- [ ] Federation badge shows "🌐 LIVE: 32 Coalition Partners" with pulse animation
- [ ] Direct login button displays prominently with instance flag
- [ ] Smart suggestions show 1-3 cards (geo, recent, alliance)
- [ ] Search bar renders with glassmorphism effect
- [ ] Regional filter pills display horizontally with counts
- [ ] IdP grid shows 6 columns with 3D card effects
- [ ] Feature carousel displays 3 columns in desktop view
- [ ] Footer shows dynamic partner count

### Tablet (768x1024)
- [ ] Hero section scales appropriately
- [ ] Direct login button remains prominent
- [ ] Smart suggestions display in 3-column grid
- [ ] IdP grid shows 4 columns
- [ ] Filter pills wrap to 2 rows if needed
- [ ] Feature carousel maintains 3 columns

### Mobile (375x667)
- [ ] Hero section is responsive and centered
- [ ] Direct login button stacks vertically
- [ ] Smart suggestions stack vertically (1 column)
- [ ] Search bar is full width with sticky behavior
- [ ] Filter pills scroll horizontally
- [ ] IdP grid shows 2 columns
- [ ] Feature carousel becomes swipeable
- [ ] Swipe hint appears at bottom of carousel

## Responsive Design Testing

### Breakpoints
- [ ] 320px: Minimum mobile width
- [ ] 375px: Standard mobile (iPhone SE)
- [ ] 768px: Tablet portrait
- [ ] 1024px: Tablet landscape
- [ ] 1920px: Desktop
- [ ] 2560px: Large desktop

### Dynamic Content
- [ ] 5 IdPs: Grid adjusts to show all in 1-2 rows
- [ ] 15 IdPs: Grid shows multiple rows, search becomes useful
- [ ] 32 IdPs: Full NATO grid, filters become essential
- [ ] 0 IdPs (error state): Shows retry button
- [ ] Loading state: Shows spinner animation

## Accessibility Testing

### Keyboard Navigation
- [ ] Tab navigates through all interactive elements
- [ ] Direct login button is focusable
- [ ] Smart suggestion cards are keyboard accessible
- [ ] Search bar can be focused with "/" key
- [ ] Arrow keys navigate autocomplete dropdown
- [ ] Enter selects highlighted autocomplete item
- [ ] Escape closes autocomplete dropdown
- [ ] Filter pills are keyboard navigable
- [ ] IdP cards are keyboard accessible
- [ ] Focus indicators are visible (blue ring)

### Screen Reader Support
- [ ] Hero section announces "DIVE V3 Landing Page"
- [ ] Federation badge announces "Live: 32 Coalition Partners"
- [ ] Direct login button announces "Login as [Country] User"
- [ ] Smart suggestions announce type (geo/recent/alliance)
- [ ] Search bar has aria-label "Search identity providers"
- [ ] Autocomplete has aria-autocomplete="list"
- [ ] Filter pills announce counts "FVEY (5)"
- [ ] IdP cards announce status "[Country], Online, Click to authenticate"
- [ ] Feature cards announce titles and descriptions

### ARIA Labels
- [ ] Search input: `aria-label="Search identity providers"`
- [ ] Autocomplete dropdown: `aria-controls="idp-autocomplete-list"`
- [ ] Filter pills: `aria-pressed` for active state
- [ ] IdP cards: Proper button semantics
- [ ] Status indicators: `title` attribute for tooltip

### Color Contrast (WCAG AA)
- [ ] Hero title white on dark gradient: >= 4.5:1
- [ ] Search placeholder text: >= 4.5:1
- [ ] Filter pill text: >= 4.5:1
- [ ] IdP card text on white: >= 4.5:1
- [ ] Status indicators distinguishable without color (icons)

## Functional Testing

### Search Functionality
- [ ] Typing filters IdPs in real-time
- [ ] Fuzzy matching works ("germ" finds "Germany")
- [ ] Case-insensitive search
- [ ] Clears results when search is cleared
- [ ] Shows "No partners found" for invalid queries
- [ ] Autocomplete shows up to 8 results
- [ ] Clicking autocomplete result triggers authentication

### Regional Filters
- [ ] "All Partners" shows all 32 countries
- [ ] "Five Eyes" shows USA, GBR, CAN, AUS, NZL (5)
- [ ] "European Union" shows EU members
- [ ] "NATO Core" shows original members
- [ ] "Baltics" shows EST, LVA, LTU (3)
- [ ] "Mediterranean" shows southern partners
- [ ] "Nordic" shows northern partners
- [ ] Filter count badges update dynamically
- [ ] Active filter has gradient background
- [ ] Clicking same filter deselects it

### Smart Suggestions
- [ ] Geo-detection works based on browser locale
- [ ] Recent IdP loads from localStorage
- [ ] Alliance suggestion appears for FVEY/NATO core
- [ ] Suggestions don't duplicate (geo != recent)
- [ ] Clicking suggestion triggers authentication
- [ ] Section hides if no suggestions available

### IdP Card Interactions
- [ ] Hover shows 3D lift effect
- [ ] Flag scales and rotates on hover
- [ ] Status badge appears (Online/Degraded/Offline)
- [ ] Protocol badge highlights on hover
- [ ] Action hint appears on hover
- [ ] Clicking card triggers authentication
- [ ] Recent IdP is saved to localStorage

### Status Health Checks
- [ ] Health check runs on component mount
- [ ] All IdPs start with "Checking" status
- [ ] Status updates after health check completes
- [ ] Green pulse for "Online" status
- [ ] Yellow badge for "Degraded" status
- [ ] Red badge for "Offline" status
- [ ] Offline IdPs show grayscale flag

### Error Handling
- [ ] Network timeout shows error message
- [ ] Retry button fetches IdPs again
- [ ] Fallback IdPs load if API fails
- [ ] Error boundary catches component errors

## Animation Testing

### Performance
- [ ] Animations run at 60fps on desktop
- [ ] Animations run at 30fps+ on mobile
- [ ] No janky transitions or dropped frames
- [ ] GPU-accelerated transforms used
- [ ] Staggered animations don't block rendering

### Timing
- [ ] Hero fade-in: 0.1s delay
- [ ] Direct login: 0.1s delay
- [ ] Smart suggestions: 0.3s delay
- [ ] Search bar: 0.4s delay
- [ ] Filters: 0.5s delay
- [ ] IdP cards: Staggered 0.03s per card
- [ ] Feature carousel: 0.8s delay

### Micro-interactions
- [ ] Filter pill hover: Scale 1.02
- [ ] IdP card hover: Lift -8px
- [ ] Search bar focus: Glow effect
- [ ] Button hover: Shadow increase
- [ ] Easter egg animations: Terminal typing effect

## Cross-Browser Testing

### Chrome (Latest)
- [ ] All features work
- [ ] Animations smooth
- [ ] Glassmorphism renders correctly
- [ ] Grid layout correct

### Firefox (Latest)
- [ ] All features work
- [ ] Backdrop-filter fallback works
- [ ] Grid layout correct

### Safari (Latest)
- [ ] All features work
- [ ] -webkit-backdrop-filter renders
- [ ] Grid layout correct
- [ ] Touch events work on iOS

### Edge (Latest)
- [ ] All features work
- [ ] Animations smooth
- [ ] Grid layout correct

## Integration Testing

### Authentication Flow
- [ ] Direct login redirects to Keycloak
- [ ] Federated login sets kc_idp_hint
- [ ] Recent IdP saves to localStorage
- [ ] Easter egg admin login works

### API Integration
- [ ] `/api/idps/public` endpoint called on mount
- [ ] Health check endpoints called for each IdP
- [ ] Timeout handling works (5s limit)
- [ ] Error responses handled gracefully

## Performance Benchmarks

### Lighthouse Scores (Target)
- [ ] Performance: >= 90
- [ ] Accessibility: >= 95
- [ ] Best Practices: >= 90
- [ ] SEO: >= 90

### Metrics
- [ ] First Contentful Paint: < 1.5s
- [ ] Largest Contentful Paint: < 2.5s
- [ ] Time to Interactive: < 3.0s
- [ ] Cumulative Layout Shift: < 0.1
- [ ] Total Blocking Time: < 200ms

### Bundle Size
- [ ] New components add < 50KB gzipped
- [ ] No duplicate dependencies
- [ ] Tree-shaking works for unused code

## Edge Cases

### Data Scenarios
- [ ] 0 IdPs: Shows error state
- [ ] 1 IdP: Grid shows single card centered
- [ ] 5 IdPs: Grid shows 1-2 rows
- [ ] 32 IdPs: Full grid with all NATO countries
- [ ] 100+ IdPs: Grid handles overflow (future-proof)

### Network Scenarios
- [ ] Slow 3G: Loading spinner shows, then content
- [ ] Offline: Error message with retry
- [ ] Timeout: Fallback IdPs load
- [ ] Intermittent: Health checks retry

### User Scenarios
- [ ] First visit: No recent IdP, geo-detection works
- [ ] Return visit: Recent IdP shows in suggestions
- [ ] Different locale: Geo-detection updates
- [ ] VPN user: Geo-detection may be incorrect but harmless

## Regression Testing

### Existing Functionality
- [ ] Easter egg still accessible (Konami code, Ctrl+Shift+A)
- [ ] Easter egg terminal animation works
- [ ] Direct login to broker realm works
- [ ] Federation with kc_idp_hint works
- [ ] NextAuth integration unbroken

### Backwards Compatibility
- [ ] Old bookmarks still work
- [ ] Existing localStorage data compatible
- [ ] API contracts unchanged

## Security Testing

### Input Validation
- [ ] Search input sanitized (no XSS)
- [ ] No SQL injection vectors
- [ ] CSRF tokens present (NextAuth handles)

### Content Security Policy
- [ ] No inline scripts
- [ ] All flags are local SVGs (no external CDN)
- [ ] Glassmorphism uses pure CSS
- [ ] No eval() or similar unsafe patterns

## Documentation

### Code Comments
- [ ] All components have JSDoc comments
- [ ] Complex logic explained
- [ ] Accessibility notes included

### User Documentation
- [ ] Keyboard shortcuts documented
- [ ] Filter descriptions clear
- [ ] Error messages helpful

## Sign-off Checklist

- [ ] All visual regression tests pass
- [ ] All responsive design tests pass
- [ ] All accessibility tests pass
- [ ] All functional tests pass
- [ ] All animation tests pass
- [ ] All cross-browser tests pass
- [ ] All integration tests pass
- [ ] Performance benchmarks met
- [ ] All edge cases handled
- [ ] No regressions detected
- [ ] Security review complete
- [ ] Documentation complete

---

**Testing Complete:** ⬜ Pending
**Approved By:** _____________
**Date:** _____________


