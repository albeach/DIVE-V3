# Testing Guide - Resources Page 2025 Revamp

## 🧪 Manual Testing Checklist

### 1. Basic Functionality
- [ ] Page loads without errors
- [ ] All documents are displayed
- [ ] User security level card shows correct clearance, country, and COI
- [ ] Document count badge shows correct total

### 2. Advanced Search
- [ ] Search bar is visible and accessible
- [ ] Typing in search shows autocomplete suggestions
- [ ] Suggestions appear for:
  - [ ] Document titles
  - [ ] Resource IDs
  - [ ] Classifications
  - [ ] Countries
  - [ ] COI tags
- [ ] Recent searches are saved (check after reload)
- [ ] Keyboard navigation works (↑↓ arrow keys, Enter, Escape)
- [ ] Clicking a suggestion applies the search
- [ ] Clear button (X) clears the search

### 3. Category Browser
- [ ] "Browse Categories" button toggles the panel
- [ ] Panel shows classification distribution with bar charts
- [ ] Panel shows top countries with counts
- [ ] Panel shows COI breakdown
- [ ] Panel shows encryption status
- [ ] Clicking any category filters the results
- [ ] Percentages are calculated correctly
- [ ] Hover effects work on category bars

### 4. View Modes
- [ ] Grid view displays cards in 3 columns (desktop)
- [ ] List view displays horizontal cards
- [ ] Compact view displays minimal rows
- [ ] View mode persists after page reload
- [ ] View mode switcher buttons show active state
- [ ] All metadata displays correctly in each view mode

### 5. Filters
- [ ] Classification filters work (multi-select)
- [ ] Country filters work (multi-select)
- [ ] COI filters work (multi-select)
- [ ] Encryption status filter works
- [ ] Quick filters work:
  - [ ] "All" clears filters
  - [ ] "My Country" filters to user's country
  - [ ] "My Clearance" filters to accessible classifications
  - [ ] "FVEY" filters to FVEY COI
  - [ ] Lock icon filters to encrypted docs
- [ ] Active filter chips display correctly
- [ ] Clicking X on chip removes that filter
- [ ] "Clear" button removes all filters
- [ ] Filter count badges show correct numbers
- [ ] URL updates with filter params
- [ ] Filters persist when navigating back

### 6. Saved Filters
- [ ] "Saved Filters" panel is collapsible
- [ ] Quick filter presets are available:
  - [ ] SECRET+ & Encrypted
  - [ ] FVEY Documents
  - [ ] UNCLASSIFIED
  - [ ] Recent SECRET
- [ ] Clicking preset applies filters instantly
- [ ] "Save Current Filters" button appears
- [ ] Saving a filter prompts for name
- [ ] Named filter is saved to localStorage
- [ ] Saved filters persist after page reload
- [ ] Saved filters can be applied
- [ ] Saved filters can be deleted
- [ ] Maximum 10 custom filters enforced

### 7. Sorting
- [ ] Sort dropdown shows all options:
  - [ ] Title (A-Z)
  - [ ] Title (Z-A)
  - [ ] Newest First
  - [ ] Oldest First
  - [ ] Highest Classification
  - [ ] Lowest Classification
- [ ] Sorting works correctly for each option
- [ ] Results count updates when sorting

### 8. Pagination
- [ ] Pagination controls are visible
- [ ] Page numbers are clickable
- [ ] "Previous" and "Next" buttons work
- [ ] "Items per page" dropdown works (10, 25, 50, 100)
- [ ] Changing page size resets to page 1
- [ ] Current page is highlighted
- [ ] Page numbers show "..." for large ranges

### 9. Resource Cards
- [ ] Each card displays:
  - [ ] Classification badge with emoji
  - [ ] Title (truncated if too long)
  - [ ] Resource ID
  - [ ] Releasability countries (expandable)
  - [ ] COI tags (if present)
  - [ ] Creation date (if present)
  - [ ] Encryption badge (if encrypted)
  - [ ] Access indicator (Likely/Possible/Unlikely)
- [ ] Hover effects work (shadow, border, translate)
- [ ] Clicking card navigates to detail page
- [ ] Arrow icon animates on hover

### 10. Empty States
- [ ] No results message shows when filters return nothing
- [ ] "Clear All Filters" button appears in empty state
- [ ] Button clears all filters when clicked
- [ ] Empty state is styled attractively

### 11. Loading States
- [ ] Loading spinner shows on initial load
- [ ] Loading message is clear
- [ ] Page doesn't flash or jump when loading completes

### 12. Error States
- [ ] Error message displays if API call fails
- [ ] Error is styled clearly with red background
- [ ] Error icon is visible

---

## 📱 Responsive Testing

### Mobile (< 640px)
- [ ] Single column layout
- [ ] Search bar is full width
- [ ] View mode switcher shows icons only
- [ ] Sidebar becomes full width
- [ ] Cards stack vertically
- [ ] Touch targets are at least 44px
- [ ] Compact view is usable
- [ ] Category browser is collapsible
- [ ] Results count moves below toolbar

### Tablet (640px - 1024px)
- [ ] Two-column layout works
- [ ] Sidebar width is appropriate
- [ ] Cards display 2 per row in grid mode
- [ ] List view is comfortable
- [ ] All controls are accessible

### Desktop (> 1024px)
- [ ] Three-column layout in grid mode
- [ ] Sidebar is sticky
- [ ] Full metadata is visible
- [ ] Hover effects are smooth
- [ ] Everything is properly spaced

---

## ⌨️ Keyboard Navigation

- [ ] Tab key navigates through all interactive elements
- [ ] Enter key activates buttons and links
- [ ] Space key toggles checkboxes
- [ ] Arrow keys work in search suggestions
- [ ] Escape key closes dropdowns
- [ ] Focus indicators are visible
- [ ] No keyboard traps

---

## 🎨 Visual Testing

### Colors
- [ ] All colors meet WCAG AA contrast requirements
- [ ] Classification colors are distinct
- [ ] Hover states are noticeable
- [ ] Active states are clear

### Typography
- [ ] All text is readable
- [ ] Hierarchy is clear
- [ ] Monospace used appropriately for IDs
- [ ] No text overflow issues

### Spacing
- [ ] Padding is consistent
- [ ] Gaps are appropriate
- [ ] No elements touching
- [ ] Alignment is correct

### Animations
- [ ] Animations are smooth (60fps)
- [ ] No jarring transitions
- [ ] Hover effects feel responsive
- [ ] Loading animations are subtle

---

## 🚀 Performance Testing

- [ ] Page loads in < 2 seconds
- [ ] Search suggestions appear instantly
- [ ] Filtering is immediate
- [ ] No lag when scrolling
- [ ] View mode switch is instant
- [ ] LocalStorage operations are fast

---

## ♿ Accessibility Testing

- [ ] All images have alt text
- [ ] All buttons have accessible names
- [ ] Form inputs have labels
- [ ] ARIA labels are present where needed
- [ ] Screen reader can navigate the page
- [ ] Focus order is logical
- [ ] Color is not the only indicator

---

## 🔍 Browser Testing

Test in the following browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## 🐛 Known Issues to Test

1. **LocalStorage Issues**
   - [ ] Test in private/incognito mode
   - [ ] Test with LocalStorage disabled
   - [ ] Verify graceful fallback

2. **Long Content**
   - [ ] Test with very long document titles
   - [ ] Test with many countries (10+)
   - [ ] Test with many COI tags
   - [ ] Verify truncation and "show more"

3. **Edge Cases**
   - [ ] Test with 0 documents
   - [ ] Test with 1 document
   - [ ] Test with 1000+ documents
   - [ ] Test with no user attributes
   - [ ] Test with all filters active

4. **Network Issues**
   - [ ] Test with slow network (3G)
   - [ ] Test with offline mode
   - [ ] Test with API timeout

---

## 📊 Test Data Requirements

Ensure test database has:
- [ ] Documents at all classification levels
- [ ] Documents from multiple countries
- [ ] Documents with various COI tags
- [ ] Both encrypted and unencrypted documents
- [ ] Documents with recent and old creation dates
- [ ] Documents with long and short titles

---

## ✅ Acceptance Criteria

The revamp is successful if:
1. ✅ All manual tests pass
2. ✅ No console errors or warnings
3. ✅ No linter errors
4. ✅ Responsive on all screen sizes
5. ✅ Keyboard navigation works fully
6. ✅ Performance is acceptable
7. ✅ Accessibility standards met
8. ✅ User feedback is positive

---

## 🎯 User Acceptance Testing

Ask users to:
1. Find a specific document by title
2. Find all SECRET documents they can access
3. Find all FVEY documents
4. Save a custom filter for future use
5. Switch between view modes
6. Use the category browser
7. Rate the overall experience (1-10)

Target scores:
- Task success rate: > 90%
- User satisfaction: > 8/10
- Time to find document: < 30 seconds

---

## 📝 Regression Testing

After any changes, verify:
- [ ] Existing features still work
- [ ] No new console errors
- [ ] Performance hasn't degraded
- [ ] Accessibility hasn't regressed
- [ ] Mobile experience is unchanged
- [ ] All saved data is preserved

---

## 🔄 Continuous Testing

Set up automated tests for:
- Component rendering
- User interactions
- Filter logic
- Search suggestions
- LocalStorage operations
- Accessibility checks

Use:
- Jest for unit tests
- React Testing Library for component tests
- Playwright for E2E tests
- axe-core for accessibility tests

---

## 📞 Reporting Issues

When reporting issues, include:
1. Browser and version
2. Screen size
3. User attributes (clearance, country, COI)
4. Steps to reproduce
5. Expected vs actual behavior
6. Screenshots or video
7. Console errors (if any)

---

## ✨ Success Metrics

Track:
- Time to find documents (should decrease)
- Number of filter combinations used (should increase)
- Number of saved filters created (indicator of usefulness)
- Search usage frequency (should increase)
- View mode preferences (understand user workflows)
- Category browser usage (validate feature value)

Goal: 30% improvement in document discovery time compared to old interface.

