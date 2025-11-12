# DIVE V3 - Social Media Metadata Setup (2025 Best Practices)

## Overview

DIVE V3 now has comprehensive, modern metadata following 2025 design patterns and best practices for optimal social sharing and SEO.

## What Was Implemented

### 1. Enhanced Next.js Metadata API (App Router)

**File**: `frontend/src/app/layout.tsx`

✅ **Primary Metadata**
- Dynamic title templates
- Comprehensive description with keywords
- Author and publisher information

✅ **Open Graph (Facebook, LinkedIn, WhatsApp, Slack)**
- Full OG protocol support
- Optimized image dimensions (1200x630)
- Locale and sitename configuration
- Type classification

✅ **Twitter Card (X/Twitter)**
- Summary large image format
- Twitter-specific title and description
- Creator and site handles
- Optimized preview card

✅ **PWA Support**
- Web App Manifest
- Theme colors with dark mode support
- App icons for all platforms
- Shortcuts to key pages

✅ **SEO & Security**
- Robots directives (noindex for dev)
- Canonical URLs
- Referrer policy
- Format detection control

### 2. Dynamic OG Image Generation

**Files**:
- `frontend/src/app/opengraph-image.tsx` - Facebook/LinkedIn preview
- `frontend/src/app/twitter-image.tsx` - Twitter/X preview

**Features**:
- Edge runtime for fast generation
- Modern gradient backgrounds (#0f172a → #1e3a8a)
- Glassmorphic design elements
- Dynamic text rendering
- Feature badges with emojis
- Optimal dimensions for each platform

### 3. PWA Manifest

**File**: `frontend/public/manifest.json`

**Capabilities**:
- Installable web app
- Custom shortcuts (Login, Resources)
- Multiple icon sizes
- Theme and background colors
- Categories and orientation

### 4. SEO Configuration

**File**: `frontend/public/robots.txt`

**Settings**:
- Prevents indexing (dev site)
- Allows asset access
- Ready for production sitemap

## Social Sharing Preview

When you share `https://dev-app.dive25.com`, users will see:

### Facebook / LinkedIn / WhatsApp

```
┌─────────────────────────────────────────┐
│                                         │
│         [Dynamic OG Image]              │
│     • Gradient blue background          │
│     • "DIVE V3" large title             │
│     • "Coalition ICAM" subtitle         │
│     • Feature badges below              │
│                                         │
├─────────────────────────────────────────┤
│ DIVE V3 - Coalition ICAM Platform       │
│                                         │
│ Secure Coalition Identity & Access      │
│ Management for USA/NATO partners.       │
│ Federated authentication with ABAC...   │
│                                         │
│ dev-app.dive25.com                      │
└─────────────────────────────────────────┘
```

### Twitter / X

```
┌─────────────────────────────────────────┐
│                                         │
│     [Twitter-Optimized Image]           │
│   • Slightly different proportions      │
│   • "Zero Trust" + "11 IdPs" badges     │
│                                         │
├─────────────────────────────────────────┤
│ DIVE V3 - Coalition ICAM Platform       │
│                                         │
│ Secure federated authentication for     │
│ USA/NATO partners with ABAC...          │
│                                         │
│ 🔗 dev-app.dive25.com                   │
└─────────────────────────────────────────┘
```

## Testing Your Metadata

### 1. Facebook Sharing Debugger
https://developers.facebook.com/tools/debug/

1. Enter URL: `https://dev-app.dive25.com`
2. Click "Debug"
3. Should show:
   - ✅ OG image (1200x630)
   - ✅ Title and description
   - ✅ No errors

### 2. Twitter Card Validator
https://cards-dev.twitter.com/validator

1. Enter URL: `https://dev-app.dive25.com`
2. Click "Preview Card"
3. Should show:
   - ✅ Large image card
   - ✅ Twitter-optimized preview
   - ✅ All metadata fields

### 3. LinkedIn Post Inspector
https://www.linkedin.com/post-inspector/

1. Enter URL: `https://dev-app.dive25.com`
2. Inspect
3. Should show rich preview

### 4. Direct URL Tests

```bash
# Test OG image generation
curl -I https://dev-app.dive25.com/opengraph-image

# Test Twitter image
curl -I https://dev-app.dive25.com/twitter-image

# Test manifest
curl https://dev-app.dive25.com/manifest.json

# Test robots.txt
curl https://dev-app.dive25.com/robots.txt
```

## Metadata Features

### Modern 2025 Patterns

✅ **Dynamic Image Generation**
- No static image files needed
- Always up-to-date
- Automatic regeneration

✅ **Edge Runtime**
- Fast image generation
- Low latency
- Serverless deployment ready

✅ **Theme Awareness**
- Light/dark mode support
- Adaptive colors
- System preference detection

✅ **Accessibility**
- Alt text on all images
- Semantic HTML
- Screen reader friendly

✅ **Performance**
- Optimized image sizes
- Lazy loading support
- Efficient caching

### SEO Best Practices

✅ **Keywords**
- Coalition ICAM
- Federated identity
- NATO authentication
- ABAC authorization
- Zero trust

✅ **Structured Data**
- Organization schema ready
- WebApplication schema ready
- Breadcrumb schema ready

✅ **Security Headers**
- Referrer policy
- No format detection
- Canonical URLs

## Browser Compatibility

| Browser | Metadata Support | OG Images | PWA |
|---------|-----------------|-----------|-----|
| Chrome 120+ | ✅ Full | ✅ | ✅ |
| Firefox 121+ | ✅ Full | ✅ | ✅ |
| Safari 17+ | ✅ Full | ✅ | ✅ |
| Edge 120+ | ✅ Full | ✅ | ✅ |

## Production Checklist

When moving to production, update:

### 1. URLs
```typescript
// layout.tsx
openGraph: {
  url: "https://app.dive25.com", // Remove 'dev-'
  images: ["https://app.dive25.com/opengraph-image"],
},
```

### 2. Robots
```typescript
// layout.tsx
robots: {
  index: true, // Enable indexing
  follow: true,
  nocache: false,
},
```

### 3. robots.txt
```
User-agent: *
Allow: /

Sitemap: https://app.dive25.com/sitemap.xml
```

### 4. Add Sitemap
Create `frontend/src/app/sitemap.ts`:
```typescript
export default function sitemap() {
  return [
    {
      url: 'https://app.dive25.com',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    // ... more pages
  ]
}
```

## Customization

### Change Colors

Update theme colors in `layout.tsx`:
```typescript
themeColor: [
  { media: "(prefers-color-scheme: light)", color: "#YOUR_COLOR" },
  { media: "(prefers-color-scheme: dark)", color: "#YOUR_DARK_COLOR" },
],
```

### Update OG Image Design

Edit `opengraph-image.tsx` and `twitter-image.tsx` with your custom design.

### Add More Social Platforms

Add platform-specific metadata:
```typescript
// layout.tsx
export const metadata: Metadata = {
  // ... existing metadata
  other: {
    'pinterest-rich-pin': 'true',
    'telegram:channel': '@DIVEV3',
  },
}
```

## Troubleshooting

### OG Image Not Showing

1. Clear cache:
```bash
# Force regeneration
rm -rf frontend/.next
docker compose restart nextjs
```

2. Check generation endpoint:
```bash
curl https://dev-app.dive25.com/opengraph-image
```

### Wrong Metadata in Social Shares

1. **Facebook**: Use Sharing Debugger to refresh cache
2. **Twitter**: Wait 24 hours or use Card Validator
3. **LinkedIn**: Use Post Inspector to force refresh

### PWA Not Installing

1. Check manifest is accessible:
```bash
curl https://dev-app.dive25.com/manifest.json
```

2. Verify HTTPS is working
3. Check browser console for errors

## Additional Resources

- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)

## Files Modified/Created

1. `frontend/src/app/layout.tsx` - Enhanced metadata
2. `frontend/src/app/opengraph-image.tsx` - Facebook/LinkedIn preview
3. `frontend/src/app/twitter-image.tsx` - Twitter preview
4. `frontend/public/manifest.json` - PWA manifest
5. `frontend/public/robots.txt` - SEO configuration

---

**Result**: Your DIVE V3 app now has beautiful, modern social sharing previews that follow 2025 best practices! 🎉




