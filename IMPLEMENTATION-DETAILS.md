# Implementation Details: KAS & Content Viewer

**Technical Reference for Developers**

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Structure](#component-structure)
3. [Code Examples](#code-examples)
4. [Type Definitions](#type-definitions)
5. [Styling System](#styling-system)
6. [State Management](#state-management)
7. [Integration Guide](#integration-guide)

---

## 🏗️ Architecture Overview

### Component Hierarchy

```
ResourceDetailPage
├── PageLayout
├── AccessDenied (if 403)
└── Resource View
    ├── Access Granted Banner
    ├── ZTDF Summary Card (enhanced)
    │   ├── Animated Lock Icon
    │   ├── KAS Protected Badge
    │   └── Metadata Grid
    ├── Resource Details
    └── Document Content
        ├── ContentViewer (if decrypted) ← NEW
        │   ├── Control Bar
        │   │   ├── Content Icon
        │   │   ├── Metadata
        │   │   ├── Zoom Controls
        │   │   ├── Download Button
        │   │   └── Fullscreen Toggle
        │   └── Content Renderer
        │       ├── Image Viewer
        │       ├── PDF Viewer
        │       ├── Text Viewer
        │       └── Document Fallback
        ├── KAS Request UI (enhanced) ← UPDATED
        └── Plain Content (fallback)
```

---

## 🧩 Component Structure

### ContentViewer Component

**Location**: `frontend/src/components/resources/content-viewer.tsx`

**Props Interface**:
```typescript
interface ContentViewerProps {
  content: string;        // Base64 or plain text
  contentType: string;    // MIME type (e.g., "image/png")
  title: string;          // Resource title
  resourceId: string;     // Unique ID
  classification: string; // Security classification
}
```

**Internal State**:
```typescript
const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
const [zoom, setZoom] = useState<number>(100);
const [imageLoaded, setImageLoaded] = useState<boolean>(false);
```

**Key Methods**:
```typescript
// Detect if content is base64 encoded
const isBase64 = /^[A-Za-z0-9+/=]+$/.test(content.substring(0, 100));

// Generate data URL for rendering
const getDataUrl = () => {
  if (content.startsWith('data:')) return content;
  if (isBase64) return `data:${contentType};base64,${content}`;
  return null;
};

// Determine content category
const getContentCategory = () => {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('text/')) return 'text';
  return 'document';
};
```

---

## 💻 Code Examples

### Example 1: Basic Usage

```tsx
import ContentViewer from '@/components/resources/content-viewer';

function MyComponent() {
  const [decryptedContent, setDecryptedContent] = useState<string>('');
  
  return (
    <ContentViewer
      content={decryptedContent}
      contentType="image/png"
      title="Classified Document"
      resourceId="doc-ztdf-0001"
      classification="SECRET"
    />
  );
}
```

### Example 2: With Loading State

```tsx
function MyComponent() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (!content) {
    return <div>No content available</div>;
  }
  
  return (
    <ContentViewer
      content={content}
      contentType="application/pdf"
      title="Secret Report"
      resourceId="doc-123"
      classification="TOP_SECRET"
    />
  );
}
```

### Example 3: Handling Multiple Content Types

```tsx
function DynamicViewer({ resource }: { resource: IResource }) {
  const contentType = resource.ztdf?.contentType || 'text/plain';
  
  // Determine appropriate viewer based on type
  const getViewer = () => {
    if (contentType.startsWith('image/')) {
      return '🖼️ Image Viewer';
    }
    if (contentType === 'application/pdf') {
      return '📋 PDF Viewer';
    }
    return '📄 Text Viewer';
  };
  
  return (
    <div>
      <p>Using: {getViewer()}</p>
      <ContentViewer
        content={resource.content}
        contentType={contentType}
        title={resource.title}
        resourceId={resource.resourceId}
        classification={resource.classification}
      />
    </div>
  );
}
```

---

## 📐 Type Definitions

### Core Interfaces

```typescript
// Resource interface (extended)
interface IResource {
  resourceId: string;
  title: string;
  classification: string;
  releasabilityTo: string[];
  COI: string[];
  encrypted: boolean;
  creationDate?: string;
  content?: string;
  displayMarking?: string;
  ztdf?: {
    version: string;
    objectType: string;
    contentType: string;        // Used by ContentViewer
    policyVersion: string;
    encryptionAlgorithm: string;
    kaoCount: number;
  };
  metadata?: {
    createdAt?: string;
    updatedAt?: string;
  };
}

// Content categories
type ContentCategory = 'image' | 'pdf' | 'text' | 'document';

// Zoom levels
type ZoomLevel = 50 | 75 | 100 | 125 | 150 | 175 | 200;
```

---

## 🎨 Styling System

### Design Tokens

```typescript
// Classification colors (unchanged)
const classificationColors: Record<string, string> = {
  'UNCLASSIFIED': 'bg-green-100 text-green-800 border-green-300',
  'CONFIDENTIAL': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'SECRET': 'bg-orange-100 text-orange-800 border-orange-300',
  'TOP_SECRET': 'bg-red-100 text-red-800 border-red-300',
};

// NEW: Encryption badge style
const encryptionBadgeStyle = `
  inline-flex items-center px-3 py-1.5 rounded-lg 
  text-xs font-bold 
  bg-gradient-to-r from-purple-600 to-indigo-600 
  text-white shadow-md 
  hover:shadow-lg transition-all 
  animate-pulse
`;

// NEW: ZTDF card style
const ztdfCardStyle = `
  bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 
  border-2 border-purple-300 
  rounded-xl p-6 shadow-lg
`;

// NEW: KAS request container style
const kasRequestStyle = `
  relative overflow-hidden
  bg-gradient-to-br from-purple-100 via-blue-100 to-indigo-100
  rounded-xl py-12 px-6
`;
```

### Gradient Patterns

```css
/* Primary gradient (purple to indigo) */
.gradient-primary {
  background: linear-gradient(to right, #9333ea, #4f46e5);
}

/* Card gradient (soft purple/blue) */
.gradient-card {
  background: linear-gradient(
    to bottom right,
    rgba(243, 232, 255, 1),
    rgba(224, 242, 254, 1),
    rgba(224, 231, 255, 1)
  );
}

/* Radial gradient overlay */
.gradient-radial {
  background: radial-gradient(
    circle at 50% 120%,
    rgba(120, 119, 198, 0.3),
    rgba(255, 255, 255, 0)
  );
}
```

### Animation Classes

```css
/* Pulse animation (Tailwind default) */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Scale on hover */
.hover\:scale-105:hover {
  transform: scale(1.05);
}

/* Rotate on hover */
.group:hover .group-hover\:rotate-12 {
  transform: rotate(12deg);
}

/* Translate on hover */
.group:hover .group-hover\:translate-x-1 {
  transform: translateX(0.25rem);
}
```

---

## 🔄 State Management

### Component State Flow

```
┌─────────────────────────────────────────────────┐
│ ResourceDetailPage                              │
│                                                 │
│ State:                                          │
│ ├─ resource: IResource | null                  │
│ ├─ decryptedContent: string | null             │
│ ├─ showKASModal: boolean                       │
│ ├─ kasError: string | null                     │
│ └─ loading: boolean                             │
│                                                 │
│ Effects:                                        │
│ ├─ Fetch resource on mount                     │
│ ├─ Check sessionStorage for cached content     │
│ └─ Handle KAS request flow                     │
│                                                 │
│ Renders:                                        │
│ └─> ContentViewer (if decryptedContent)        │
│     │                                           │
│     │ Internal State:                           │
│     │ ├─ isFullscreen: boolean                 │
│     │ ├─ zoom: number (50-200)                 │
│     │ └─ imageLoaded: boolean                  │
│     │                                           │
│     │ Effects:                                  │
│     │ ├─ Fullscreen keyboard handler (ESC)     │
│     │ └─ Body overflow control                 │
│     │                                           │
│     │ Renders:                                  │
│     │ ├─ Control Bar                            │
│     │ └─ Content Renderer (based on type)      │
│     │    ├─ Image Viewer                        │
│     │    ├─ PDF Viewer                          │
│     │    ├─ Text Viewer                         │
│     │    └─ Document Fallback                   │
│     └─────────────────────────────────────────│
└─────────────────────────────────────────────────┘
```

### SessionStorage Keys

```typescript
// Cached decrypted content
sessionStorage.setItem(`decrypted-${resourceId}`, content);
sessionStorage.getItem(`decrypted-${resourceId}`);
sessionStorage.removeItem(`decrypted-${resourceId}`);

// KAS flow state
sessionStorage.setItem(`kas-flow-${resourceId}`, JSON.stringify(flow));
sessionStorage.getItem(`kas-flow-${resourceId}`);
sessionStorage.removeItem(`kas-flow-${resourceId}`);
```

---

## 🔌 Integration Guide

### Step 1: Import Component

```tsx
import ContentViewer from '@/components/resources/content-viewer';
```

### Step 2: Prepare Props

```tsx
// Get from resource object
const {
  content,           // decrypted content
  ztdf: {
    contentType      // MIME type
  },
  title,
  resourceId,
  classification
} = resource;
```

### Step 3: Render Conditionally

```tsx
{decryptedContent ? (
  <ContentViewer
    content={decryptedContent}
    contentType={resource.ztdf?.contentType || 'text/plain'}
    title={resource.title}
    resourceId={resource.resourceId}
    classification={resource.classification}
  />
) : (
  <div>Content not available</div>
)}
```

### Step 4: Handle Edge Cases

```tsx
// Missing content type fallback
const contentType = resource.ztdf?.contentType || 'text/plain';

// Empty content check
if (!decryptedContent || decryptedContent.length === 0) {
  return <div>No content available</div>;
}

// Error handling
try {
  return <ContentViewer {...props} />;
} catch (error) {
  console.error('Content viewer error:', error);
  return <div>Error displaying content</div>;
}
```

---

## 🧪 Testing Utilities

### Mock Data Generator

```typescript
// Generate mock decrypted content
function generateMockContent(type: string): string {
  switch (type) {
    case 'image/png':
      return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    case 'application/pdf':
      return 'JVBERi0xLjcKCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iagoK...';
    case 'text/plain':
      return 'This is sample decrypted text content.\nWith multiple lines.\nAnd proper formatting.';
    default:
      return 'Unknown content type';
  }
}

// Generate mock resource
function generateMockResource(encrypted: boolean = true): IResource {
  return {
    resourceId: 'test-doc-001',
    title: 'Test Document',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['FVEY'],
    encrypted,
    content: encrypted ? '[Encrypted - KAS key request required]' : 'Plain text',
    ztdf: encrypted ? {
      version: '1.0',
      objectType: 'document',
      contentType: 'text/plain',
      policyVersion: '1.0',
      encryptionAlgorithm: 'AES-256-GCM',
      kaoCount: 1
    } : undefined
  };
}
```

### Unit Test Example

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import ContentViewer from '@/components/resources/content-viewer';

describe('ContentViewer', () => {
  it('renders text content correctly', () => {
    render(
      <ContentViewer
        content="Test content"
        contentType="text/plain"
        title="Test"
        resourceId="test-001"
        classification="UNCLASSIFIED"
      />
    );
    
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });
  
  it('shows zoom controls for images', () => {
    render(
      <ContentViewer
        content="base64encodedimage"
        contentType="image/png"
        title="Test Image"
        resourceId="test-002"
        classification="SECRET"
      />
    );
    
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
  });
  
  it('enters fullscreen mode when button clicked', () => {
    render(
      <ContentViewer
        content="Test content"
        contentType="text/plain"
        title="Test"
        resourceId="test-003"
        classification="CONFIDENTIAL"
      />
    );
    
    const fullscreenButton = screen.getByTitle('Enter fullscreen');
    fireEvent.click(fullscreenButton);
    
    // Check if fullscreen class is applied
    expect(document.body.style.overflow).toBe('hidden');
  });
});
```

---

## 🔍 Debugging Tips

### Common Issues

**Issue 1: Content not rendering**
```typescript
// Check content format
console.log('Content length:', content.length);
console.log('Content type:', contentType);
console.log('First 50 chars:', content.substring(0, 50));

// Verify base64 detection
const isBase64 = /^[A-Za-z0-9+/=]+$/.test(content.substring(0, 100));
console.log('Is base64:', isBase64);
```

**Issue 2: Images not loading**
```typescript
// Check data URL formation
const dataUrl = `data:${contentType};base64,${content}`;
console.log('Data URL length:', dataUrl.length);
console.log('Data URL prefix:', dataUrl.substring(0, 50));

// Test in browser console
const img = new Image();
img.onload = () => console.log('Image loaded successfully');
img.onerror = (e) => console.error('Image load error:', e);
img.src = dataUrl;
```

**Issue 3: PDF not rendering**
```typescript
// Check iframe support
console.log('PDF MIME type:', contentType);
console.log('Data URL:', dataUrl.substring(0, 100));

// Alternative: Force download instead
<a href={dataUrl} download="document.pdf">Download PDF</a>
```

### Browser Console Commands

```javascript
// Check sessionStorage
console.table(Object.keys(sessionStorage).map(key => ({
  key,
  value: sessionStorage.getItem(key)?.substring(0, 50) + '...'
})));

// Test content viewer manually
const viewer = document.querySelector('[data-content-viewer]');
console.log('Viewer state:', viewer?.dataset);

// Check if lucide-react loaded
console.log('Lucide icons:', Object.keys(window).filter(k => k.includes('Lucide')));
```

---

## 📚 Additional Resources

### Dependencies
- **lucide-react**: Icon library (v0.x)
- **tailwindcss**: Styling framework (v3.x)
- **next**: React framework (v15.x)

### Documentation Links
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Lucide Icons](https://lucide.dev/)
- [Next.js Docs](https://nextjs.org/docs)

### Related Files
- `frontend/src/components/resources/content-viewer.tsx` - Main component
- `frontend/src/app/resources/[id]/page.tsx` - Integration point
- `frontend/src/app/resources/page.tsx` - List page with badges
- `backend/src/controllers/resource.controller.ts` - API endpoint

---

## ✅ Implementation Checklist

```
For New Features:
[ ] Define TypeScript interfaces
[ ] Implement component logic
[ ] Add proper error handling
[ ] Style with Tailwind classes
[ ] Add accessibility attributes
[ ] Test responsive design
[ ] Write unit tests
[ ] Document props and usage
[ ] Add JSDoc comments
[ ] Check linting (npm run lint)
[ ] Test in production build

For Bug Fixes:
[ ] Identify root cause
[ ] Add console.log for debugging
[ ] Fix issue
[ ] Remove debug logs
[ ] Test fix works
[ ] Check no regression
[ ] Update tests if needed
```

---

**End of Implementation Details**

*For questions, review source code or contact development team.*

