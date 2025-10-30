# Custom Login Page Customization Guide

## Overview

The DIVE V3 login pages at `/login/[idpAlias]` are now fully customizable with a modern split layout:
- **LEFT**: Sign In form (white card with glassmorphism)
- **RIGHT**: Custom description area with features and branding

## 🎨 How to Customize

### 1. Edit Text & Colors

Edit `/frontend/public/login-config.json`:

```json
{
  "dive-v3-broker": {
    "displayName": "Your Organization Name",
    "description": {
      "title": "Welcome to Your Portal",
      "subtitle": "Secure Access Gateway",
      "content": "Your custom description text goes here. Explain what users get access to and any important security information.",
      "features": [
        {
          "icon": "🔐",
          "text": "Feature 1 Name"
        },
        {
          "icon": "🌍",
          "text": "Feature 2 Name"
        }
      ]
    },
    "theme": {
      "primary": "#6B46C1",
      "accent": "#F59E0B",
      "background": "#F9FAFB"
    },
    "backgroundImage": "/login-backgrounds/dive-v3-broker.jpg",
    "logo": "/logos/dive-v3-logo.svg"
  }
}
```

### 2. Upload Custom Backgrounds

1. Place your background image in `/frontend/public/login-backgrounds/`
2. Name it after your IdP alias: `[idpAlias].jpg`
3. Examples:
   - `/frontend/public/login-backgrounds/dive-v3-broker.jpg`
   - `/frontend/public/login-backgrounds/usa-idp.jpg`
   - `/frontend/public/login-backgrounds/france-idp.jpg`

**Recommended specs:**
- Format: JPG, PNG, or WebP
- Resolution: 1920x1080 or higher
- File size: < 500KB (compressed)
- Aspect ratio: 16:9 or wider

### 3. Add Custom Logos

1. Place logo in `/frontend/public/logos/`
2. Reference in `login-config.json`:
   ```json
   "logo": "/logos/your-logo.svg"
   ```

**Logo Specifications:**
- **Format**: SVG (recommended), PNG, or JPG
- **Sizing**: The logo will automatically scale to fit:
  - Maximum height: **96px** (24 in Tailwind units)
  - Maximum width: **280px**
  - Minimum height: **60px**
- **Aspect Ratios**: The layout is flexible and handles various aspect ratios:
  - Wide logos (e.g., 3:1, 4:1): Will scale to max-width
  - Square logos (1:1): Will scale to max-height
  - Tall logos (1:2): Will scale to max-height
- **Visual Separation**: A divider line automatically appears below the logo for clean separation from the form
- **Tips**:
  - Use SVG for crisp rendering at any size
  - Ensure logo has transparent background for best results
  - Test with different aspect ratios to ensure layout consistency

## 📁 File Structure

```
frontend/
├── public/
│   ├── login-config.json          # Text and theme configuration
│   ├── login-backgrounds/          # Custom background images
│   │   ├── dive-v3-broker.jpg
│   │   ├── usa-idp.jpg
│   │   ├── france-idp.jpg
│   │   ├── canada-idp.jpg
│   │   └── default.jpg
│   └── logos/                      # Organization logos
│       └── dive-v3-logo.svg
└── src/
    └── app/
        └── login/
            └── [idpAlias]/
                └── page.tsx        # Login page component
```

## 🎯 Configuration Options

### Display Name
The organization or IdP name shown in the form header.

```json
"displayName": "DIVE V3 Super Administrator"
```

### Description Object

```json
"description": {
  "title": "Main heading on the right side",
  "subtitle": "Subheading below the title",
  "content": "Paragraph describing the system/portal",
  "features": [
    { "icon": "emoji", "text": "Feature description" }
  ]
}
```

### Theme Colors

```json
"theme": {
  "primary": "#6B46C1",     // Sign In button, headings
  "accent": "#F59E0B",      // Accent elements
  "background": "#F9FAFB"   // Page background (fallback)
}
```

**Color format**: Hex colors (#RRGGBB)

### Background Image

```json
"backgroundImage": "/login-backgrounds/dive-v3-broker.jpg"
```

- Path relative to `/frontend/public/`
- Optional: If not provided, gradient background is used
- Automatically gets dark overlay for readability

### Logo

```json
"logo": "/logos/dive-v3-logo.svg"
```

- Displayed at the top of the sign-in form
- Optional: If not provided, no logo is shown
- Automatically scaled to fit (max 96px height, 280px width)
- A subtle divider line separates the logo from the form
- SVG recommended for crisp rendering at any resolution
- Supports various aspect ratios without breaking layout consistency

## 🎨 CSS Customization

The login page uses inline Tailwind classes. To customize further:

### Option 1: Edit the Component Directly

Edit `/frontend/src/app/login/[idpAlias]/page.tsx`:

**Example: Change form card styling**
```tsx
// Line ~338
<div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 md:p-10 border border-white/20">
```

### Option 2: Create Custom CSS File

Create `/frontend/src/app/login/custom-login.css`:

```css
/* Custom login page styles */
.login-form-card {
  background: rgba(255, 255, 255, 0.98) !important;
  border-radius: 24px !important;
}

.login-submit-button {
  font-weight: 700 !important;
  text-transform: uppercase !important;
}
```

Import in `page.tsx`:
```tsx
import './custom-login.css';
```

## 🌍 Multi-IdP Configuration

You can configure different themes for each IdP:

```json
{
  "dive-v3-broker": {
    "displayName": "DIVE V3 Admin",
    "theme": { "primary": "#6B46C1", "accent": "#F59E0B" },
    "backgroundImage": "/login-backgrounds/dive-v3-broker.jpg"
  },
  "usa-idp": {
    "displayName": "U.S. Defense Network",
    "theme": { "primary": "#B22234", "accent": "#3C3B6E" },
    "backgroundImage": "/login-backgrounds/usa-flag.jpg"
  },
  "france-idp": {
    "displayName": "Réseau de Défense Français",
    "theme": { "primary": "#0055A4", "accent": "#EF4135" },
    "backgroundImage": "/login-backgrounds/france-flag.jpg"
  }
}
```

## 📝 Content Guidelines

### Title
- Keep it short (3-6 words)
- Make it welcoming
- Example: "Welcome to DIVE V3"

### Subtitle
- One line description
- Clarify what the system is
- Example: "Coalition-Friendly Identity Management"

### Content
- 2-3 sentences maximum
- Explain what users can do
- Mention security/compliance if relevant
- Example: "Access classified resources with your authorized credentials. All access is monitored and logged."

### Features
- 3-4 features maximum
- Use emojis for visual interest
- Keep text concise (3-6 words)
- Examples:
  - 🔐 Multi-Factor Authentication
  - 🌍 Coalition-Wide Access
  - 🛡️ NATO ACP-240 Compliant
  - ⚡ Real-Time Authorization

## 🔧 Advanced Customization

### Change Layout Proportions

Edit the grid columns in `page.tsx` (line ~329):

```tsx
{/* Current: 50/50 split */}
<div className="grid lg:grid-cols-2 gap-8 lg:gap-16">

{/* Option: 40/60 split (form smaller) */}
<div className="grid lg:grid-cols-[40%_60%] gap-8 lg:gap-16">

{/* Option: 60/40 split (form larger) */}
<div className="grid lg:grid-cols-[60%_40%] gap-8 lg:gap-16">
```

### Change Background Overlay

Edit opacity in `page.tsx` (line ~312):

```tsx
{/* Current: 50% dark overlay */}
<div 
  className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/40"
  style={{ opacity: theme.background.overlayOpacity }}
/>

{/* Darker: 70% overlay */}
<div 
  className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/50"
  style={{ opacity: 0.7 }}
/>
```

### Add Custom Animations

Use Framer Motion for custom animations:

```tsx
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, scale: 0.9 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ duration: 0.5 }}
>
  {/* Your content */}
</motion.div>
```

## 🚀 Quick Start

1. **Edit text content:**
   ```bash
   nano frontend/public/login-config.json
   ```

2. **Add background image:**
   ```bash
   cp your-background.jpg frontend/public/login-backgrounds/dive-v3-broker.jpg
   ```

3. **Test locally:**
   ```bash
   cd frontend
   npm run dev
   # Visit: http://localhost:3000/login/dive-v3-broker
   ```

4. **Deploy:**
   ```bash
   npm run build
   ```

## 📱 Responsive Behavior

- **Desktop (lg+)**: Split layout (form left, description right)
- **Mobile/Tablet**: Description hidden, form centered
- **All sizes**: Form remains fully functional

## ✅ Best Practices

1. **Background Images**
   - Use high-quality images
   - Ensure good contrast with white text
   - Compress images for fast loading
   - Test on different screen sizes

2. **Colors**
   - Choose accessible color combinations
   - Ensure buttons have good contrast
   - Use your organization's brand colors

3. **Content**
   - Keep it concise and scannable
   - Avoid jargon
   - Emphasize security features
   - Make it welcoming

4. **Testing**
   - Test on multiple browsers
   - Check mobile responsiveness
   - Verify all IdP configurations
   - Test with and without background images

## 🐛 Troubleshooting

**Background image not showing:**
- Check file exists in `/frontend/public/login-backgrounds/`
- Verify path in `login-config.json` starts with `/login-backgrounds/`
- Check file permissions
- Clear browser cache

**Config not loading:**
- Verify `login-config.json` is valid JSON
- Check browser console for errors
- Ensure IdP alias matches exactly
- Restart dev server after config changes

**Colors not applying:**
- Check hex color format (#RRGGBB)
- Verify theme object structure in config
- Check browser dev tools for inline styles

## 📚 Examples

### Minimal Configuration
```json
{
  "my-idp": {
    "displayName": "My Organization",
    "description": {
      "title": "Welcome",
      "subtitle": "Secure Login",
      "content": "Enter your credentials to continue.",
      "features": [
        { "icon": "🔐", "text": "Secure Access" }
      ]
    },
    "theme": {
      "primary": "#3B82F6",
      "accent": "#10B981",
      "background": "#F9FAFB"
    }
  }
}
```

### Full Configuration
```json
{
  "dive-v3-broker": {
    "displayName": "DIVE V3 Super Administrator",
    "description": {
      "title": "Welcome to DIVE V3",
      "subtitle": "Coalition-Friendly Identity & Access Management",
      "content": "DIVE V3 provides NATO ACP-240 compliant data-centric security with federated identity management across USA, France, Canada, and industry partners.",
      "features": [
        { "icon": "🔐", "text": "Multi-Factor Authentication" },
        { "icon": "🌍", "text": "Coalition-Wide Access" },
        { "icon": "🛡️", "text": "NATO ACP-240 Compliant" },
        { "icon": "⚡", "text": "Real-Time Authorization" }
      ]
    },
    "theme": {
      "primary": "#6B46C1",
      "accent": "#F59E0B",
      "background": "#F9FAFB"
    },
    "backgroundImage": "/login-backgrounds/dive-v3-broker.jpg",
    "logo": "/logos/dive-v3-logo.svg"
  }
}
```

## 🎓 Summary

**To customize your login page:**

1. ✅ Edit `/frontend/public/login-config.json` for text/colors
2. ✅ Add images to `/frontend/public/login-backgrounds/[idpAlias].jpg`
3. ✅ (Optional) Add logo to `/frontend/public/logos/your-logo.svg`
4. ✅ (Optional) Edit `/frontend/src/app/login/[idpAlias]/page.tsx` for CSS changes

**The login page will automatically:**
- Load your custom config
- Display your background image
- Apply your brand colors
- Show your custom description on the right
- Maintain the sign-in form on the left

That's it! No complex build process required. 🎉

