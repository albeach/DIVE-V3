# Resources Page WCAG 2.1 AA Accessibility Audit

## Overview
This document provides a comprehensive accessibility audit checklist for the `/resources` page, aligned with WCAG 2.1 Level AA success criteria. Target: ≥ 90 accessibility score.

---

## Audit Status: Implemented Features

### Already Implemented ✅
| Feature | Component | Status |
|---------|-----------|--------|
| Skip Links | `SkipLinks.tsx` | ✅ Implemented |
| Live Regions | `LiveRegion.tsx` | ✅ Implemented |
| Focus Management | `useKeyboardNavigation.tsx` | ✅ Implemented |
| Screen Reader Announcements | Various | ✅ Implemented |
| Keyboard Navigation | j/k, Space, Enter | ✅ Implemented |

### Needs Verification 🔍
| Feature | Component | Status |
|---------|-----------|--------|
| Color Contrast | All components | 🔍 Needs testing |
| Focus Indicators | All interactive | 🔍 Needs testing |
| ARIA Labels | Buttons, inputs | 🔍 Needs testing |
| Touch Targets | Mobile | 🔍 Needs testing |

---

## WCAG 2.1 Criteria Checklist

### 1. Perceivable

#### 1.1 Text Alternatives (Level A)
- [ ] **1.1.1** All images have `alt` text
- [ ] Non-decorative icons have `aria-label`
- [ ] Classification badges have text alternatives
- [ ] Encrypted lock icons have accessible names

**Test Method:**
```javascript
// Check for missing alt text
document.querySelectorAll('img:not([alt])').length === 0

// Check icon buttons
document.querySelectorAll('button svg').forEach(svg => {
  const btn = svg.closest('button');
  console.log(btn.getAttribute('aria-label') || btn.textContent);
});
```

#### 1.3 Adaptable (Level A)
- [ ] **1.3.1** Info and Relationships - Proper semantic HTML
  - [ ] Headings (`h1-h6`) used correctly
  - [ ] Lists use `ul`, `ol`, `li`
  - [ ] Tables have headers
  - [ ] Forms have labels
- [ ] **1.3.2** Meaningful Sequence - Reading order logical
- [ ] **1.3.3** Sensory Characteristics - Not rely on color/shape alone

#### 1.4 Distinguishable (Level AA)
- [ ] **1.4.1** Use of Color - Not sole means of conveying info
  - [ ] Classification badges have text + color
  - [ ] Encrypted status has icon + text
- [ ] **1.4.3** Contrast (Minimum) - 4.5:1 for text
  - [ ] UNCLASSIFIED (green on dark): ≥ 4.5:1
  - [ ] CONFIDENTIAL (blue on dark): ≥ 4.5:1
  - [ ] SECRET (red on dark): ≥ 4.5:1
  - [ ] TOP_SECRET (orange on dark): ≥ 4.5:1
- [ ] **1.4.4** Resize Text - Up to 200% without loss
- [ ] **1.4.10** Reflow - Content at 320px width
- [ ] **1.4.11** Non-text Contrast - 3:1 for UI components
- [ ] **1.4.12** Text Spacing - Adjust without loss

**Contrast Test Tool:**
```bash
# Browser extension: "Axe DevTools" or "WAVE"
# Or use Chrome DevTools color picker which shows contrast ratio
```

---

### 2. Operable

#### 2.1 Keyboard Accessible (Level A)
- [ ] **2.1.1** Keyboard - All functionality via keyboard
  - [ ] Tab navigates through interactive elements
  - [ ] Enter/Space activates buttons
  - [ ] Arrow keys navigate lists
  - [ ] Escape closes modals/dropdowns
- [ ] **2.1.2** No Keyboard Trap - Can navigate away
- [ ] **2.1.4** Character Key Shortcuts (Level A)
  - [ ] j/k navigation documented
  - [ ] Can be disabled or remapped

**Keyboard Test Script:**
```
1. Tab through entire page
2. Verify focus visible at all times
3. Test j/k navigation in resource list
4. Test Space for preview
5. Test Enter for select
6. Test / for search
7. Test b for bookmarks
8. Test Escape to close modals
```

#### 2.4 Navigable (Level AA)
- [ ] **2.4.1** Bypass Blocks - Skip links work
  - [ ] "Skip to main content" visible on focus
  - [ ] Links to: #main-content, #search, #navigation
- [ ] **2.4.2** Page Titled - Descriptive `<title>`
- [ ] **2.4.3** Focus Order - Logical sequence
- [ ] **2.4.4** Link Purpose - Clear from context
- [ ] **2.4.5** Multiple Ways - Search + filters + browse
- [ ] **2.4.6** Headings and Labels - Descriptive
- [ ] **2.4.7** Focus Visible - Clear focus indicator
  - [ ] Minimum 2px outline
  - [ ] Sufficient contrast (3:1)

**Skip Links Test:**
```javascript
// Load page, immediately press Tab
// First focused element should be skip link
```

#### 2.5 Input Modalities (Level A/AA)
- [ ] **2.5.1** Pointer Gestures - Single pointer works
- [ ] **2.5.2** Pointer Cancellation - Can cancel actions
- [ ] **2.5.3** Label in Name - Visible label in accessible name
- [ ] **2.5.4** Motion Actuation - No motion-only actions

---

### 3. Understandable

#### 3.1 Readable (Level A)
- [ ] **3.1.1** Language of Page - `<html lang="en">`
- [ ] **3.1.2** Language of Parts (Level AA) - If multilingual

#### 3.2 Predictable (Level A/AA)
- [ ] **3.2.1** On Focus - No unexpected changes
- [ ] **3.2.2** On Input - No unexpected changes
- [ ] **3.2.3** Consistent Navigation (Level AA)
- [ ] **3.2.4** Consistent Identification (Level AA)

#### 3.3 Input Assistance (Level A/AA)
- [ ] **3.3.1** Error Identification - Errors clearly described
- [ ] **3.3.2** Labels or Instructions - Clear input guidance
- [ ] **3.3.3** Error Suggestion (Level AA)
- [ ] **3.3.4** Error Prevention (Level AA) - For legal/financial

---

### 4. Robust

#### 4.1 Compatible (Level A/AA)
- [ ] **4.1.1** Parsing - Valid HTML
- [ ] **4.1.2** Name, Role, Value - Custom controls accessible
  - [ ] `CommandPaletteSearch` has combobox role
  - [ ] `VirtualResourceList` has list/listitem roles
  - [ ] `FacetedFilters` has checkbox roles
  - [ ] `ResourcePreviewModal` has dialog role
- [ ] **4.1.3** Status Messages (Level AA)
  - [ ] Search results announced
  - [ ] Filter changes announced
  - [ ] Loading states announced

---

## Component-Specific Audit

### CommandPaletteSearch
| Criterion | Requirement | Status |
|-----------|-------------|--------|
| Role | `role="combobox"` | 🔍 |
| Expanded | `aria-expanded` | 🔍 |
| Controls | `aria-controls` | 🔍 |
| Autocomplete | `aria-autocomplete="list"` | 🔍 |
| Selected | `aria-activedescendant` | 🔍 |
| Listbox | Results have `role="listbox"` | 🔍 |
| Options | Items have `role="option"` | 🔍 |

```html
<!-- Expected structure -->
<input 
  role="combobox"
  aria-expanded="true"
  aria-controls="search-results"
  aria-autocomplete="list"
  aria-activedescendant="result-0"
>
<ul id="search-results" role="listbox">
  <li id="result-0" role="option" aria-selected="true">...</li>
</ul>
```

### VirtualResourceList
| Criterion | Requirement | Status |
|-----------|-------------|--------|
| Role | `role="list"` | 🔍 |
| Items | `role="listitem"` or article | 🔍 |
| Count | `aria-setsize` | 🔍 |
| Position | `aria-posinset` | 🔍 |
| Busy | `aria-busy` during load | 🔍 |

```html
<!-- Expected structure -->
<div role="list" aria-busy="false">
  <article 
    role="listitem"
    aria-setsize="150"
    aria-posinset="1"
    tabindex="0"
  >...</article>
</div>
```

### FacetedFilters
| Criterion | Requirement | Status |
|-----------|-------------|--------|
| Group | `role="group"` or fieldset | 🔍 |
| Legend | Each group labeled | 🔍 |
| Checkboxes | `role="checkbox"` | 🔍 |
| Checked | `aria-checked` | 🔍 |
| Disclosure | Collapsible sections | 🔍 |

```html
<!-- Expected structure -->
<fieldset>
  <legend>Classification</legend>
  <label>
    <input type="checkbox" aria-checked="true">
    SECRET (10)
  </label>
</fieldset>
```

### ResourcePreviewModal
| Criterion | Requirement | Status |
|-----------|-------------|--------|
| Role | `role="dialog"` | 🔍 |
| Modal | `aria-modal="true"` | 🔍 |
| Label | `aria-labelledby` | 🔍 |
| Close | Escape key closes | 🔍 |
| Focus trap | Focus stays in modal | 🔍 |
| Focus return | Returns focus on close | 🔍 |

### BentoDashboard
| Criterion | Requirement | Status |
|-----------|-------------|--------|
| Stats | Use `<dl>`, `<dt>`, `<dd>` | 🔍 |
| Labels | All stats labeled | 🔍 |
| Live | Counter changes announced | 🔍 |

---

## Screen Reader Testing

### Test with VoiceOver (macOS)
```
1. Enable VoiceOver: Cmd + F5
2. Navigate to /resources
3. Test:
   - Page title announced
   - Skip links work
   - Resource list navigable
   - Filters announced
   - Search results announced
```

### Test with NVDA (Windows)
```
1. Enable NVDA
2. Navigate to /resources
3. Test:
   - Browse mode (B for buttons)
   - Forms mode (F for forms)
   - Landmarks (D for landmarks)
```

### Expected Announcements
| Action | Announcement |
|--------|--------------|
| Page load | "Resources, DIVE V3" |
| Search results | "X results found for [query]" |
| Filter apply | "Filtered to X results" |
| Preview open | "Document preview, [title]" |
| Selection | "[title] selected" |
| Navigation | "Document X of Y" |

---

## Automated Testing

### axe-core Integration
```javascript
// Add to test suite
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('resources page has no accessibility violations', async () => {
  const { container } = render(<ResourcesPage />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Lighthouse Accessibility
```bash
npx lighthouse http://localhost:3000/resources --only-categories=accessibility
```

### WAVE Browser Extension
1. Install WAVE extension
2. Navigate to /resources
3. Click WAVE icon
4. Review errors and alerts

---

## Color Contrast Requirements

### Dark Mode Palette
| Element | Foreground | Background | Ratio |
|---------|------------|------------|-------|
| Body text | #F5F5F5 | #1A1A2E | 14.5:1 ✅ |
| Muted text | #A0A0B0 | #1A1A2E | 6.3:1 ✅ |
| UNCLASSIFIED | #22C55E | #1A1A2E | 🔍 |
| CONFIDENTIAL | #3B82F6 | #1A1A2E | 🔍 |
| SECRET | #EF4444 | #1A1A2E | 🔍 |
| TOP_SECRET | #F97316 | #1A1A2E | 🔍 |
| Focus ring | #8B5CF6 | Any | 3:1+ ✅ |

### Check with Tools
- Chrome DevTools color picker
- WebAIM Contrast Checker
- Figma A11y plugin

---

## Touch Target Sizes

### WCAG 2.5.5 (Level AAA target, AA recommendation)
- Minimum: 24×24px
- Recommended: 44×44px

### Elements to Check
- [ ] Filter checkboxes
- [ ] Search clear button
- [ ] Modal close button
- [ ] Navigation buttons
- [ ] Bookmark button
- [ ] Export dropdown items

---

## Focus Indicator Requirements

### WCAG 2.4.7 & 2.4.11
```css
/* Minimum focus indicator */
:focus {
  outline: 2px solid #8B5CF6;
  outline-offset: 2px;
}

/* Enhanced for WCAG 2.4.11 */
:focus-visible {
  outline: 3px solid #8B5CF6;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.3);
}
```

---

## Audit Results Template

```
Date: [DATE]
Tester: [NAME]
Screen Reader: [VoiceOver/NVDA/JAWS]
Browser: [Chrome/Firefox/Safari]

## Automated Testing
- axe-core violations: [X]
- Lighthouse accessibility: [X]/100
- WAVE errors: [X]
- WAVE alerts: [X]

## Manual Testing
### Keyboard Navigation
- [ ] All interactive elements reachable
- [ ] Focus visible at all times
- [ ] Focus order logical
- [ ] No keyboard traps
- [ ] Shortcuts work correctly

### Screen Reader
- [ ] Page title announced
- [ ] Landmarks present and announced
- [ ] Headings hierarchy correct
- [ ] Lists announced with count
- [ ] Buttons have accessible names
- [ ] Form inputs have labels
- [ ] Dynamic content announced

### Color & Contrast
- [ ] Text contrast ≥ 4.5:1
- [ ] UI component contrast ≥ 3:1
- [ ] Focus indicator visible
- [ ] No color-only information

## Issues Found
| # | Criterion | Severity | Description | Recommendation |
|---|-----------|----------|-------------|----------------|
| 1 | 1.4.3 | High | [Description] | [Fix] |

## Pass/Fail Summary
- Total criteria: 50
- Passed: [X]
- Failed: [X]
- N/A: [X]

## Overall Score: [X]/100
```

---

## Recommended Tools

### Browser Extensions
1. **axe DevTools** - Comprehensive testing
2. **WAVE** - Visual accessibility checker
3. **Lighthouse** - Built into Chrome
4. **HeadingsMap** - Heading structure

### Screen Readers
1. **VoiceOver** (macOS) - Built-in
2. **NVDA** (Windows) - Free
3. **JAWS** (Windows) - Enterprise

### Testing Services
1. **Deque** - axe enterprise
2. **Level Access** - WCAG audits
3. **WebAIM** - Contrast checkers

---

## Next Steps

1. **Run axe-core** - Get baseline violations
2. **Test keyboard** - Tab through entire page
3. **Test screen reader** - VoiceOver walkthrough
4. **Check contrast** - All color combinations
5. **Fix issues** - Prioritize by severity
6. **Re-test** - Verify fixes



