# DIVE V3 Admin Shared Components

A comprehensive library of reusable UI components for the DIVE V3 admin section.

## Quick Start

```typescript
import {
  // Loading States
  PageLoader, Skeleton, SkeletonTable, Spinner, LoadingButton,
  
  // Tables
  ResponsiveTable, VirtualTable,
  
  // Pagination
  Pagination, usePagination, useServerPagination,
  
  // Empty States
  EmptyState, NoDataEmptyState, ErrorEmptyState,
  
  // Bulk Operations
  BulkOperationsToolbar, useBulkSelection, commonBulkActions,
  
  // Theme
  ThemedCard, ThemedSection, ThemeToggle, useAdminTheme,
  
  // Session
  SessionCountdown, SessionBar,
} from '@/components/admin/shared';
```

---

## Components

### Loading States

#### PageLoader
Full-page loading indicator with message.

```tsx
<PageLoader message="Loading dashboard..." />
```

#### Skeleton Components
Placeholder loading states for different content types.

```tsx
<SkeletonTable rows={5} columns={4} />
<SkeletonCard />
<SkeletonStats count={4} />
<SkeletonText lines={3} />
```

#### LoadingButton
Button with integrated loading state.

```tsx
<LoadingButton 
  loading={isSaving} 
  loadingText="Saving..."
  onClick={handleSave}
>
  Save Changes
</LoadingButton>
```

#### ProgressBar
Animated progress indicator.

```tsx
<ProgressBar progress={75} showLabel color="green" />
```

---

### Tables

#### ResponsiveTable
Mobile-friendly table that converts to cards on small screens.

```tsx
const columns = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'email', header: 'Email', priority: 1 },
  { key: 'role', header: 'Role', priority: 2, hideOnMobile: true },
];

<ResponsiveTable
  data={users}
  columns={columns}
  keyField="id"
  selectable
  selectedRows={selected}
  onSelectionChange={setSelected}
  onRowClick={handleRowClick}
  expandable
  renderExpanded={(row) => <UserDetails user={row} />}
/>
```

#### VirtualTable
High-performance table for large datasets (1000+ rows).

```tsx
<VirtualTable
  data={largeDataset}
  columns={columns}
  keyField="id"
  rowHeight={48}
  maxHeight={600}
  selectable
/>
```

---

### Pagination

#### Pagination Component

```tsx
<Pagination
  currentPage={page}
  totalPages={100}
  totalItems={1000}
  pageSize={10}
  onPageChange={setPage}
  onPageSizeChange={setPageSize}
  showQuickJump
/>
```

#### usePagination Hook
Client-side pagination for in-memory data.

```tsx
const {
  paginatedItems,
  pagination,
  setPage,
  setPageSize,
  nextPage,
  prevPage,
} = usePagination(items, 25);
```

#### useServerPagination Hook
Server-side pagination with API integration.

```tsx
const {
  items,
  pagination,
  isLoading,
  refetch,
  onPageChange,
  onPageSizeChange,
} = useServerPagination({
  initialPageSize: 25,
  onFetch: async ({ page, pageSize }) => {
    const res = await fetch(`/api/users?page=${page}&limit=${pageSize}`);
    return res.json();
  },
});
```

---

### Empty States

Pre-built empty states for common scenarios.

```tsx
<NoDataEmptyState onAction={handleRefresh} />
<NoSearchResultsEmptyState searchTerm="john" onAction={clearSearch} />
<ErrorEmptyState error="Connection failed" onAction={retry} />
<NoUsersEmptyState onAction={() => router.push('/admin/users/new')} />
<ComingSoonEmptyState feature="Analytics v2" />
```

Custom empty state:

```tsx
<EmptyState
  icon={Database}
  title="No Data Available"
  description="Check back later."
  action={{ label: 'Refresh', onClick: refresh }}
/>
```

---

### Bulk Operations

#### BulkOperationsToolbar
Floating toolbar for batch actions on selected items.

```tsx
const { selectedIds, toggle, selectAll, clearSelection } = useBulkSelection(users);

const actions = [
  commonBulkActions.delete(async (ids) => {
    await deleteUsers(ids);
    return { success: true, processed: ids.length, failed: 0 };
  }),
  commonBulkActions.disable(disableUsers),
  commonBulkActions.export(exportUsers),
];

<BulkOperationsToolbar
  selectedCount={selectedIds.length}
  totalCount={users.length}
  actions={actions}
  selectedIds={selectedIds}
  onClearSelection={clearSelection}
  onSelectAll={selectAll}
/>
```

Pre-built actions:
- `commonBulkActions.delete(handler)`
- `commonBulkActions.enable(handler)`
- `commonBulkActions.disable(handler)`
- `commonBulkActions.export(handler)`
- `commonBulkActions.resetPassword(handler)`
- `commonBulkActions.assignRole(role, handler)`

---

### Theme

#### useAdminTheme Hook

```tsx
const { theme, setTheme, isDark, resolvedTheme } = useAdminTheme();
```

#### ThemeToggle Component

```tsx
<ThemeToggle /> // Light | Dark | System
```

#### ThemedCard & ThemedSection

```tsx
<ThemedCard padding="lg" elevated>
  <h2>Card Title</h2>
  <p>Content...</p>
</ThemedCard>

<ThemedSection 
  title="Users" 
  subtitle="Manage user accounts"
  action={<button>Add User</button>}
>
  <UserList />
</ThemedSection>
```

#### Theme-Aware CSS Classes

```tsx
import { tw } from '@/components/admin/shared';

<div className={tw.bg.primary}>...</div>
<span className={tw.text.secondary}>...</span>
<div className={tw.status.success}>Active</div>
```

---

### Session Management

#### SessionCountdown
Visual countdown timer with session extension.

```tsx
<SessionCountdown
  warningThreshold={300}  // 5 minutes
  criticalThreshold={120} // 2 minutes
  onExpiringSoon={() => console.log('Show modal')}
/>
```

#### SessionBar
Compact session indicator for headers.

```tsx
<SessionBar className="ml-auto" />
```

---

## Utilities

### Notification Service

```typescript
import { notify } from '@/lib/notification-service';

// Quick toast
notify.toast.success('Saved!');
notify.toast.error('Failed', error);

// Toast + persistent notification
notify.admin.userCreated('john.doe');
notify.admin.sessionTerminated('john.doe');
notify.admin.spokeApproved('France');

// Security alerts (always persisted)
notify.security('Intrusion Detected', 'IP blocked');
```

### Admin Permissions

```typescript
import { useAdminPermissions, RequirePermission } from '@/lib/admin-permissions';

// Hook
const { can, canAll, isSuperAdmin } = useAdminPermissions();
if (can('users:delete')) { ... }

// Component
<RequirePermission permission="policies:publish">
  <PublishButton />
</RequirePermission>
```

### Export Utilities

```typescript
import { exportToCsv, exportToJson } from '@/lib/export-utils';

exportToCsv(users, 'users-export');
exportToJson(auditLogs, 'audit-logs');
```

---

## Best Practices

### 1. Use Loading States
Always show loading indicators during async operations.

```tsx
<LoadingWrapper loading={isLoading} skeleton={<SkeletonTable />}>
  <UserTable users={users} />
</LoadingWrapper>
```

### 2. Handle Empty States
Provide meaningful empty states instead of blank areas.

```tsx
{users.length === 0 ? (
  <NoUsersEmptyState onAction={addUser} />
) : (
  <UserTable users={users} />
)}
```

### 3. Check Permissions
Hide or disable features based on user permissions.

```tsx
<RequirePermission permission="users:delete" fallback={<span>No access</span>}>
  <DeleteButton />
</RequirePermission>
```

### 4. Use Bulk Operations for Lists
Enable batch actions when displaying lists of items.

```tsx
const selection = useBulkSelection(items);
// Render toolbar when selection.hasSelection
```

### 5. Virtualize Large Lists
Use VirtualTable for datasets > 100 rows.

```tsx
{items.length > 100 ? (
  <VirtualTable data={items} ... />
) : (
  <ResponsiveTable data={items} ... />
)}
```

---

## Component Index

| Component | Purpose | Import |
|-----------|---------|--------|
| PageLoader | Full-page loading | `loading-states` |
| Skeleton* | Placeholder loading | `loading-states` |
| Spinner | Inline loading | `loading-states` |
| LoadingButton | Button with loading | `loading-states` |
| ProgressBar | Progress indicator | `loading-states` |
| ResponsiveTable | Mobile-friendly table | `responsive-table` |
| VirtualTable | Large dataset table | `virtual-table` |
| Pagination | Page navigation | `pagination` |
| EmptyState | Empty content | `empty-states` |
| BulkOperationsToolbar | Batch actions | `bulk-operations` |
| ThemedCard | Dark mode card | `theme-utils` |
| ThemeToggle | Theme switcher | `theme-utils` |
| SessionCountdown | Session timer | `session-countdown` |

---

*Last updated: December 14, 2025*
