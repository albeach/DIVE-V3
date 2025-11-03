# Navigation Consolidation Implementation Guide

## Quick Start: What Gets Built When

### Week 1: Foundation (Immediate Changes)
1. **Simplify Main Navigation** (Day 1-2)
   - Reduce from 7 to 5 primary items
   - Consolidate Policies + Policy Lab → Policy Center
   - Move Upload into Resources Hub
   - Add Standards Lens as primary nav item

2. **Create Standards Lens Toggle** (Day 2-3)
   - Enhance existing toggle with persistent state
   - Add visual mode indicators
   - Implement smooth transitions

3. **Build Journey Map Component** (Day 3-5)
   - Basic dual-layer visualization
   - Static data initially
   - Add to dashboard

### Week 2: Core Visualizations
1. **Attribute Diff Viewer** (Day 1-2)
2. **Split-Screen Object Lens** (Day 3-4)
3. **Comparison Matrix** (Day 5)

### Week 3: Integration & Polish
1. **Policy Simulator** (Day 1-3)
2. **Mobile Optimization** (Day 4)
3. **Performance Tuning** (Day 5)

### Week 4: Testing & Launch
1. **User Testing** (Day 1-2)
2. **Bug Fixes** (Day 3-4)
3. **Documentation & Launch** (Day 5)

---

## Detailed Implementation Steps

### Step 1: Update Navigation Structure

#### A. Modify navigation.tsx

```typescript
// frontend/src/components/navigation.tsx

// OLD STRUCTURE (current):
const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Documents', href: '/resources', icon: FileText },
  { name: 'Upload', href: '/upload', icon: ArrowUpCircle },
  { name: 'Policies', href: '/policies', icon: ScrollText },
  { name: 'Compliance', href: '/compliance', icon: CheckCircle2 },
  { name: 'Policy Lab', href: '/policies/lab', icon: FlaskConical },
];

// NEW STRUCTURE (consolidated):
const navItems = [
  { 
    name: 'Dashboard', 
    href: '/dashboard', 
    icon: LayoutDashboard,
    description: 'Overview and quick stats',
    hasMegaMenu: false
  },
  { 
    name: 'Resources Hub', // RENAMED & EXPANDED
    href: '/resources', 
    icon: FileText,
    description: 'Documents, upload, and ZTDF operations',
    hasMegaMenu: true,
    megaMenuItems: [
      { 
        category: 'Browse & Search', 
        items: [
          { name: 'All Documents', href: '/resources', icon: Library },
          { name: 'Advanced Search', href: '/resources?advanced=true', icon: Search },
          { name: 'Recent Activity', href: '/resources?sort=recent', icon: Clock },
        ]
      },
      { 
        category: 'Manage', 
        items: [
          { name: 'Upload Document', href: '/resources/upload', icon: ArrowUpCircle }, // MOVED
          { name: 'Bulk Operations', href: '/resources/bulk', icon: Package },
          { name: 'Request Access', href: '/resources/request', icon: Unlock },
        ]
      },
      { 
        category: 'ZTDF/KAS', 
        items: [
          { name: 'Encrypted Resources', href: '/resources?filter=encrypted', icon: Lock },
          { name: 'KAS Dashboard', href: '/resources/kas', icon: Key },
          { name: 'Decrypt History', href: '/resources/decrypt-log', icon: History },
        ]
      }
    ]
  },
  { 
    name: 'Policy Center', // CONSOLIDATED
    href: '/policies', 
    icon: ScrollText,
    description: 'Policies, testing lab, and compliance',
    hasMegaMenu: true,
    megaMenuItems: [
      { 
        category: 'Active Policies', 
        items: [
          { name: 'View All', href: '/policies', icon: ScrollText },
          { name: 'By Classification', href: '/policies?group=classification', icon: Shield },
          { name: 'By Country', href: '/policies?group=country', icon: Globe },
        ]
      },
      { 
        category: 'Policy Lab', // INTEGRATED
        items: [
          { name: 'Evaluate Policy', href: '/policies/lab?tab=evaluate', icon: FlaskConical },
          { name: 'Compare Policies', href: '/policies/lab?tab=compare', icon: GitCompare },
          { name: 'Upload & Test', href: '/policies/lab?tab=upload', icon: Upload },
        ]
      },
      { 
        category: 'Compliance', // MOVED HERE
        items: [
          { name: 'Compliance Dashboard', href: '/policies/compliance', icon: CheckCircle2 },
          { name: 'Audit Reports', href: '/policies/audit', icon: FileCheck },
          { name: 'Standards Mapping', href: '/policies/standards', icon: Map },
        ]
      }
    ]
  },
  { 
    name: 'Standards Lens', // NEW PRIMARY FEATURE
    href: '/standards', 
    icon: Layers,
    description: 'Visualize ADatP-5663 vs ACP-240',
    badge: { text: 'NEW', variant: 'new' },
    hasMegaMenu: true,
    megaMenuItems: [
      { 
        category: 'Visualizations', 
        items: [
          { name: 'Journey Map', href: '/standards/journey', icon: Route },
          { name: 'Attribute Comparison', href: '/standards/attributes', icon: GitBranch },
          { name: 'Enforcement Layers', href: '/standards/enforcement', icon: Layers2 },
        ]
      },
      { 
        category: 'Interactive', 
        items: [
          { name: 'Policy Simulator', href: '/standards/simulator', icon: Play },
          { name: 'Decision Replay', href: '/standards/replay', icon: Rewind },
          { name: 'Live Demo', href: '/standards/demo', icon: Tv },
        ]
      },
      { 
        category: 'Learn', 
        items: [
          { name: 'Federation (5663)', href: '/standards/learn/federation', icon: Users },
          { name: 'Object Security (240)', href: '/standards/learn/object', icon: Lock },
          { name: 'Integration Guide', href: '/standards/guide', icon: BookOpen },
        ]
      }
    ]
  },
  // Compliance removed from top-level (moved under Policy Center)
];
```

#### B. Update Route Structure

```bash
# Move upload page under resources
mv frontend/src/app/upload frontend/src/app/resources/upload

# Move compliance under policies
mv frontend/src/app/compliance frontend/src/app/policies/compliance

# Create new standards section
mkdir -p frontend/src/app/standards/{journey,attributes,enforcement,simulator,replay,demo,learn,guide}
```

### Step 2: Create Consolidated Resources Hub

#### A. Update Resources Layout

```typescript
// frontend/src/app/resources/layout.tsx
import { ResourcesNav } from '@/components/resources/resources-nav';

export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full">
      {/* Sidebar navigation for resources */}
      <ResourcesNav />
      
      {/* Main content area */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
```

#### B. Create Resources Navigation Component

```typescript
// frontend/src/components/resources/resources-nav.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  FileText, 
  Upload, 
  Search, 
  Lock, 
  Key, 
  History,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavSection {
  title: string;
  items: {
    label: string;
    href: string;
    icon: any;
    badge?: string;
  }[];
}

const sections: NavSection[] = [
  {
    title: 'Browse',
    items: [
      { label: 'All Documents', href: '/resources', icon: FileText },
      { label: 'Advanced Search', href: '/resources/search', icon: Search },
    ]
  },
  {
    title: 'Manage',
    items: [
      { label: 'Upload Document', href: '/resources/upload', icon: Upload, badge: 'Quick' },
      { label: 'Bulk Operations', href: '/resources/bulk', icon: FileText },
    ]
  },
  {
    title: 'ZTDF/KAS',
    items: [
      { label: 'Encrypted Resources', href: '/resources/encrypted', icon: Lock },
      { label: 'KAS Dashboard', href: '/resources/kas', icon: Key },
      { label: 'Decrypt History', href: '/resources/history', icon: History },
    ]
  }
];

export function ResourcesNav() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>(['Browse']);
  
  const toggleSection = (title: string) => {
    setExpandedSections(prev =>
      prev.includes(title)
        ? prev.filter(t => t !== title)
        : [...prev, title]
    );
  };
  
  return (
    <nav className="w-64 bg-gray-50 border-r border-gray-200 p-4 space-y-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-lg font-bold text-gray-900">Resources Hub</h2>
        <span className="text-xs text-gray-500">Unified Access</span>
      </div>
      
      {sections.map((section) => (
        <div key={section.title}>
          <button
            onClick={() => toggleSection(section.title)}
            className="w-full flex items-center justify-between px-2 py-1 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span>{section.title}</span>
            {expandedSections.includes(section.title) ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.includes(section.title) && (
            <div className="mt-2 space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                      isActive
                        ? "bg-gradient-to-r from-[#4497ac]/10 to-[#90d56a]/10 text-[#4497ac] font-medium"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-[#90d56a] text-white rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
```

### Step 3: Create Standards Lens Primary Feature

#### A. Standards Lens Landing Page

```typescript
// frontend/src/app/standards/page.tsx
'use client';

import { useState } from 'react';
import { DualLayerJourneyMap } from '@/components/standards/DualLayerJourney';
import { AttributeDiffViewer } from '@/components/standards/AttributeDiff';
import { ComparisonMatrix } from '@/components/standards/ComparisonMatrix';
import { StandardsLensToggle } from '@/components/standards/StandardsLensToggle';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';

export default function StandardsLensPage() {
  const [activeView, setActiveView] = useState<'journey' | 'attributes' | 'matrix'>('journey');
  
  return (
    <div className="container mx-auto px-6 py-8">
      {/* Hero Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#4497ac] to-[#90d56a] bg-clip-text text-transparent">
            Standards Lens
          </h1>
          <StandardsLensToggle />
        </div>
        <p className="text-gray-600 max-w-3xl">
          Visualize how ADatP-5663 (Federation) and ACP-240 (Object Security) work together 
          to protect coalition resources through complementary enforcement layers.
        </p>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
          <div className="text-blue-600 font-bold text-2xl">ADatP-5663</div>
          <div className="text-sm text-blue-700">Federation & Identity</div>
          <div className="mt-2 text-xs text-gray-600">
            Session-level access control
          </div>
        </div>
        <div className="bg-teal-50 rounded-xl p-4 border border-teal-200">
          <div className="text-teal-600 font-bold text-2xl">Shared ABAC</div>
          <div className="text-sm text-teal-700">Common Decision Logic</div>
          <div className="mt-2 text-xs text-gray-600">
            Attribute-based enforcement
          </div>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <div className="text-amber-600 font-bold text-2xl">ACP-240</div>
          <div className="text-sm text-amber-700">Data-Centric Security</div>
          <div className="mt-2 text-xs text-gray-600">
            Object-level protection
          </div>
        </div>
      </div>
      
      {/* Main Visualization Tabs */}
      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="journey">Journey Map</TabsTrigger>
          <TabsTrigger value="attributes">Attribute Comparison</TabsTrigger>
          <TabsTrigger value="matrix">Capability Matrix</TabsTrigger>
        </TabsList>
        
        <TabsContent value="journey" className="mt-6">
          <DualLayerJourneyMap
            mode="split"
            animateOnMount={true}
            federationFlow={federationFlowData}
            objectFlow={objectFlowData}
            sharedDecisionPoints={sharedDecisionPoints}
          />
        </TabsContent>
        
        <TabsContent value="attributes" className="mt-6">
          <AttributeDiffViewer
            federationAttributes={federationAttributes}
            objectAttributes={objectAttributes}
            mode="side-by-side"
          />
        </TabsContent>
        
        <TabsContent value="matrix" className="mt-6">
          <ComparisonMatrix
            capabilities={comparisonData}
            filterOptions={['All', 'Common', 'Different']}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

#### B. Enhanced Standards Lens Toggle

```typescript
// frontend/src/components/standards/StandardsLensToggle.tsx
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Lock, Layers, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStandardsLens } from '@/hooks/useStandardsLens';

type LensMode = 'federation' | 'object' | 'unified';

export function StandardsLensToggle() {
  const { mode, setMode } = useStandardsLens();
  const [showTooltip, setShowTooltip] = useState(false);
  
  const modes: { value: LensMode; label: string; icon: any; color: string }[] = [
    { value: 'federation', label: 'Federation', icon: Users, color: 'blue' },
    { value: 'unified', label: 'Unified', icon: Layers, color: 'teal' },
    { value: 'object', label: 'Object', icon: Lock, color: 'amber' },
  ];
  
  return (
    <div className="relative">
      {/* Toggle Container */}
      <div className="bg-white rounded-full shadow-lg border border-gray-200 p-1 flex items-center">
        {/* Sliding Background */}
        <motion.div
          className={cn(
            "absolute h-10 rounded-full",
            mode === 'federation' && "bg-gradient-to-r from-blue-500 to-blue-600",
            mode === 'object' && "bg-gradient-to-r from-amber-500 to-amber-600",
            mode === 'unified' && "bg-gradient-to-r from-teal-500 to-cyan-500"
          )}
          initial={false}
          animate={{
            x: mode === 'federation' ? 0 : mode === 'unified' ? 128 : 256,
            width: 120,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
        
        {/* Mode Buttons */}
        {modes.map((m) => {
          const Icon = m.icon;
          const isActive = mode === m.value;
          
          return (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                "relative z-10 flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200",
                "min-w-[120px] justify-center",
                isActive ? "text-white" : "text-gray-600 hover:text-gray-900"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{m.label}</span>
            </button>
          );
        })}
        
        {/* Info Button */}
        <button
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="ml-2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
      
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full mt-2 right-0 w-80 bg-gray-900 text-white rounded-lg shadow-xl p-4 text-sm z-50"
          >
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 text-blue-400 font-medium mb-1">
                  <Users className="w-4 h-4" />
                  Federation View (ADatP-5663)
                </div>
                <p className="text-gray-300 text-xs">
                  Shows identity federation flow, token generation, and session-based access control.
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-2 text-amber-400 font-medium mb-1">
                  <Lock className="w-4 h-4" />
                  Object View (ACP-240)
                </div>
                <p className="text-gray-300 text-xs">
                  Shows data-centric security, ZTDF encryption, and object-level access control.
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-2 text-teal-400 font-medium mb-1">
                  <Layers className="w-4 h-4" />
                  Unified View
                </div>
                <p className="text-gray-300 text-xs">
                  Shows both standards working together with shared ABAC decision points.
                </p>
              </div>
            </div>
            
            {/* Arrow */}
            <div className="absolute -top-2 right-4 w-4 h-4 bg-gray-900 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

### Step 4: Update Admin Portal Structure

#### A. Consolidate Admin Items

```typescript
// In navigation.tsx, update admin items from 9 to 4 logical groups:

const adminItems = [
  { 
    name: 'Operations', // NEW: Combines Dashboard + Logs
    href: '/admin/operations', 
    icon: BarChart3,
    description: 'Dashboard, metrics, and logs',
    children: [
      { name: 'Dashboard', href: '/admin/dashboard' },
      { name: 'Audit Logs', href: '/admin/logs' },
      { name: 'Performance', href: '/admin/performance' },
    ]
  },
  { 
    name: 'Identity & Access', // NEW: Combines IdP + Certificates
    href: '/admin/identity', 
    icon: Shield,
    description: 'IdP management and certificates',
    badge: approvalCount > 0 ? String(approvalCount) : null,
    children: [
      { name: 'IdP Management', href: '/admin/idp' },
      { name: 'Certificates', href: '/admin/certificates' },
      { name: 'Approvals', href: '/admin/approvals', badge: '3' },
    ]
  },
  { 
    name: 'Governance', // RENAMED from Analytics
    href: '/admin/governance', 
    icon: GitBranch,
    description: 'Policy governance and compliance',
    children: [
      { name: 'Analytics', href: '/admin/analytics' },
      { name: 'Compliance', href: '/admin/compliance' },
      { name: 'Reports', href: '/admin/reports' },
    ]
  },
  { 
    name: 'Integration', // PROMOTED
    href: '/admin/integration', 
    icon: Plug,
    description: 'API docs and integration guides',
    badge: 'NEW',
    children: [
      { name: 'API Documentation', href: '/admin/api' },
      { name: 'Federation Guide', href: '/integration/federation-vs-object' },
      { name: 'Webhooks', href: '/admin/webhooks' },
    ]
  },
];
```

### Step 5: Mobile Navigation Optimization

```typescript
// frontend/src/components/navigation/mobile-nav.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, FileText, ScrollText, Layers, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const mobileNavItems = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Resources', href: '/resources', icon: FileText },
  { name: 'Policies', href: '/policies', icon: ScrollText },
  { name: 'Standards', href: '/standards', icon: Layers, badge: 'NEW' },
  { name: 'Menu', href: '#', icon: Menu, isMenu: true },
];

export function MobileNavigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  
  return (
    <>
      {/* Bottom Tab Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 lg:hidden">
        <div className="flex justify-around items-center h-16">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href) && !item.isMenu;
            
            if (item.isMenu) {
              return (
                <button
                  key={item.name}
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex flex-col items-center justify-center p-2"
                >
                  <Icon className="w-6 h-6 text-gray-600" />
                  <span className="text-xs mt-1 text-gray-600">{item.name}</span>
                </button>
              );
            }
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center p-2 relative",
                  isActive && "text-[#4497ac]"
                )}
              >
                <Icon className={cn(
                  "w-6 h-6",
                  isActive ? "text-[#4497ac]" : "text-gray-600"
                )} />
                <span className={cn(
                  "text-xs mt-1",
                  isActive ? "text-[#4497ac] font-medium" : "text-gray-600"
                )}>
                  {item.name}
                </span>
                {item.badge && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-[#90d56a] text-white text-[9px] font-bold rounded-full">
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-[#4497ac] to-[#90d56a] rounded-full"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* Slide-up Menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />
            
            {/* Menu Panel */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30 }}
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 lg:hidden max-h-[80vh] overflow-y-auto"
            >
              {/* Handle */}
              <div className="flex justify-center py-2">
                <div className="w-12 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* Menu Content */}
              <div className="p-6 pb-20">
                {/* Quick Actions, Admin Links, etc. */}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
```

## Visual Mockups

### Desktop Navigation (Before & After)

```
BEFORE (Current):
┌─────────────────────────────────────────────────────────────┐
│ DIVE V3  Dashboard Documents Upload Policies Compliance Lab │
└─────────────────────────────────────────────────────────────┘

AFTER (Consolidated):
┌─────────────────────────────────────────────────────────────┐
│ DIVE V3  Dashboard Resources▾ Policies▾ Standards▾ [User▾] │
│                    │         │         │                     │
│                    └─Browse  └─Active  └─Journey Map  [NEW] │
│                      Upload    Lab       Attributes         │
│                      ZTDF      Comply    Simulator          │
└─────────────────────────────────────────────────────────────┘
```

### Mobile Navigation

```
┌─────────────┐
│             │
│   Content   │
│             │
├─────────────┤
│ 🏠 📄 📜 🔀 ☰│  <- Bottom tabs with Standards icon
└─────────────┘
```

## Migration Checklist

- [ ] Update navigation.tsx with new structure
- [ ] Create redirect rules for moved pages
- [ ] Update all internal links
- [ ] Test mega menu interactions
- [ ] Verify mobile navigation
- [ ] Update breadcrumbs
- [ ] Test with all user roles
- [ ] Update documentation
- [ ] Create user announcement

## Performance Considerations

1. **Lazy Load Visualizations**
   ```typescript
   const StandardsVisualization = dynamic(
     () => import('@/components/standards/Visualization'),
     { 
       loading: () => <VisualizationSkeleton />,
       ssr: false 
     }
   );
   ```

2. **Preload Critical Routes**
   ```typescript
   // In navigation hover
   onMouseEnter={() => {
     router.prefetch('/standards/journey');
   }}
   ```

3. **Optimize Bundle Size**
   - Split visualization components into separate chunks
   - Use tree shaking for icon imports
   - Compress SVG assets

This implementation guide provides concrete steps to consolidate and simplify the navigation while integrating the standards visualizations as a primary feature of DIVE V3.
