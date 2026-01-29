# DIVE V3 Admin UI - Keyboard Shortcuts Reference

**Quick Reference Guide for Power Users**

---

## Global Shortcuts

Press these shortcuts from anywhere in the admin interface:

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Cmd+K` (Mac)<br/>`Ctrl+K` (Win/Linux) | **Command Palette** | Open the global command palette for instant access to any admin page |
| `/` | **Quick Search** | Alternative shortcut to open command palette |
| `Escape` | **Close/Cancel** | Close any open modal, drawer, or dialog |
| `Cmd+Shift+G` | **Glossary** | Open the admin glossary modal |
| `?` | **Help** | Show this keyboard shortcuts modal (when implemented) |

---

## Command Palette Navigation

When the command palette is open (`Cmd+K`):

| Shortcut | Action |
|----------|--------|
| `↑` `↓` | Navigate up/down through results |
| `Enter` | Select highlighted item and navigate |
| `Escape` | Close command palette |
| `Tab` | Switch between sections (Recent, Quick Actions, All Pages) |
| Type to search | Fuzzy search across all 25 admin pages |

---

## Table & List Navigation

When working with tables of data (IdPs, Users, Spokes, etc.):

| Shortcut | Action | Description |
|----------|--------|-------------|
| `Space` | **Toggle Selection** | Select/deselect the current row |
| `Shift+Space` | **Range Selection** | Select all rows between last selected and current |
| `Cmd+A` / `Ctrl+A` | **Select All** | Select all items in the current view |
| `Escape` | **Clear Selection** | Deselect all selected items |
| `Tab` | **Next Cell/Input** | Move to next focusable element |
| `Shift+Tab` | **Previous Cell/Input** | Move to previous focusable element |

---

## Form Navigation

When filling out forms (IdP wizard, policy editor, etc.):

| Shortcut | Action |
|----------|--------|
| `Tab` | Move to next field |
| `Shift+Tab` | Move to previous field |
| `Enter` | Submit form (when on submit button) |
| `Escape` | Cancel and close form |
| `Cmd+S` / `Ctrl+S` | Save form (when implemented) |

---

## Modal & Dialog Shortcuts

When a modal or dialog is open:

| Shortcut | Action |
|----------|--------|
| `Escape` | Close modal without saving |
| `Enter` | Confirm primary action (when focused) |
| `Tab` | Cycle through interactive elements |
| `Shift+Tab` | Reverse cycle through elements |

---

## Analytics & Charts

When viewing analytics dashboards:

| Shortcut | Action |
|----------|--------|
| `Click` | Drill down into chart element |
| `Escape` | Clear all drill-down filters |
| `Cmd+E` / `Ctrl+E` | Export current view (when implemented) |

---

## Bulk Operations

When items are selected for bulk operations:

| Shortcut | Action |
|----------|--------|
| `Delete` | Trigger delete bulk action (with confirmation) |
| `Escape` | Clear selection and cancel bulk mode |
| `Cmd+Shift+A` | Select all visible items |

---

## Browser Shortcuts

Standard browser shortcuts that work in DIVE V3:

| Shortcut | Action |
|----------|--------|
| `Cmd+R` / `Ctrl+R` | Refresh page |
| `Cmd+W` / `Ctrl+W` | Close current tab |
| `Cmd+T` / `Ctrl+T` | Open new tab |
| `Cmd+Shift+T` / `Ctrl+Shift+T` | Reopen closed tab |
| `Cmd+F` / `Ctrl+F` | Find on page (browser search) |

---

## Accessibility Shortcuts

For screen reader users and keyboard-only navigation:

| Shortcut | Action |
|----------|--------|
| `Tab` | Navigate to next interactive element |
| `Shift+Tab` | Navigate to previous interactive element |
| `Space` | Activate button or toggle checkbox |
| `Enter` | Activate link or button |
| `Arrow Keys` | Navigate within lists, menus, and dropdowns |

---

## Tips for Power Users

### 1. Command Palette Mastery

The command palette supports fuzzy search. You can type:
- `idp` → finds "Identity Providers"
- `spok` → finds "Spoke Status"
- `opa pol` → finds "OPA Policies"

### 2. Recent History

The command palette remembers your last 10 visited pages for quick access.

### 3. Quick Actions

Frequently used actions appear at the top of the command palette:
- Add IdP
- Approve Spoke
- View Logs
- Dashboard

### 4. Bulk Selection Patterns

- Select first item
- Hold `Shift` and click last item
- All items in between are selected

### 5. Keyboard-First Workflow

1. `Cmd+K` → Open palette
2. Type search query
3. `↓` to navigate
4. `Enter` to select
5. Complete task
6. `Cmd+K` → Next task

---

## Customization (Coming Soon)

Future versions will support:
- Custom keyboard shortcuts
- Shortcut preferences per user
- Import/export shortcut configurations

---

## Platform-Specific Notes

### macOS
- `Cmd` is the primary modifier key
- `Option` used for some advanced shortcuts

### Windows/Linux
- `Ctrl` replaces `Cmd`
- `Alt` replaces `Option`

### Browser Conflicts

Some shortcuts may conflict with browser defaults:
- **Chrome**: `Cmd+K` conflicts with search bar (DIVE V3 takes precedence in app)
- **Firefox**: Most shortcuts work without conflicts
- **Safari**: `Cmd+K` may open Safari search (use `/` instead)

---

## Cheat Sheet (Print-Friendly)

```
╔═══════════════════════════════════════════════════╗
║  DIVE V3 Admin - Essential Keyboard Shortcuts    ║
╠═══════════════════════════════════════════════════╣
║  Cmd+K / Ctrl+K   → Command Palette              ║
║  /                → Quick Search                  ║
║  Escape           → Close/Cancel                  ║
║  Cmd+Shift+G      → Glossary                     ║
║  Space            → Select Item                   ║
║  Cmd+A / Ctrl+A   → Select All                   ║
║  Tab / Shift+Tab  → Navigate Fields              ║
║  ↑ ↓              → Navigate Lists               ║
║  Enter            → Confirm/Submit               ║
╚═══════════════════════════════════════════════════╝
```

---

**Pro Tip:** Press `Cmd+K` and type "shortcuts" to return to this page anytime!

---

**Last Updated:** 2026-01-29  
**Version:** 2.0.0
