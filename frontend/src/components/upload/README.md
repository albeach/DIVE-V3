# Modern File Upload Component

A production-ready, accessible file upload component with drag-and-drop, progress tracking, and classification-aware validation.

## Features

- ✨ **Drag & Drop** - Intuitive file selection with visual feedback
- 📊 **Progress Tracking** - Real-time upload progress for each file
- 🎨 **Lottie Animations** - Smooth, professional animations
- 🔒 **Classification-Aware** - Validates files based on security clearance level
- 📱 **Responsive** - Works on desktop, tablet, and mobile
- ♿ **Accessible** - WCAG 2.1 AA compliant
- 🌙 **Dark Mode** - Full dark mode support
- 🚀 **Performance** - Optimized with React hooks and memoization

## Installation

The component is already installed in the DIVE V3 frontend. Dependencies:

```json
{
  "dependencies": {
    "lottie-react": "^2.4.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.300.0"
  }
}
```

## Usage

### Basic Example

```tsx
import { ModernFileUpload } from '@/components/upload/ModernFileUpload';

export default function MyPage() {
  const handleUpload = async (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
  };

  return (
    <ModernFileUpload
      accept={['.pdf', '.docx', '.jpg', '.png']}
      maxSize={100 * 1024 * 1024} // 100MB
      maxFiles={10}
      onUpload={handleUpload}
      classificationLevel="UNCLASSIFIED"
    />
  );
}
```

### Advanced Example with Classification

```tsx
import { ModernFileUpload } from '@/components/upload/ModernFileUpload';
import { useSession } from 'next-auth/react';

export default function SecureUploadPage() {
  const { data: session } = useSession();
  const userClearance = session?.user?.clearance || 'UNCLASSIFIED';

  const handleUpload = async (files: File[]) => {
    try {
      // Validate against backend policy
      const response = await fetch('/api/resources/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.accessToken}`
        },
        body: JSON.stringify({
          files: files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type
          })),
          classification: userClearance
        })
      });

      if (!response.ok) {
        throw new Error('Upload validation failed');
      }

      // Proceed with actual upload
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));

      await fetch('/api/resources/upload-files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.accessToken}`
        },
        body: formData
      });

      console.log('Upload successful!');
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Secure File Upload</h1>

      <ModernFileUpload
        accept={[
          '.pdf',
          '.docx', '.doc',
          '.txt',
          '.jpg', '.jpeg', '.png',
          '.mp4', '.mov'
        ]}
        maxSize={100 * 1024 * 1024} // 100MB
        maxFiles={5}
        onUpload={handleUpload}
        classificationLevel={userClearance as any}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | `string[]` | `[]` | Allowed file types (MIME types or extensions) |
| `maxSize` | `number` | `104857600` | Maximum file size in bytes (100MB default) |
| `maxFiles` | `number` | `10` | Maximum number of files allowed |
| `onUpload` | `(files: File[]) => Promise<void>` | Required | Upload handler function |
| `classificationLevel` | `'UNCLASSIFIED' \| 'CONFIDENTIAL' \| 'SECRET' \| 'TOP_SECRET'` | `'UNCLASSIFIED'` | Security classification level |
| `disabled` | `boolean` | `false` | Disable the upload component |

## Classification Levels

The component validates files based on the specified classification level:

- **UNCLASSIFIED** (Green) - No restrictions
- **CONFIDENTIAL** (Yellow) - Requires AAL2 authentication
- **SECRET** (Orange) - Requires AAL2+ and clearance verification
- **TOP_SECRET** (Red) - Requires AAL3 and top clearance

## Accepted File Types

Common file type examples:

```tsx
// Documents
accept={['.pdf', '.docx', '.doc', '.txt', '.xlsx']}

// Images
accept={['.jpg', '.jpeg', '.png', '.gif', '.webp']}

// Videos
accept={['.mp4', '.mov', '.avi', '.mkv']}

// Archives
accept={['.zip', '.tar', '.gz', '.7z']}

// MIME types
accept={['application/pdf', 'image/*', 'video/*']}

// All files
accept={['*']}
```

## Styling

The component uses Tailwind CSS and is fully customizable. It includes:

- Gradient backgrounds for interactive elements
- Smooth transitions and animations
- Responsive design breakpoints
- Dark mode support via `dark:` variants

## Accessibility

The component follows WCAG 2.1 AA guidelines:

- ✅ Keyboard navigation support
- ✅ Screen reader friendly
- ✅ Focus indicators
- ✅ ARIA labels and roles
- ✅ Color contrast compliance

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Testing

### Unit Tests (Example with Jest)

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ModernFileUpload } from './ModernFileUpload';

describe('ModernFileUpload', () => {
  it('renders without crashing', () => {
    const mockUpload = jest.fn();
    render(<ModernFileUpload onUpload={mockUpload} />);

    expect(screen.getByText('Upload Files')).toBeInTheDocument();
  });

  it('validates file size', async () => {
    const mockUpload = jest.fn();
    const { container } = render(
      <ModernFileUpload
        onUpload={mockUpload}
        maxSize={1024} // 1KB
      />
    );

    const file = new File(['x'.repeat(2048)], 'large.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input!, { target: { files: [file] } });

    expect(mockUpload).not.toHaveBeenCalled();
  });
});
```

### E2E Tests (Example with Playwright)

```typescript
import { test, expect } from '@playwright/test';

test('upload files via drag and drop', async ({ page }) => {
  await page.goto('/examples/file-upload');

  // Create test file
  const buffer = Buffer.from('test content');
  const file = {
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer
  };

  // Upload via drag and drop
  await page.locator('[data-testid="drop-zone"]').setInputFiles([file]);

  // Click upload button
  await page.click('button:has-text("Upload Files")');

  // Verify success
  await expect(page.locator('text=Files uploaded successfully')).toBeVisible();
});
```

## Troubleshooting

### Files not uploading

**Issue**: Upload button is disabled
**Solution**: Ensure all files have status "pending". Files with errors must be removed first.

### Validation errors

**Issue**: "File type not allowed"
**Solution**: Check that file extensions match the `accept` prop. Use `accept={['*']}` to allow all types.

### Progress not showing

**Issue**: Upload completes instantly without progress
**Solution**: Implement chunked uploads or add artificial delay for UX (see `simulateUpload` function).

### Dark mode not working

**Issue**: Colors don't change in dark mode
**Solution**: Ensure your app has dark mode configured in `tailwind.config.js`:

```js
module.exports = {
  darkMode: 'class', // or 'media'
  // ...
}
```

## Examples

See live examples at:
- `/examples/file-upload` - Basic usage
- `/resources/upload` - Secure upload with authentication
- `/admin/documents/upload` - Admin upload with validation

## Contributing

To improve this component:

1. Follow the existing code style
2. Add tests for new features
3. Update this README with your changes
4. Ensure accessibility standards are maintained

## License

Part of the DIVE V3 project. See project LICENSE for details.

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review the [Quick Reference Guide](/docs/OPA-TEST-QUICK-REFERENCE.md)
3. Contact the development team

---

**Last Updated**: 2026-01-30
**Version**: 1.0.0
**Status**: ✅ Production Ready
