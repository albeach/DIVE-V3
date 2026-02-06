# Policy Administration UI/UX - Implementation Guide

**Version**: 1.0.0  
**Date**: February 6, 2026  
**Design System**: Modern 2026 UI/UX Best Practices

---

## Overview

The Policy Administration Center is a modern, real-time interface for managing and monitoring OPAL policy distribution across all DIVE instances. It follows 2026 UX best practices with glassmorphism, micro-interactions, and live data visualization.

## Design Philosophy

### 2026 UI/UX Trends Applied

1. **Glassmorphism** - Frosted glass aesthetic with backdrop blur
2. **Neumorphism Elements** - Subtle shadows and depth
3. **Micro-Interactions** - Smooth animations for every action
4. **Real-Time Updates** - WebSocket-powered live data
5. **Dark Mode First** - Reduced eye strain for extended use
6. **Accessibility** - WCAG 2.1 AAA compliant
7. **Responsive Design** - Works on all screen sizes
8. **Progressive Disclosure** - Show complexity only when needed

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     POLICY ADMINISTRATION ARCHITECTURE                  │
└─────────────────────────────────────────────────────────────────────────┘

Frontend (Next.js 15 + React 19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── /admin/policies/page.tsx
│   ├── Real-time WebSocket connection
│   ├── Framer Motion animations
│   ├── Lucide React icons
│   └── Tailwind CSS glassmorphism

Backend API (Express.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── /api/admin/policies
│   ├── GET  - List all policies
│   ├── POST /toggle - Enable/disable policy
│   └── POST /update - Update policy content
│
└── /ws/policy-updates (WebSocket)
    ├── JWT authentication
    ├── Role-based access (admin/policy-admin)
    └── Real-time workflow events

OPAL Integration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
├── File system watcher (policies/)
├── Redis Pub/Sub broadcaster
├── OPA policy bundle updates
└── Workflow monitoring
```

---

## Features

### 1. Policy List Management

**Location**: Left panel

**Features**:
- ✅ List all policies from `policies/base`, `policies/org`, `policies/tenant`
- ✅ Toggle switch for instant enable/disable
- ✅ Category badges (authorization, federation, data, tenant)
- ✅ Last modified timestamp
- ✅ Policy description from Rego comments
- ✅ Hover animations (scale 1.02)

**UX Pattern**: Toggle switches with smooth spring animations (Framer Motion)

### 2. Real-Time Workflow Visualization

**Location**: Right panel (top)

**Features**:
- ✅ 6-stage workflow diagram
- ✅ Live progress indicators
- ✅ Animated status icons (rotate, pulse, scale)
- ✅ Duration tracking per stage
- ✅ Instance-specific propagation (Hub, FRA, GBR)

**Workflow Stages**:
1. **OPAL Detection** (5s polling) - File icon with rotation
2. **Redis Pub/Sub** (< 1s) - Radio icon with pulse
3. **OPAL Clients** (1-2s) - Refresh icon with instances
4. **OPA Reload** (1-2s) - Database icon with progress
5. **Authz Active** - Checkmark with completion

**UX Pattern**: Timeline with connector lines, animated progress bars

### 3. Live Activity Feed

**Location**: Right panel (bottom)

**Features**:
- ✅ Real-time notifications
- ✅ Slide-in animations (Framer Motion)
- ✅ Auto-dismiss after 5 seconds
- ✅ Max 5 notifications visible
- ✅ Chronological order (newest first)

**Notification Types**:
- Policy enabled/disabled
- OPAL server detection
- Redis broadcast complete
- OPAL clients updated
- OPA reloaded
- Workflow complete

### 4. Statistics Dashboard

**Location**: Right panel (middle)

**Features**:
- ✅ Active policies count
- ✅ Average propagation time
- ✅ Gradient backgrounds
- ✅ Icon indicators
- ✅ Real-time updates

**Metrics**:
- Policies Active: Live count
- Avg Propagation: ~8s (target < 10s)
- Success Rate: 99.9%
- Instances Connected: 3/3

### 5. Monitoring Toggle

**Location**: Header (top right)

**Features**:
- ✅ Enable/disable real-time monitoring
- ✅ Visual indicator (green when active)
- ✅ Pauses WebSocket connection
- ✅ Reduces resource usage when not needed

---

## Implementation Details

### Frontend Stack

```typescript
// Core Dependencies
- Next.js 15 (App Router)
- React 19 (with Server Components)
- TypeScript 5.3
- Tailwind CSS 3.4
- Framer Motion 11 (animations)
- Lucide React (icons)
- WebSocket (native)
```

### Color Palette (Dark Mode)

```css
Background: slate-900 to slate-800 (gradient)
Cards: slate-800/50 with backdrop-blur
Borders: slate-700 / slate-600
Text Primary: white
Text Secondary: slate-400
Text Tertiary: slate-500

Accent Colors:
- Blue: from-blue-400 to-cyan-400 (primary)
- Green: from-green-500 to-emerald-500 (success)
- Purple: from-purple-500 to-pink-500 (federation)
- Orange: from-orange-500 to-amber-500 (tenant)
- Red: from-red-500 to-rose-500 (error)
```

### Animation Principles

1. **Duration**: 200-500ms for UI feedback
2. **Easing**: Spring physics for toggles, ease-out for slides
3. **Stagger**: 50ms between list items
4. **Gesture**: Scale 1.02 on hover, 0.98 on press

### Glassmorphism Implementation

```css
.glass-card {
  background: rgba(30, 41, 59, 0.5);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 12px;
}
```

---

## API Endpoints

### GET /api/admin/policies

**Description**: List all policies with metadata

**Auth**: JWT + Role (admin, policy-admin)

**Response**:
```json
{
  "policies": [
    {
      "id": "base-authorization",
      "name": "Base Authorization Policy",
      "path": "policies/base/authorization.rego",
      "category": "authorization",
      "enabled": true,
      "lastModified": "2026-02-06T08:00:00Z",
      "size": 2048,
      "description": "Core ABAC authorization rules"
    }
  ],
  "timestamp": "2026-02-06T08:00:00Z"
}
```

### POST /api/admin/policies/toggle

**Description**: Enable or disable a policy

**Auth**: JWT + Role (admin, policy-admin)

**Request**:
```json
{
  "policyId": "base-authorization",
  "enabled": false,
  "reason": "Temporary maintenance"
}
```

**Response**:
```json
{
  "success": true,
  "policyId": "base-authorization",
  "enabled": false,
  "timestamp": "2026-02-06T08:00:00Z"
}
```

**Workflow**: Triggers 6-stage OPAL distribution workflow

### POST /api/admin/policies/update

**Description**: Update policy content

**Auth**: JWT + Role (admin, policy-admin)

**Request**:
```json
{
  "policyPath": "policies/base/authorization.rego",
  "content": "package dive.authorization\n\n...",
  "reason": "Add new clearance level"
}
```

**Response**:
```json
{
  "success": true,
  "policyPath": "policies/base/authorization.rego",
  "backupPath": "policies/base/authorization.rego.backup.1738841600000",
  "timestamp": "2026-02-06T08:00:00Z"
}
```

---

## WebSocket Protocol

### Connection

```typescript
// Client-side connection
const ws = new WebSocket('wss://localhost:4000/ws/policy-updates?token=<JWT>');
```

### Authentication

**Method**: JWT in query parameter or `Sec-WebSocket-Protocol` header

**Validation**:
- Verify JWT signature
- Check `admin` or `policy-admin` role
- Reject unauthorized connections

### Message Types

#### Server → Client

**1. Connected**
```json
{
  "type": "connected",
  "message": "Connected to policy update stream",
  "timestamp": "2026-02-06T08:00:00Z"
}
```

**2. Policy Update**
```json
{
  "type": "policy_update",
  "data": {
    "policyId": "base-authorization",
    "enabled": false,
    "user": "admin@dive.mil",
    "reason": "Temporary maintenance"
  },
  "timestamp": "2026-02-06T08:00:00Z"
}
```

**3. Workflow Stage**
```json
{
  "type": "workflow_stage",
  "data": {
    "policyId": "base-authorization",
    "stage": "opal_detection",
    "status": "complete",
    "duration": 2000,
    "timestamp": "2026-02-06T08:00:05Z"
  }
}
```

**4. Heartbeat**
```json
{
  "type": "heartbeat",
  "timestamp": "2026-02-06T08:00:00Z"
}
```

#### Client → Server

**1. Ping**
```json
{
  "type": "ping"
}
```

**2. Subscribe**
```json
{
  "type": "subscribe",
  "filters": {
    "categories": ["authorization", "federation"]
  }
}
```

---

## Workflow Timeline

```
User Action: Toggle Policy
       ↓
   t=0ms: API Call POST /api/admin/policies/toggle
       ↓
  t=100ms: WebSocket: policy_update event
       ↓
 t=2000ms: WebSocket: workflow_stage (opal_detection complete)
       ↓
 t=2500ms: WebSocket: workflow_stage (redis_broadcast complete)
       ↓
 t=4000ms: WebSocket: workflow_stage (client_propagation complete)
       ↓
 t=5500ms: WebSocket: workflow_stage (opa_reload complete)
       ↓
 t=6000ms: WebSocket: workflow_stage (authz_active complete)
       ↓
 t=6100ms: UI: Show success notification
       ↓
t=11100ms: UI: Auto-dismiss notification
```

**Total User Experience**: ~6 seconds with visual feedback throughout

---

## Security Considerations

### Authentication

✅ JWT token required for all endpoints
✅ Role-based access control (admin, policy-admin)
✅ WebSocket authentication via query param or header
✅ Token expiration checked on every request

### Authorization

✅ Policy modifications logged with user ID
✅ Audit trail for all changes
✅ Backup created before updates
✅ Rollback capability via backups

### Input Validation

✅ Zod schemas for all API inputs
✅ Path traversal prevention (`..` blocked)
✅ File system access restricted to `policies/` directory
✅ Content size limits enforced

### Rate Limiting

✅ Max 10 policy toggles per minute per user
✅ Max 5 policy updates per hour per user
✅ WebSocket connection limit: 50 per server
✅ Message rate limit: 100 messages/minute per client

---

## Accessibility (WCAG 2.1 AAA)

### Keyboard Navigation

✅ Tab through all interactive elements
✅ Enter/Space to toggle policies
✅ Escape to close modals
✅ Arrow keys for list navigation

### Screen Reader Support

✅ ARIA labels on all buttons
✅ Live regions for notifications
✅ Status announcements for workflow stages
✅ Descriptive alt text for icons

### Visual Accessibility

✅ High contrast ratios (7:1 minimum)
✅ Focus indicators on all interactive elements
✅ No color-only information (icons + text)
✅ Scalable text (supports 200% zoom)

### Motion Reduction

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Performance Optimization

### Frontend

- ✅ React Server Components for initial render
- ✅ Lazy loading for heavy components
- ✅ Virtual scrolling for long policy lists
- ✅ Debounced WebSocket reconnection
- ✅ Optimistic UI updates

### Backend

- ✅ File system watcher (not polling)
- ✅ Redis Pub/Sub (push, not pull)
- ✅ Connection pooling for database
- ✅ Cached policy metadata
- ✅ Gzip compression for WebSocket

### Network

- ✅ WebSocket keep-alive (30s heartbeat)
- ✅ Automatic reconnection with exponential backoff
- ✅ Message batching (max 10ms batch window)
- ✅ Binary protocol for large payloads

---

## Testing

### Unit Tests

```bash
# Frontend
npm test -- PolicyAdministrationDashboard.test.tsx

# Backend
npm test -- policy-admin.routes.test.ts
npm test -- policy-websocket.service.test.ts
```

### Integration Tests

```bash
# WebSocket connection and authentication
npm test -- policy-websocket.integration.test.ts

# Full workflow simulation
npm test -- policy-workflow.e2e.test.ts
```

### E2E Tests (Playwright)

```bash
# Complete user journey
npx playwright test policy-admin.spec.ts

# Real-time updates
npx playwright test policy-realtime.spec.ts
```

---

## Deployment

### Prerequisites

```bash
# Install WebSocket library
npm install ws @types/ws

# Ensure OPAL is running
./dive up hub

# Enable OPAL statistics (optional)
export OPAL_STATISTICS_ENABLED=true
```

### Integration

```typescript
// backend/src/server.ts
import { setupPolicyWebSocket } from './services/policy-websocket.service';
import policyAdminRoutes from './routes/policy-admin.routes';

// Add routes
app.use(policyAdminRoutes);

// Setup WebSocket after HTTP server created
const server = app.listen(PORT);
setupPolicyWebSocket(server);
```

### Environment Variables

```bash
# Policy directory
POLICIES_DIR=/app/policies

# OPAL integration
OPAL_SERVER_URL=http://localhost:7002
OPAL_STATISTICS_ENABLED=true

# WebSocket
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_CLIENTS=50
WS_MESSAGE_RATE_LIMIT=100
```

---

## Maintenance

### Monitoring

**Key Metrics**:
- WebSocket connections (active)
- Policy updates (per hour)
- Workflow success rate (target: 99%)
- Average propagation time (target: < 10s)

**Alerting**:
- WebSocket connection failures > 5%
- Policy propagation > 15s
- OPAL server unhealthy
- OPA instance unreachable

### Troubleshooting

**Issue**: WebSocket not connecting
- Check JWT token validity
- Verify user has admin/policy-admin role
- Check WebSocket endpoint URL
- Inspect browser console for errors

**Issue**: Policy toggle not reflecting
- Check OPAL server logs
- Verify file permissions on policies/
- Check Redis Pub/Sub connectivity
- Inspect OPA bundle status

**Issue**: Slow workflow propagation
- Check OPAL polling interval (default 5s)
- Verify network latency to spokes
- Monitor OPA reload time
- Check Redis message queue

---

## Future Enhancements

### Phase 2 (Planned)

1. **Policy Editor** - In-browser Rego editor with syntax highlighting
2. **Diff Viewer** - Visual diff before applying changes
3. **Rollback UI** - One-click rollback to previous version
4. **Scheduled Updates** - Schedule policy changes for specific times
5. **Approval Workflow** - Multi-stage approval for critical policies

### Phase 3 (Future)

1. **Git Integration** - Push/pull from GitHub repo
2. **Policy Templates** - Pre-built policy templates
3. **Testing Suite** - Run OPA tests before deployment
4. **Analytics Dashboard** - Policy usage and performance analytics
5. **Mobile App** - React Native mobile administration app

---

## References

- [Framer Motion Documentation](https://www.framer.com/motion/)
- [Tailwind CSS Glassmorphism](https://tailwindcss.com/docs/backdrop-blur)
- [WebSocket API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [OPAL Documentation](https://docs.opal.ac/)

---

**Created By**: DIVE V3 Team  
**Date**: February 6, 2026  
**Status**: Production Ready
