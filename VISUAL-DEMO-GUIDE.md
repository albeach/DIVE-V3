# Visual Demo Guide: KAS & Content Viewer Enhancements

**Quick Start Guide for Testing New Features**

---

## 🚀 Quick Demo Steps

### Step 1: View Enhanced Resource List
```bash
# Navigate to: http://localhost:3000/resources
# Look for resources with the new "KAS Protected" badge
```

**What to Look For:**
- ✨ Animated purple gradient badges
- 🔒 Lock icon next to "KAS Protected" text
- Pulsing animation drawing attention to encrypted resources

**Expected View:**
```
┌─────────────────────────────────────────────────────┐
│ Policy Document - doc-ztdf-0001                     │
│ SECRET  [🔒 KAS Protected]  ← NEW: animated badge   │
│ doc-ztdf-0001 | Releasable to: USA, GBR, CAN       │
└─────────────────────────────────────────────────────┘
```

---

### Step 2: View Enhanced Resource Detail
```bash
# Click on any KAS-protected resource
# Example: http://localhost:3000/resources/doc-ztdf-0001
```

**What to Look For:**
- 🎨 New gradient ZTDF card with animated lock icon
- 💫 Glow effect around lock icon
- 🏷️ "KAS Protected" badge in top-right of card

**Expected View:**
```
┌─────────────────────────────────────────────────────────┐
│  ✅ Access Granted                                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  🔒 (glowing)  Zero Trust Data Format  [🔐 KAS Protected]│
│  Policy-bound encryption • KAS mediation required       │
│                                                          │
│  ZTDF v1.0  |  AES-256-GCM  |  1 KAO  |  PDF           │
│                              [View ZTDF Details] →      │
└─────────────────────────────────────────────────────────┘
```

---

### Step 3: Test KAS Request Flow
```bash
# Scroll down to "Document Content" section
# If content is encrypted, you'll see the new KAS request UI
```

**What to Look For:**
- 🎨 Gradient background (purple → blue → indigo)
- 🔒 Large animated lock icon with glow
- 💎 Modern gradient button with hover effects

**Expected View:**
```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                     🔒 (pulsing glow)                   │
│                                                          │
│           Content Encrypted with KAS                    │
│    This resource requires KAS mediation                 │
│                                                          │
│    ZTDF ensures policies are re-evaluated...           │
│                                                          │
│    ┌──────────────────────────────────────┐            │
│    │  🔑 Request Decryption Key →        │            │
│    └──────────────────────────────────────┘            │
│              (gradient button with glow)               │
│                                                          │
│    Protected by ACP-240 • Real-time checks             │
└─────────────────────────────────────────────────────────┘
```

**Hover Effects:**
- Button scales up slightly (1.05x)
- Shadow intensifies (purple glow)
- Key icon rotates 12 degrees
- Arrow icon slides right

---

### Step 4: Test Content Viewer (After KAS Success)

#### 4A: Text Content
**Expected Features:**
- Zoom controls (50% - 200%)
- Download button
- Fullscreen mode
- Formatted with proper whitespace

**UI Elements:**
```
┌────────────────────────────────────────────────────┐
│ 📄 Document Title               [-] [100%] [+] [↓] [⛶] │
│ SECRET • text/plain                                 │
├────────────────────────────────────────────────────┤
│                                                     │
│  This is the decrypted text content...             │
│  Properly formatted with line breaks.              │
│                                                     │
│  Scrollable if content is long.                    │
│                                                     │
└────────────────────────────────────────────────────┘
```

#### 4B: Image Content
**Expected Features:**
- Auto-loading with skeleton
- Zoom controls (50% - 200%)
- Fullscreen mode
- Centered with shadow effects

**UI Elements:**
```
┌────────────────────────────────────────────────────┐
│ 🖼️ Image.png                   [-] [100%] [+] [↓] [⛶] │
│ SECRET • image/png                                  │
├────────────────────────────────────────────────────┤
│                                                     │
│              [Loading spinner]                      │
│              Loading image...                       │
│                                                     │
│  → After load: centered image with shadow          │
│                                                     │
└────────────────────────────────────────────────────┘
```

#### 4C: PDF Content
**Expected Features:**
- Embedded PDF viewer
- Native browser controls
- Fullscreen mode
- Dark background

**UI Elements:**
```
┌────────────────────────────────────────────────────┐
│ 📋 Document.pdf                              [↓] [⛶] │
│ SECRET • application/pdf                            │
├────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ [PDF Viewer - native browser controls]      │  │
│  │                                              │  │
│  │ Page content renders here...                │  │
│  │                                              │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
└────────────────────────────────────────────────────┘
```

---

## 🎯 Interactive Testing Scenarios

### Scenario 1: Image Zoom
1. Request KAS key for an image resource
2. After decryption, click **[+]** zoom button
3. Image should scale up smoothly
4. Click **[100%]** to reset
5. Click **[-]** to zoom out

### Scenario 2: Fullscreen Mode
1. View any decrypted content
2. Click **[⛶]** fullscreen button
3. Content expands to cover entire screen
4. Press **ESC** key to exit
5. Notice footer hint: "Press ESC to exit fullscreen"

### Scenario 3: Download Content
1. View any decrypted content
2. Click **[↓]** download button
3. File downloads with appropriate extension
4. Verify content integrity

### Scenario 4: Mobile Responsive
1. Resize browser to mobile width (<768px)
2. All controls stack vertically
3. Touch interactions work smoothly
4. Text remains readable

---

## 🐛 Troubleshooting

### KAS Badge Not Showing?
**Check:**
```bash
# Verify resources are encrypted
curl http://localhost:4000/api/resources | jq '.resources[] | select(.encrypted == true)'
```

**Expected Output:**
```json
{
  "resourceId": "doc-ztdf-0001",
  "encrypted": true,
  "ztdfVersion": "1.0"
}
```

### Content Not Rendering?
**Check:**
1. Browser console for errors (F12)
2. Verify MIME type in ZTDF metadata
3. Check sessionStorage for cached content:
   ```javascript
   sessionStorage.getItem('decrypted-doc-ztdf-0001')
   ```

### Icons Not Loading?
**Verify lucide-react installed:**
```bash
cd frontend
npm list lucide-react
```

**Should show:**
```
└── lucide-react@x.x.x
```

---

## 🎨 Visual Comparison

### Before vs After: Resource List Badge

**Before:**
```
┌──────────────────────────────┐
│ 🔐 ZTDF                      │  ← Flat, barely visible
└──────────────────────────────┘
```

**After:**
```
┌──────────────────────────────┐
│ 🔒 KAS Protected             │  ← Gradient, animated, bold
│ (purple→indigo, pulsing)     │
└──────────────────────────────┘
```

### Before vs After: Content Viewer

**Before:**
```
Plain text dump:
─────────────────────
SGVsbG8gV29ybGQh...  ← Base64 or plain text only
─────────────────────
```

**After:**
```
┌─────────────────────────────────┐
│ 🖼️ Image.png          [controls]│
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │   [Rendered Image]          │ │
│ │   (zoomable, fullscreen)    │ │
│ │                             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## 🎬 Animation Highlights

### 1. KAS Badge Pulse
- Animation: `animate-pulse`
- Duration: 2s infinite
- Effect: Smooth opacity fade in/out

### 2. Lock Icon Glow
- Effect: Blurred background layer
- Color: Purple (matching badge)
- Radius: 2xl (24px blur)

### 3. Button Hover
- Scale: 1.0 → 1.05
- Shadow: Intensifies with purple glow
- Icon: Rotates 12 degrees
- Transition: 300ms ease-in-out

### 4. Fullscreen Transition
- Background: Blur backdrop (95% opacity)
- Content: Smooth scale-in
- Duration: 200ms

---

## 📱 Responsive Breakpoints

### Desktop (≥1024px)
- Grid layout with sidebar
- All controls horizontal
- Larger images and PDFs

### Tablet (768px - 1023px)
- Stacked layout
- Compact controls
- Medium-sized content

### Mobile (<768px)
- Single column
- Full-width controls
- Touch-optimized buttons

---

## 🎯 Quick Verification Checklist

```
Checklist for Demo:

Resources List:
[ ] Navigate to /resources
[ ] See animated KAS badges on encrypted resources
[ ] Badge shows lock icon + "KAS Protected"
[ ] Badge has purple gradient

Resource Detail:
[ ] Click encrypted resource
[ ] See enhanced ZTDF card with glow
[ ] "KAS Protected" badge visible in card
[ ] Lock icon animates with pulse

KAS Request:
[ ] Scroll to "Document Content"
[ ] See gradient background (purple→blue)
[ ] Large lock icon with glow effect
[ ] Modern gradient button
[ ] Hover effects work (scale, glow, icons)

Content Viewer:
[ ] Request and decrypt content
[ ] Content renders based on type
[ ] Zoom controls work (if applicable)
[ ] Fullscreen mode works
[ ] Download button works
[ ] ESC exits fullscreen

Mobile:
[ ] Resize to mobile width
[ ] All elements responsive
[ ] Touch interactions smooth
[ ] Text readable
```

---

## 🚀 Next Steps

1. **Test each scenario above**
2. **Verify all animations smooth**
3. **Check responsive design**
4. **Test with real image/PDF if available**
5. **Review console for errors**

---

**Demo Complete!** 🎉

For detailed technical documentation, see: `KAS-CONTENT-VIEWER-ENHANCEMENT.md`

