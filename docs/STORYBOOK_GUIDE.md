# Storybook Component Library Guide

**Version:** 1.0.0  
**Date:** February 6, 2026  
**Phase:** Phase 4.3 - Storybook Component Library  
**Storybook Version:** 10.2.7

---

## Overview

This guide covers the Storybook component library for DIVE V3 admin interface components. Storybook provides a visual development environment for building, testing, and documenting UI components in isolation.

## Quick Start

### Running Storybook Locally

```bash
cd frontend
npm run storybook
```

Storybook will start on `http://localhost:6006/`

### Building Static Storybook

```bash
cd frontend
npm run build-storybook
```

Output will be in `storybook-static/` directory.

---

## Component Stories

### Available Components

#### 1. AnimatedButton
- **Location:** `frontend/src/components/admin/shared/AnimatedButton.stories.tsx`
- **Stories:** 20+ variants
- **Coverage:**
  - Primary, Secondary, Success, Danger buttons
  - Icon buttons (refresh, edit, delete, add)
  - Link buttons
  - Card buttons
  - Intensity variations (subtle, normal, strong)
  - States (disabled, animation disabled)
  - Sizes (small, medium, large)
  - Button groups
  - Dark mode examples

**Key Features:**
- Interactive controls for all props
- Live hover/tap animation preview
- Intensity comparison
- Accessibility testing with a11y addon

#### 2. AdminPageTransition
- **Location:** `frontend/src/components/admin/shared/AdminPageTransition.stories.tsx`
- **Stories:** 5+ variants
- **Coverage:**
  - Slide up variant
  - Fade in variant
  - Scale variant
  - Interactive page navigation demo
  - Section transitions
  - Reduced motion support demonstration

**Key Features:**
- Real-time page transition preview
- Interactive variant selector
- Section transition examples
- Motion preference testing

#### 3. PresenceIndicator
- **Location:** `frontend/src/components/admin/shared/PresenceIndicator.stories.tsx`
- **Stories:** 8+ variants
- **Coverage:**
  - Default presence display
  - Compact variant
  - Multiple pages demonstration
  - In page header context
  - In sidebar context
  - Dark mode compatibility
  - Documentation story

**Key Features:**
- Mocked presence data (cross-tab sync doesn't work in Storybook)
- Avatar stacking visualization
- Tooltip demonstration
- Multiple page scenarios

---

## Writing New Stories

### Story File Structure

Create a new story file alongside your component:

```typescript
// MyComponent.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MyComponent } from './MyComponent';

const meta: Meta<typeof MyComponent> = {
  title: 'Admin/MyComponent',
  component: MyComponent,
  parameters: {
    layout: 'centered', // or 'fullscreen' or 'padded'
  },
  tags: ['autodocs'],
  argTypes: {
    propName: {
      control: 'select', // or 'text', 'boolean', 'number'
      options: ['option1', 'option2'],
      description: 'Description of prop',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MyComponent>;

// Basic story
export const Default: Story = {
  args: {
    propName: 'value',
    children: 'Content',
  },
};

// Interactive story with custom rendering
export const Interactive: Story = {
  render: () => {
    const [state, setState] = useState('initial');
    return (
      <MyComponent 
        value={state}
        onChange={setState}
      />
    );
  },
};
```

### Story Naming Conventions

- **PascalCase** for story names
- **Descriptive names** that explain the variant
- **Group related stories** with common prefixes

Examples:
- `Primary`, `Secondary`, `Danger`
- `WithIcon`, `WithIconLeft`, `WithIconRight`
- `SubtleIntensity`, `NormalIntensity`, `StrongIntensity`
- `DarkMode`, `ReducedMotion`

### Story Organization

```
frontend/src/components/admin/shared/
├── AnimatedButton.tsx
├── AnimatedButton.stories.tsx         ← Story file
├── AdminPageTransition.tsx
├── AdminPageTransition.stories.tsx    ← Story file
├── PresenceIndicator.tsx
└── PresenceIndicator.stories.tsx      ← Story file
```

---

## Controls and Interactions

### ArgTypes Configuration

```typescript
argTypes: {
  // Select dropdown
  intensity: {
    control: 'select',
    options: ['subtle', 'normal', 'strong'],
  },
  
  // Boolean toggle
  disabled: {
    control: 'boolean',
  },
  
  // Text input
  className: {
    control: 'text',
  },
  
  // Number input
  maxAvatars: {
    control: { type: 'number', min: 1, max: 10 },
  },
}
```

### Interactive Controls

All stories have interactive controls in the "Controls" panel at the bottom of Storybook. You can:
- Change prop values in real-time
- See component updates live
- Test different combinations
- Share specific states via URL

---

## Accessibility Testing

Storybook v10 includes the **a11y addon** by default.

### Using the A11y Addon

1. Open any story
2. Click the "Accessibility" tab at the bottom
3. View violations, passes, and incomplete checks
4. Click on issues to see detailed information
5. Fix issues in the component code

### WCAG Compliance

All DIVE V3 components target **WCAG 2.1 AA** compliance:
- Color contrast ratios ≥ 4.5:1
- Keyboard navigation support
- Screen reader compatibility
- Focus indicators
- ARIA attributes

### Testing Checklist

- [ ] No critical accessibility violations
- [ ] All interactive elements keyboard accessible
- [ ] Proper ARIA labels and roles
- [ ] Sufficient color contrast
- [ ] Focus visible on all focusable elements

---

## Dark Mode Support

### Testing Dark Mode

All stories support dark mode. To test:

1. **Method 1: Global Toolbar**
   - Click the background color icon in toolbar
   - Select "dark" background
   - Component should render in dark mode

2. **Method 2: Story-Specific**
   - Some stories have `DarkMode` variants
   - These force dark mode for that story

### Dark Mode Implementation

Components use Tailwind's dark mode classes:

```tsx
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
  Content
</div>
```

---

## Deployment

### Option 1: Chromatic (Recommended)

[Chromatic](https://www.chromatic.com/) provides:
- Automatic visual regression testing
- Component review workflow
- Hosted Storybook
- GitHub integration

```bash
# Install Chromatic
npm install --save-dev chromatic

# Publish to Chromatic
npx chromatic --project-token=<token>
```

### Option 2: Static Hosting

Build and deploy to any static hosting:

```bash
# Build static Storybook
npm run build-storybook

# Deploy storybook-static/ folder to:
# - Netlify
# - Vercel
# - GitHub Pages
# - AWS S3
# - Any static host
```

### Option 3: GitHub Pages

```bash
# Build
npm run build-storybook

# Deploy (requires gh-pages package)
npx gh-pages -d storybook-static
```

---

## Best Practices

### 1. Story Organization

- **One story file per component**
- **Co-locate** stories with components
- **Group related components** in same folder
- **Use clear naming** for story exports

### 2. Documentation

- **Add descriptions** to argTypes
- **Include usage examples** in stories
- **Document edge cases**
- **Show error states**

### 3. Coverage

- **Cover all prop variants**
- **Show different states** (loading, error, empty)
- **Include responsive examples**
- **Test dark mode**
- **Verify accessibility**

### 4. Performance

- **Keep stories focused** on one variant
- **Avoid heavy computations** in story renders
- **Use mocked data** instead of API calls
- **Lazy load large stories** if needed

### 5. Maintenance

- **Update stories** when components change
- **Fix broken stories** immediately
- **Remove obsolete stories**
- **Keep dependencies updated**

---

## Troubleshooting

### Storybook Won't Start

```bash
# Clear cache and rebuild
rm -rf node_modules/.cache
npm run storybook
```

### Stories Not Appearing

Check:
- Story file matches pattern: `*.stories.@(js|jsx|ts|tsx)`
- Story file is in `src/` directory
- Story exports a default Meta object
- Named exports are Story objects

### Styles Not Loading

Verify:
- `globals.css` is imported in `.storybook/preview.ts`
- Tailwind config includes Storybook paths
- PostCSS is configured

### Dark Mode Not Working

Check:
- Component uses `dark:` classes
- `.storybook/preview.ts` has dark mode decorator
- Background addon is configured

### A11y Violations

1. Click on violation in A11y panel
2. Read detailed description
3. Click "More info" for WCAG docs
4. Fix issue in component
5. Verify fix in Storybook

---

## Advanced Features

### Custom Decorators

Add global decorators in `.storybook/preview.ts`:

```typescript
export const decorators = [
  (Story) => (
    <div className="p-8">
      <Story />
    </div>
  ),
];
```

### Custom Parameters

```typescript
export const MyStory: Story = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'dark',
    },
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};
```

### Play Functions

Test interactions:

```typescript
import { userEvent, within } from '@storybook/test';

export const WithInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');
    await userEvent.click(button);
  },
};
```

---

## Resources

- **Storybook Documentation:** https://storybook.js.org/docs
- **DIVE V3 Component Docs:** `docs/PHASE3_COMPONENTS.md`
- **Testing Guide:** `docs/PHASE4_ANIMATION_TESTING_GUIDE.md`
- **Chromatic:** https://www.chromatic.com/

---

## FAQ

### Can I use Storybook for non-visual components?

Yes! Storybook is great for any component, including hooks, utilities, and context providers.

### Do stories affect production bundle size?

No. Story files are never included in production builds.

### How do I share a specific story state?

Use the "Copy link" button in Storybook toolbar. The URL includes all control values.

### Can I test API calls in stories?

Yes, but mock them using MSW (Mock Service Worker) addon or simple mock functions.

### How do I add Storybook to CI/CD?

Build Storybook in CI:
```yaml
- name: Build Storybook
  run: npm run build-storybook

- name: Test Storybook
  run: npm run test-storybook
```

---

**Last Updated:** February 6, 2026  
**Maintained By:** DIVE V3 Development Team  
**Storybook Version:** 10.2.7  
**Framework:** Next.js 16 + Vite
